// desktop/frontend/src/contexts/IdentityContext.tsx からの移植。
// Wails IdentityBinding / UserBinding 依存を IdentityService 注入に置き換えた。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Device } from "../domain/models/device";
import type { User } from "../domain/models/user";
import type { IdentityService } from "../services/identity-service";

/** ロール文字列の型エイリアス（domain の Role + 未取得状態の空文字） */
export type Role = "admin" | "editor" | "member" | "";

/** ロール階層判定: admin > editor > member */
export function isRoleAtLeast(actual: Role, required: Role): boolean {
  const order = { admin: 3, editor: 2, member: 1, "": 0 };
  return order[actual] >= order[required];
}

/**
 * IdentityContext は「フロントエンドが API 呼び出し時に渡す actorID」を一元管理する。
 *
 * - 本番モード: 常に LinkSelf 起動時の実 DID（realDID）を返す
 * - 開発モード: 設定画面のアイデンティティ切替で別ユーザーへ切替可能。
 *   switchIdentity で context が更新され、子コンポーネントは新 actorID で再 fetch する。
 */
export interface IdentityContextValue {
  /** 現在のアクター DID（API 呼び出しに使う） */
  currentActorID: string;
  /** 現在のアクターのロール（ロール別 UI ガードに使う、未取得時は空文字） */
  currentRole: Role;
  /** LinkSelf 起動時の実 DID（`[自分]` 表示用、本番では currentActorID と一致） */
  realDID: string;
  /** 開発モードフラグ（dev 限定 UI の表示判定に使う） */
  isDevMode: boolean;
  /** 切替可能ユーザー一覧（dev モードのみ取得済み、本番は空配列） */
  availableIdentities: User[];
  /** dev モードでアイデンティティを切替える */
  switchIdentity: (did: string) => Promise<void>;
  /** 切替可能ユーザー一覧を再取得する（ユーザー追加後など） */
  refreshAvailableIdentities: () => Promise<void>;
  /** 自分の ID がローカルに存在するか（false ならオンボーディングへ誘導） */
  hasIdentity: boolean;
  /** 起動時の identity 判定が完了したか（未完了中はゲートを描画しない） */
  identityReady: boolean;
  /** 新しい ID を作成して入室する（初回オンボーディング） */
  createIdentity: (name: string) => Promise<void>;
  /** 既存端末のペアリング URL/コードを取り込み、同一 ID で入室する */
  completePairing: (input: string) => Promise<void>;
  /** この ID に別端末を追加するペアリング用 URL（QR 内容）を作る */
  createPairingToken: () => Promise<{ url: string; expiresAt: number }>;
  /** この端末の deviceId */
  getCurrentDeviceId: () => Promise<string>;
  /** 自分の ID に紐づくデバイス一覧 */
  listDevices: () => Promise<Device[]>;
  /** デバイスのラベルを変更する */
  renameDevice: (deviceId: string, label: string) => Promise<void>;
  /** 当該デバイス以外を削除する */
  removeDevice: (deviceId: string) => Promise<void>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

interface IdentityProviderProps {
  children: ReactNode;
  service: IdentityService;
}

export function IdentityProvider({ children, service }: IdentityProviderProps) {
  const [currentActorID, setCurrentActorID] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<Role>("");
  const [realDID, setRealDID] = useState<string>("");
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [availableIdentities, setAvailableIdentities] = useState<User[]>([]);
  const [hasIdentity, setHasIdentity] = useState<boolean>(false);
  const [identityReady, setIdentityReady] = useState<boolean>(false);

  // 作成/ペアリング/復元後、User から context 状態を反映する。
  const applyIdentity = useCallback((user: User) => {
    setRealDID(user.id);
    setCurrentActorID(user.id);
    setCurrentRole(
      user.role === "admin" || user.role === "editor" || user.role === "member"
        ? user.role
        : "",
    );
    setHasIdentity(true);
  }, []);

  // currentActorID 変化時にロールを取得する
  const fetchCurrentRole = useCallback(
    async (did: string): Promise<Role> => {
      if (!did) return "";
      try {
        const u = await service.getUser(did);
        if (
          u &&
          (u.role === "admin" || u.role === "editor" || u.role === "member")
        ) {
          return u.role;
        }
      } catch (e) {
        console.error("getUser failed", e);
      }
      return "";
    },
    [service],
  );

  const refreshAvailableIdentities = useCallback(async () => {
    if (!isDevMode) {
      return;
    }
    try {
      const list = await service.listAvailableIdentities();
      setAvailableIdentities(list);
    } catch (e) {
      console.error("listAvailableIdentities failed", e);
    }
  }, [isDevMode, service]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        // 保存済み identity があれば自己ユーザーを復元する。
        await service.loadIdentity();
        const [real, current, dev, exists] = await Promise.all([
          service.getRealDID(),
          service.getCurrentActor(),
          service.isDevMode(),
          service.hasIdentity(),
        ]);
        if (cancelled) return;
        setRealDID(real);
        setCurrentActorID(current);
        setIsDevMode(dev);
        setHasIdentity(exists);
        const role = await fetchCurrentRole(current);
        if (!cancelled) setCurrentRole(role);
        if (dev) {
          const list = await service.listAvailableIdentities();
          if (!cancelled) {
            setAvailableIdentities(list);
          }
        }
      } catch (e) {
        console.error("IdentityProvider init failed", e);
      } finally {
        if (!cancelled) setIdentityReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [fetchCurrentRole, service]);

  const createIdentity = useCallback(
    async (name: string) => {
      const user = await service.createIdentity(name);
      applyIdentity(user);
    },
    [applyIdentity, service],
  );

  const completePairing = useCallback(
    async (text: string) => {
      const user = await service.completePairing(text);
      applyIdentity(user);
    },
    [applyIdentity, service],
  );

  const createPairingToken = useCallback(
    () => service.createPairingToken(),
    [service],
  );

  const getCurrentDeviceId = useCallback(
    () => service.getCurrentDeviceId(),
    [service],
  );

  const listDevices = useCallback(() => service.listDevices(), [service]);

  const renameDevice = useCallback(
    (deviceId: string, label: string) => service.renameDevice(deviceId, label),
    [service],
  );

  const removeDevice = useCallback(
    (deviceId: string) => service.removeDevice(deviceId),
    [service],
  );

  const switchIdentity = useCallback(
    async (did: string) => {
      await service.setCurrentActor(did);
      setCurrentActorID(did);
      const role = await fetchCurrentRole(did);
      setCurrentRole(role);
    },
    [fetchCurrentRole, service],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      currentActorID,
      currentRole,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
      hasIdentity,
      identityReady,
      createIdentity,
      completePairing,
      createPairingToken,
      getCurrentDeviceId,
      listDevices,
      renameDevice,
      removeDevice,
    }),
    [
      currentActorID,
      currentRole,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
      hasIdentity,
      identityReady,
      createIdentity,
      completePairing,
      createPairingToken,
      getCurrentDeviceId,
      listDevices,
      renameDevice,
      removeDevice,
    ],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityContextValue {
  const v = useContext(IdentityContext);
  if (!v) {
    throw new Error("useIdentity must be used inside IdentityProvider");
  }
  return v;
}

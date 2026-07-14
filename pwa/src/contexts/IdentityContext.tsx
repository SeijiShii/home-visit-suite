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
import type { Role as DomainRole, User } from "../domain/models/user";
import {
  SHARED_APPLIED_EVENT,
  type SharedAppliedDetail,
} from "../lib/linkself/shared-events";
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
  /** 現在のアクターの表示名（サイドバーの自己情報表示に使う、未取得時は空文字） */
  currentName: string;
  /** 自分の表示名を変更する（設定画面のプロフィール。identity と User レコードを更新） */
  renameSelf: (name: string) => Promise<void>;
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
  /** 新しい ID を作成して入室する（初回オンボーディング。招待参加時は role を指定） */
  createIdentity: (name: string, role?: DomainRole) => Promise<void>;
  /** 自分のロールを変更する（グループ参加成立時に招待ロールを採用する） */
  adoptRole: (role: DomainRole) => Promise<void>;
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
  const [currentName, setCurrentName] = useState<string>("");
  const [realDID, setRealDID] = useState<string>("");
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [availableIdentities, setAvailableIdentities] = useState<User[]>([]);
  const [hasIdentity, setHasIdentity] = useState<boolean>(false);
  const [identityReady, setIdentityReady] = useState<boolean>(false);

  // 作成/ペアリング/復元後、User から context 状態を反映する。
  const applyIdentity = useCallback((user: User) => {
    setRealDID(user.id);
    setCurrentActorID(user.id);
    setCurrentName(user.name);
    setCurrentRole(
      user.role === "admin" || user.role === "editor" || user.role === "member"
        ? user.role
        : "",
    );
    setHasIdentity(true);
  }, []);

  // currentActorID 変化時にロール・表示名を取得する
  const fetchCurrentSelf = useCallback(
    async (did: string): Promise<{ role: Role; name: string }> => {
      if (!did) return { role: "", name: "" };
      try {
        const u = await service.getUser(did);
        if (
          u &&
          (u.role === "admin" || u.role === "editor" || u.role === "member")
        ) {
          return { role: u.role, name: u.name };
        }
      } catch (e) {
        console.error("getUser failed", e);
      }
      return { role: "", name: "" };
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
        const self = await fetchCurrentSelf(current);
        if (!cancelled) {
          setCurrentRole(self.role);
          setCurrentName(self.name);
        }
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
  }, [fetchCurrentSelf, service]);

  const createIdentity = useCallback(
    async (name: string, role?: DomainRole) => {
      const user = await service.createIdentity(name, role);
      applyIdentity(user);
    },
    [applyIdentity, service],
  );

  const adoptRole = useCallback(
    async (role: DomainRole) => {
      const user = await service.setRole(role);
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
      const self = await fetchCurrentSelf(did);
      setCurrentRole(self.role);
      setCurrentName(self.name);
    },
    [fetchCurrentSelf, service],
  );

  const renameSelf = useCallback(
    async (name: string) => {
      const user = await service.setName(name);
      setCurrentName(user.name);
    },
    [service],
  );

  // ScopeNetwork 同期で users が更新されたら自分のロール・表示名を追従させる
  // （他端末の管理者による任免・改名がこの端末のゲート/サイドバーに反映される）。
  useEffect(() => {
    const onApplied = (e: Event) => {
      const { table } = (e as CustomEvent<SharedAppliedDetail>).detail;
      if (table !== "users" || !currentActorID) return;
      void fetchCurrentSelf(currentActorID).then((self) => {
        setCurrentRole(self.role);
        setCurrentName(self.name);
      });
    };
    window.addEventListener(SHARED_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(SHARED_APPLIED_EVENT, onApplied);
  }, [currentActorID, fetchCurrentSelf]);

  const value = useMemo<IdentityContextValue>(
    () => ({
      currentActorID,
      currentRole,
      currentName,
      renameSelf,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
      hasIdentity,
      identityReady,
      createIdentity,
      adoptRole,
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
      currentName,
      renameSelf,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
      hasIdentity,
      identityReady,
      createIdentity,
      adoptRole,
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

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

  // currentActorID 変化時にロールを取得する
  const fetchCurrentRole = useCallback(
    async (did: string): Promise<Role> => {
      if (!did) return "";
      try {
        const u = await service.getUser(did);
        if (u && (u.role === "admin" || u.role === "editor" || u.role === "member")) {
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
        const [real, current, dev] = await Promise.all([
          service.getRealDID(),
          service.getCurrentActor(),
          service.isDevMode(),
        ]);
        if (cancelled) return;
        setRealDID(real);
        setCurrentActorID(current);
        setIsDevMode(dev);
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
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [fetchCurrentRole, service]);

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
    }),
    [
      currentActorID,
      currentRole,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const v = useContext(IdentityContext);
  if (!v) {
    throw new Error("useIdentity must be used inside IdentityProvider");
  }
  return v;
}

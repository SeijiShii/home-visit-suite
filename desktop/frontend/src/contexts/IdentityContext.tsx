import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import * as IdentityBinding from "../../wailsjs/go/binding/IdentityBinding";
import { models } from "../../wailsjs/go/models";

/**
 * IdentityContext は「フロントエンドが API 呼び出し時に渡す actorID」を一元管理する。
 *
 * - 本番モード: 常に LinkSelf 起動時の実 DID（realDID）を返す
 * - 開発モード（HVS_DEV=1 で起動された場合）: 設定画面のアイデンティティ切替で
 *   別ユーザーへ切替可能。switchIdentity で context が更新され、子コンポーネントは
 *   新 actorID で再 fetch する。
 *
 * 仕様: docs/wants/CLAUDE.md「dev 用アイデンティティ切替基盤（G0）」
 */
export interface IdentityContextValue {
  /** 現在のアクター DID（API 呼び出しに使う） */
  currentActorID: string;
  /** LinkSelf 起動時の実 DID（`[自分]` 表示用、本番では currentActorID と一致） */
  realDID: string;
  /** 開発モードフラグ（dev 限定 UI の表示判定に使う） */
  isDevMode: boolean;
  /** 切替可能ユーザー一覧（dev モードのみ取得済み、本番は空配列） */
  availableIdentities: models.User[];
  /** dev モードでアイデンティティを切替える */
  switchIdentity: (did: string) => Promise<void>;
  /** 切替可能ユーザー一覧を再取得する（ユーザー追加後など） */
  refreshAvailableIdentities: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [currentActorID, setCurrentActorID] = useState<string>("");
  const [realDID, setRealDID] = useState<string>("");
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [availableIdentities, setAvailableIdentities] = useState<models.User[]>(
    [],
  );

  const refreshAvailableIdentities = useCallback(async () => {
    if (!isDevMode) {
      return;
    }
    try {
      const list = await IdentityBinding.ListAvailableIdentities();
      setAvailableIdentities(list);
    } catch (e) {
      console.error("ListAvailableIdentities failed", e);
    }
  }, [isDevMode]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [real, current, dev] = await Promise.all([
          IdentityBinding.GetRealDID(),
          IdentityBinding.GetCurrentActor(),
          IdentityBinding.IsDevMode(),
        ]);
        if (cancelled) return;
        setRealDID(real);
        setCurrentActorID(current);
        setIsDevMode(dev);
        if (dev) {
          const list = await IdentityBinding.ListAvailableIdentities();
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
  }, []);

  const switchIdentity = useCallback(async (did: string) => {
    await IdentityBinding.SetCurrentActor(did);
    setCurrentActorID(did);
  }, []);

  const value = useMemo<IdentityContextValue>(
    () => ({
      currentActorID,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
    }),
    [
      currentActorID,
      realDID,
      isDevMode,
      availableIdentities,
      switchIdentity,
      refreshAvailableIdentities,
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

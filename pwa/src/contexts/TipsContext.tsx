import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SettingsService } from "../services/settings-service";

export const TIP_INTERVAL_MS = 1500;
export const TIP_DISPLAY_MS = 5000;
export const TIP_MAX_ACTIVE = 5;
export const TIP_EXIT_MS = 280;

export interface TipInstance {
  id: string;
  key: string;
  exiting?: boolean;
}

interface TipsContextValue {
  showTips: (keys: string[]) => void;
  hideTip: (key: string) => Promise<void>;
  resetHiddenTips: () => Promise<void>;
  activeTips: TipInstance[];
  hiddenKeys: ReadonlySet<string>;
}

const TipsContext = createContext<TipsContextValue | null>(null);

interface TipsProviderProps {
  service: SettingsService;
  children: ReactNode;
}

let __tipIdSeq = 0;
function nextTipId(): string {
  __tipIdSeq += 1;
  return `tip-${__tipIdSeq}`;
}

export function TipsProvider({ service, children }: TipsProviderProps) {
  const [activeTips, setActiveTips] = useState<TipInstance[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const queueRef = useRef<string[]>([]);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const activeTipsRef = useRef<TipInstance[]>([]);
  const hiddenKeysRef = useRef<Set<string>>(new Set());
  // 非表示キーのロード完了前に showTips された要求の保留バッファ。
  // ロード前に表示すると保存済みの「表示しない」決定を無視してしまうため、
  // 完了までは表示せず、完了時にフィルタして流す。
  const hiddenLoadedRef = useRef(false);
  const pendingKeysRef = useRef<string[]>([]);

  // 活性 tips とミラー参照を同期
  useEffect(() => {
    activeTipsRef.current = activeTips;
  }, [activeTips]);
  useEffect(() => {
    hiddenKeysRef.current = hiddenKeys;
  }, [hiddenKeys]);

  const removeTip = useCallback((id: string) => {
    // まず exiting フラグを立てて CSS でフェードアウトを開始
    setActiveTips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    const displayTimer = displayTimersRef.current.get(id);
    if (displayTimer) {
      clearTimeout(displayTimer);
      displayTimersRef.current.delete(id);
    }
    // フェード完了後に state から除去
    setTimeout(() => {
      setActiveTips((prev) => prev.filter((t) => t.id !== id));
    }, TIP_EXIT_MS);
  }, []);

  const pushOne = useCallback(
    (key: string) => {
      // 重複抑制: 既に活性にあるならスキップ
      if (activeTipsRef.current.some((t) => t.key === key)) return;
      const id = nextTipId();
      const newTip: TipInstance = { id, key };

      setActiveTips((prev) => {
        // 先頭に unshift、上限超過なら末尾（最古）を除去
        const next = [newTip, ...prev];
        while (next.length > TIP_MAX_ACTIVE) {
          const removed = next.pop();
          if (removed) {
            const timer = displayTimersRef.current.get(removed.id);
            if (timer) {
              clearTimeout(timer);
              displayTimersRef.current.delete(removed.id);
            }
          }
        }
        return next;
      });

      const timer = setTimeout(() => removeTip(id), TIP_DISPLAY_MS);
      displayTimersRef.current.set(id, timer);
    },
    [removeTip],
  );

  const ensureInterval = useCallback(() => {
    if (intervalTimerRef.current !== null) return;
    intervalTimerRef.current = setInterval(() => {
      const next = queueRef.current.shift();
      if (next === undefined) {
        if (intervalTimerRef.current !== null) {
          clearInterval(intervalTimerRef.current);
          intervalTimerRef.current = null;
        }
        return;
      }
      pushOne(next);
    }, TIP_INTERVAL_MS);
  }, [pushOne]);

  const enqueueKeys = useCallback(
    (keys: string[]) => {
      const filtered = keys.filter((key) => {
        if (hiddenKeysRef.current.has(key)) return false;
        if (activeTipsRef.current.some((t) => t.key === key)) return false;
        if (queueRef.current.includes(key)) return false;
        return true;
      });
      if (filtered.length === 0) return;

      // 最初の1件は即座に表示（ユーザー体験向上）
      const [first, ...rest] = filtered;
      pushOne(first);

      if (rest.length > 0) {
        queueRef.current.push(...rest);
        ensureInterval();
      }
    },
    [pushOne, ensureInterval],
  );

  const showTips = useCallback(
    (keys: string[]) => {
      // 保存済み非表示キーのロード前は表示せず保留する（ロード完了時に流す）
      if (!hiddenLoadedRef.current) {
        for (const key of keys) {
          if (!pendingKeysRef.current.includes(key)) {
            pendingKeysRef.current.push(key);
          }
        }
        return;
      }
      enqueueKeys(keys);
    },
    [enqueueKeys],
  );

  // 初回マウントで hidden キーをロードし、保留中の表示要求を流す
  useEffect(() => {
    let cancelled = false;
    // service 差し替え時は新しい非表示集合のロード完了まで再び保留に戻す
    hiddenLoadedRef.current = false;
    const flush = (keys: string[]) => {
      if (cancelled) return;
      hiddenKeysRef.current = new Set(keys);
      setHiddenKeys(new Set(keys));
      hiddenLoadedRef.current = true;
      const pending = pendingKeysRef.current;
      pendingKeysRef.current = [];
      if (pending.length > 0) enqueueKeys(pending);
    };
    service
      .getHiddenTipKeys()
      .then(flush)
      .catch(() => {
        // 失敗時は空セット扱いでロード完了とする（tips が永久に出ないよりよい）
        flush([]);
      });
    return () => {
      cancelled = true;
    };
  }, [service, enqueueKeys]);

  const hideTip = useCallback(
    async (key: string) => {
      // 決定は即時反映（表示から除去）し、その後で永続化する
      hiddenKeysRef.current = new Set(hiddenKeysRef.current).add(key);
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      pendingKeysRef.current = pendingKeysRef.current.filter((k) => k !== key);
      // 活性・キューから即時除去
      setActiveTips((prev) => {
        const toRemove = prev.filter((t) => t.key === key);
        toRemove.forEach((t) => {
          const timer = displayTimersRef.current.get(t.id);
          if (timer) {
            clearTimeout(timer);
            displayTimersRef.current.delete(t.id);
          }
        });
        return prev.filter((t) => t.key !== key);
      });
      queueRef.current = queueRef.current.filter((k) => k !== key);
      try {
        await service.setTipHidden(key, true);
      } catch (e) {
        // 永続化失敗時もセッション中は非表示のまま。次回起動で再表示され得る
        console.warn("[tips] failed to persist hidden tip", key, e);
      }
    },
    [service],
  );

  const resetHiddenTips = useCallback(async () => {
    await service.resetHiddenTips();
    setHiddenKeys(new Set());
  }, [service]);

  // アンマウント時に全タイマクリア
  useEffect(() => {
    return () => {
      if (intervalTimerRef.current !== null) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
      displayTimersRef.current.forEach((timer) => clearTimeout(timer));
      displayTimersRef.current.clear();
    };
  }, []);

  const value: TipsContextValue = {
    showTips,
    hideTip,
    resetHiddenTips,
    activeTips,
    hiddenKeys,
  };

  return <TipsContext.Provider value={value}>{children}</TipsContext.Provider>;
}

export function useTips(): TipsContextValue {
  const ctx = useContext(TipsContext);
  if (!ctx) throw new Error("useTips must be used within TipsProvider");
  return ctx;
}

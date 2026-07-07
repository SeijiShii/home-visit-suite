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

  // 活性 tips とミラー参照を同期
  useEffect(() => {
    activeTipsRef.current = activeTips;
  }, [activeTips]);
  useEffect(() => {
    hiddenKeysRef.current = hiddenKeys;
  }, [hiddenKeys]);

  // 初回マウントで hidden キーをロード
  useEffect(() => {
    let cancelled = false;
    service
      .getHiddenTipKeys()
      .then((keys) => {
        if (!cancelled) setHiddenKeys(new Set(keys));
      })
      .catch(() => {
        // 失敗時は空セットのまま
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

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

  const showTips = useCallback(
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

  const hideTip = useCallback(
    async (key: string) => {
      await service.setTipHidden(key, true);
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
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

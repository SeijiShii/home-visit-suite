// ScopeNetwork 受信適用イベント（hvs:shared-applied）の購読フック。
// 指定テーブルのどれかに受信適用があったときコールバックを呼ぶ。
// 画面はこれで「他メンバー・他端末の変更が開いている画面に反映される」を実現する
// （docs/wants/01「同期スコープ」。イベント発火はテーブル単位 100ms 合流済み）。

import { useEffect, useRef } from "react";
import {
  SHARED_APPLIED_EVENT,
  type SharedAppliedDetail,
} from "../lib/linkself/shared-events";

export function useSharedApplied(
  tables: readonly string[],
  onApplied: () => void,
): void {
  // コールバック/テーブル配列の同一性に依存せず購読を張り直さない。
  const ref = useRef({ tables, onApplied });
  ref.current = { tables, onApplied };

  useEffect(() => {
    const handler = (e: Event) => {
      const { table } = (e as CustomEvent<SharedAppliedDetail>).detail;
      if (ref.current.tables.includes(table)) ref.current.onApplied();
    };
    window.addEventListener(SHARED_APPLIED_EVENT, handler);
    return () => window.removeEventListener(SHARED_APPLIED_EVENT, handler);
  }, []);
}

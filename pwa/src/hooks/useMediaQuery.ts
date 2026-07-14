// メディアクエリ購読フック。
// - useTouchPrimary: タッチ主体端末（スマホ・タブレット）判定。場所の直接編集
//   権限ゲートに使う（docs/wants/03「画面構成」/ 07「場所操作の権限」）。
//   マウス接続のタッチラップトップは hover 可能なため非タッチ扱いになる。
// - useNarrowViewport: 狭幅レイアウト判定。場所一覧の右ペイン/オーバーレイ
//   切り替えに使う（docs/wants/03「場所一覧と訪問記録の一覧」）。

import { useSyncExternalStore } from "react";

export const TOUCH_PRIMARY_QUERY = "(pointer: coarse) and (hover: none)";
export const NARROW_VIEWPORT_QUERY = "(max-width: 767px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}

/** タッチ主体端末（pointer: coarse かつ hover: none）なら true。 */
export function useTouchPrimary(): boolean {
  return useMediaQuery(TOUCH_PRIMARY_QUERY);
}

/** 狭幅ビューポート（767px 以下）なら true。 */
export function useNarrowViewport(): boolean {
  return useMediaQuery(NARROW_VIEWPORT_QUERY);
}

// useMediaQuery / useTouchPrimary: matchMedia の購読と変更追従。
// docs/wants/03「画面構成」（タッチ判定）/「場所一覧と訪問記録の一覧」（幅判定）

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useMediaQuery,
  useTouchPrimary,
  TOUCH_PRIMARY_QUERY,
} from "./useMediaQuery";

type Listener = (ev: { matches: boolean }) => void;

function installMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Set<Listener>>();
  const state = { ...initial };
  const mm = vi.fn((query: string) => ({
    matches: state[query] ?? false,
    media: query,
    addEventListener: (_: string, cb: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_: string, cb: Listener) => {
      listeners.get(query)?.delete(cb);
    },
  }));
  vi.stubGlobal("matchMedia", mm);
  return {
    set(query: string, matches: boolean) {
      state[query] = matches;
      listeners.get(query)?.forEach((cb) => cb({ matches }));
    },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("初期値は matchMedia の matches を返す", () => {
    installMatchMedia({ "(max-width: 767px)": true });
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(true);
  });

  it("メディアクエリの変化に追従する", () => {
    const ctl = installMatchMedia({ "(max-width: 767px)": false });
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(false);
    act(() => ctl.set("(max-width: 767px)", true));
    expect(result.current).toBe(true);
  });
});

describe("useTouchPrimary", () => {
  it("pointer: coarse かつ hover: none のとき true", () => {
    installMatchMedia({ [TOUCH_PRIMARY_QUERY]: true });
    const { result } = renderHook(() => useTouchPrimary());
    expect(result.current).toBe(true);
  });

  it("非タッチ環境では false", () => {
    installMatchMedia({});
    const { result } = renderHook(() => useTouchPrimary());
    expect(result.current).toBe(false);
  });
});

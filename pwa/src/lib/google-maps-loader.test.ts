// Google Maps JS API ローダーのタイミング検証。
// loading=async では script の load イベント時点で google.maps.Map は未定義
// （bootstrap のみ読了）のため、公式 callback パラメータで「API が完全に
// 使える時点」まで resolve を遅らせることを保証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LoaderModule = typeof import("./google-maps-loader");

async function freshModule(): Promise<LoaderModule> {
  // モジュール内の single-flight 状態をテストごとにリセットする
  vi.resetModules();
  return await import("./google-maps-loader");
}

function insertedScript(): HTMLScriptElement | null {
  return document.head.querySelector<HTMLScriptElement>(
    'script[src^="https://maps.googleapis.com/"]',
  );
}

function callbackNameOf(script: HTMLScriptElement): string {
  const m = /[?&]callback=([^&]+)/.exec(script.src);
  if (!m) throw new Error("callback param not found: " + script.src);
  return decodeURIComponent(m[1]);
}

function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("loadGoogleMapsApi", () => {
  beforeEach(() => {
    delete (window as { google?: unknown }).google;
  });

  afterEach(() => {
    insertedScript()?.remove();
    delete (window as { google?: unknown }).google;
  });

  it("script の load イベントだけでは resolve せず、callback 発火で resolve する", async () => {
    const mod = await freshModule();
    let settled = false;
    const p = mod.loadGoogleMapsApi("test-key").then(() => {
      settled = true;
    });

    const script = insertedScript();
    expect(script).not.toBeNull();
    // bootstrap 読了（この時点で google.maps.Map は未定義）
    script!.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    expect(settled).toBe(false);

    // API 完全読了時に Google が呼ぶ callback
    const cbName = callbackNameOf(script!);
    (window as unknown as Record<string, () => void>)[cbName]();
    await p;
    expect(settled).toBe(true);
  });

  it("script URL に API キーと loading=async が含まれる", async () => {
    const mod = await freshModule();
    void mod.loadGoogleMapsApi("my key");
    const script = insertedScript();
    expect(script!.src).toContain("key=my%20key");
    expect(script!.src).toContain("loading=async");
  });

  it("並行呼び出しは同一 Promise を返し script は 1 つだけ挿入される", async () => {
    const mod = await freshModule();
    const p1 = mod.loadGoogleMapsApi("test-key");
    const p2 = mod.loadGoogleMapsApi("test-key");
    expect(p1).toBe(p2);
    expect(
      document.head.querySelectorAll(
        'script[src^="https://maps.googleapis.com/"]',
      ).length,
    ).toBe(1);
    const script = insertedScript()!;
    (window as unknown as Record<string, () => void>)[callbackNameOf(script)]();
    await p1;
  });

  it("google.maps.Map が既に在れば script を挿入せず即 resolve する", async () => {
    const mod = await freshModule();
    (window as unknown as { google: unknown }).google = {
      maps: { Map: function MapStub() {} },
    };
    await mod.loadGoogleMapsApi("test-key");
    expect(insertedScript()).toBeNull();
  });

  it("callback が来ないままタイムアウトで reject し、次回呼び出しでリトライできる", async () => {
    vi.useFakeTimers();
    try {
      const mod = await freshModule();
      const p = mod.loadGoogleMapsApi("test-key");
      const rejection = expect(p).rejects.toThrow();
      // bootstrap は読了したが本体チャンクが来ない（callback 未発火）ケース
      insertedScript()!.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(mod.LOAD_TIMEOUT_MS + 1);
      await rejection;

      insertedScript()!.remove();
      const p2 = mod.loadGoogleMapsApi("test-key");
      expect(p2).not.toBe(p);
      const script2 = insertedScript()!;
      (window as unknown as Record<string, () => void>)[
        callbackNameOf(script2)
      ]();
      await p2;
    } finally {
      vi.useRealTimers();
    }
  });

  it("読み込み失敗で reject し、次回呼び出しでリトライできる", async () => {
    const mod = await freshModule();
    const p = mod.loadGoogleMapsApi("test-key");
    const script = insertedScript()!;
    script.dispatchEvent(new Event("error"));
    await expect(p).rejects.toThrow();

    script.remove();
    const p2 = mod.loadGoogleMapsApi("test-key");
    expect(p2).not.toBe(p);
    expect(insertedScript()).not.toBeNull();
    const script2 = insertedScript()!;
    (window as unknown as Record<string, () => void>)[
      callbackNameOf(script2)
    ]();
    await p2;
  });
});

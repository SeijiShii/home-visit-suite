// GeminiMapVision（Google Generative Language API による地図解析アダプタ）のテスト。fetch はモック。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 1/5。

import { describe, expect, it, vi } from "vitest";
import type { VisionExtraction } from "./ai-map-import";
import { GeminiMapVision } from "./gemini-map-vision";

// 座標は正規化後の 0〜1 比率（maxCoord ≤ 1.5 なので normalizeExtraction は素通し）。
const SAMPLE: VisionExtraction = {
  areaGuess: "成田市 成田周辺",
  landmarks: [{ label: "成田駅", pixel: { x: 0.12, y: 0.34 } }],
  boundaries: [
    {
      vertices: [
        { x: 0.01, y: 0.01 },
        { x: 0.2, y: 0.01 },
        { x: 0.2, y: 0.18 },
      ],
    },
  ],
  places: [
    {
      number: 1,
      pixel: { x: 0.06, y: 0.09 },
      label: "田中",
      address: "成田1-2",
    },
    { number: 2, pixel: { x: 0.13, y: 0.095 } },
  ],
};

// PNG マジックバイトで始まる最小の画像バイト列。
function pngBytes(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    .buffer;
}

function geminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as Response;
}

describe("GeminiMapVision", () => {
  it("Gemini の JSON 応答を VisionExtraction にパースする", async () => {
    const fetchFn = vi.fn(async () => geminiResponse(JSON.stringify(SAMPLE)));
    const vision = new GeminiMapVision({
      apiKey: "AIza-xxx",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const got = await vision.analyze(pngBytes());
    expect(got).toEqual(SAMPLE);
  });

  it("```json コードフェンスで囲まれた応答もパースする", async () => {
    const fenced = "```json\n" + JSON.stringify(SAMPLE) + "\n```";
    const fetchFn = vi.fn(async () => geminiResponse(fenced));
    const vision = new GeminiMapVision({
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const got = await vision.analyze(pngBytes());
    expect(got).toEqual(SAMPLE);
  });

  it("既定モデルとキーを generateContent エンドポイントに載せる", async () => {
    const fetchFn = vi.fn(async () => geminiResponse(JSON.stringify(SAMPLE)));
    const vision = new GeminiMapVision({
      apiKey: "AIza-secret",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await vision.analyze(pngBytes());

    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("gemini-3.1-flash-lite:generateContent");
    // API キーはクエリパラメータ ?key= で渡す
    expect(url).toContain("key=AIza-secret");
    // 画像は inline_data で送信される
    expect(String(init.body)).toContain("inline_data");
  });

  it("HTTP エラーは詳細付きで例外化する", async () => {
    const fetchFn = vi.fn(
      async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "invalid api key" } }),
        }) as Response,
    );
    const vision = new GeminiMapVision({
      apiKey: "bad",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(vision.analyze(pngBytes())).rejects.toThrow(
      /HTTP 400.*invalid api key/,
    );
  });
});

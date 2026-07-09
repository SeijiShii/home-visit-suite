// AnthropicMapVision（Claude vision による地図解析アダプタ）のテスト。fetch はモック。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 1/5。

import { describe, expect, it, vi } from "vitest";
import { AnthropicMapVision } from "./anthropic-map-vision";
import type { VisionExtraction } from "./ai-map-import";

const SAMPLE: VisionExtraction = {
  areaGuess: "成田市 成田周辺",
  landmarks: [{ label: "成田駅", pixel: { x: 120, y: 340 } }],
  boundaries: [
    {
      vertices: [
        { x: 10, y: 10 },
        { x: 200, y: 10 },
        { x: 200, y: 180 },
      ],
    },
  ],
  places: [
    { number: 1, pixel: { x: 60, y: 90 }, label: "田中", address: "成田1-2" },
    { number: 2, pixel: { x: 130, y: 95 } },
  ],
};

// PNG マジックバイトで始まる最小の画像バイト列。
function pngBytes(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    .buffer;
}

function anthropicResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
  } as Response;
}

describe("AnthropicMapVision", () => {
  it("Claude の JSON 応答を VisionExtraction にパースする", async () => {
    const fetchFn = vi.fn(async () =>
      anthropicResponse(JSON.stringify(SAMPLE)),
    );
    const vision = new AnthropicMapVision({
      apiKey: "sk-ant-xxx",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const got = await vision.analyze(pngBytes());
    expect(got).toEqual(SAMPLE);
  });

  it("```json コードフェンスで囲まれた応答もパースする", async () => {
    const fenced = "```json\n" + JSON.stringify(SAMPLE) + "\n```";
    const fetchFn = vi.fn(async () => anthropicResponse(fenced));
    const vision = new AnthropicMapVision({
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const got = await vision.analyze(pngBytes());
    expect(got.landmarks).toHaveLength(1);
    expect(got.places[0].number).toBe(1);
  });

  it("API キー・バージョン・ブラウザ直叩きヘッダと base64 画像を送る", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      anthropicResponse(JSON.stringify(SAMPLE)),
    );
    const vision = new AnthropicMapVision({
      apiKey: "sk-ant-secret",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await vision.analyze(pngBytes());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-secret");
    expect(headers["anthropic-version"]).toBeTruthy();
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(init.body as string);
    const imagePart = body.messages[0].content.find(
      (p: { type: string }) => p.type === "image",
    );
    expect(imagePart.source.type).toBe("base64");
    expect(imagePart.source.media_type).toBe("image/png");
    expect(typeof imagePart.source.data).toBe("string");
    expect(imagePart.source.data.length).toBeGreaterThan(0);
  });

  it("HTTP エラーは例外を投げる", async () => {
    const fetchFn = vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "invalid key" } }),
        }) as Response,
    );
    const vision = new AnthropicMapVision({
      apiKey: "bad",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(vision.analyze(pngBytes())).rejects.toThrow(/401/);
  });

  it("JSON として解釈できない応答は例外を投げる", async () => {
    const fetchFn = vi.fn(async () =>
      anthropicResponse("すみません、解析できませんでした。"),
    );
    const vision = new AnthropicMapVision({
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(vision.analyze(pngBytes())).rejects.toThrow();
  });

  it("JPEG マジックバイトは media_type=image/jpeg で送る", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      anthropicResponse(JSON.stringify(SAMPLE)),
    );
    const vision = new AnthropicMapVision({
      apiKey: "k",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    await vision.analyze(jpeg);
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string,
    );
    const imagePart = body.messages[0].content.find(
      (p: { type: string }) => p.type === "image",
    );
    expect(imagePart.source.media_type).toBe("image/jpeg");
  });
});

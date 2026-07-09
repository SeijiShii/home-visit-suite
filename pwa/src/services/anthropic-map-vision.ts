// Claude vision（Anthropic Messages API）による地図画像解析アダプタ。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 1（抽出）/ 5（トレース）。
//
// ブラウザから直接 Anthropic API を叩くため anthropic-dangerous-direct-browser-access を付す
// （ユーザー自身の API キーを設定画面で登録して利用する前提）。
// 画像は解析のため外部へ送信される（§プライバシー上の重要注意、同意ダイアログは UI 側）。

import type { MapVisionProvider, VisionExtraction } from "./ai-map-import";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 8192;

// 抽出スキーマ契約: この JSON だけを返すよう指示する（VisionExtraction と対応）。
const EXTRACTION_PROMPT = `あなたは地図画像の解析アシスタントです。この地図画像を解析し、次の JSON だけを出力してください（説明文・コードフェンスなし）。

{
  "areaGuess": "推定した地区の自由記述（例: 千葉県成田市成田周辺）",
  "landmarks": [{ "label": "ジオコーディング可能な住所・地名・施設名", "pixel": { "x": 数値, "y": 数値 } }],
  "boundaries": [{ "vertices": [{ "x": 数値, "y": 数値 }] }],
  "places": [{ "number": 整数, "pixel": { "x": 数値, "y": 数値 }, "label": "任意(表札名)", "address": "任意(住所)", "kind": "house または building" }]
}

- pixel は画像左上を原点 (0,0) とし、右が +x・下が +y のピクセル座標。
- landmarks は町名・丁目・駅・学校・寺社・公園・大型店など、実在の場所として住所検索できる手がかりを、画像内での位置とともに列挙する。多いほど接地精度が上がる。
- boundaries は地図に描かれた区域の境界線を、各区域ごとに頂点列としてトレースする。
- places は場所番号付きのマーカー。number は地図に書かれた番号。label/address は読み取れた場合のみ。kind は集合住宅（アパート・マンション等）と判別できれば "building"、それ以外は "house"。
- 手がかりが乏しく判断できない項目は空配列にする。推測で埋めない。`;

export interface AnthropicMapVisionOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  fetchFn?: typeof fetch;
}

type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** マジックバイトから画像 media type を判定する。 */
function detectMediaType(bytes: Uint8Array): MediaType {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  throw new Error(
    "AnthropicMapVision: 対応していない画像形式です（PNG/JPEG/WebP/GIF）",
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 応答テキストから JSON 本体を取り出す（```json フェンス等を除去）。 */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export class AnthropicMapVision implements MapVisionProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: AnthropicMapVisionOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async analyze(image: ArrayBuffer): Promise<VisionExtraction> {
    const bytes = new Uint8Array(image);
    const mediaType = detectMediaType(bytes);
    const data = arrayBufferToBase64(image);

    const res = await this.fetchFn(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        detail = err?.error?.message ? `: ${err.error.message}` : "";
      } catch {
        // ignore
      }
      throw new Error(
        `AnthropicMapVision: 解析リクエストに失敗しました (HTTP ${res.status}${detail})`,
      );
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const json = extractJson(text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(
        "AnthropicMapVision: 応答を JSON として解釈できませんでした",
      );
    }
    return normalizeExtraction(parsed);
  }
}

/** パース結果を VisionExtraction 形へ正規化（欠損は空配列・省略に落とす）。 */
function normalizeExtraction(v: unknown): VisionExtraction {
  const o = (v ?? {}) as Record<string, unknown>;
  const asPixel = (p: unknown) => {
    const q = (p ?? {}) as Record<string, unknown>;
    return { x: Number(q.x) || 0, y: Number(q.y) || 0 };
  };
  const landmarks = Array.isArray(o.landmarks)
    ? o.landmarks.map((l) => {
        const q = (l ?? {}) as Record<string, unknown>;
        return { label: String(q.label ?? ""), pixel: asPixel(q.pixel) };
      })
    : [];
  const boundaries = Array.isArray(o.boundaries)
    ? o.boundaries.map((b) => {
        const q = (b ?? {}) as Record<string, unknown>;
        const verts = Array.isArray(q.vertices) ? q.vertices : [];
        return { vertices: verts.map(asPixel) };
      })
    : [];
  const places = Array.isArray(o.places)
    ? o.places.map((p) => {
        const q = (p ?? {}) as Record<string, unknown>;
        const out: VisionExtraction["places"][number] = {
          number: Number(q.number) || 0,
          pixel: asPixel(q.pixel),
        };
        if (q.label != null && String(q.label) !== "")
          out.label = String(q.label);
        if (q.address != null && String(q.address) !== "")
          out.address = String(q.address);
        if (q.kind === "building" || q.kind === "house") out.kind = q.kind;
        return out;
      })
    : [];
  const result: VisionExtraction = { landmarks, boundaries, places };
  if (o.areaGuess != null && String(o.areaGuess) !== "")
    result.areaGuess = String(o.areaGuess);
  return result;
}

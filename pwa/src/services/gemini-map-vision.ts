// Gemini vision（Google Generative Language API）による地図画像解析アダプタ。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 1（抽出）/ 5（トレース）。
//
// ブラウザから直接 Google の generateContent エンドポイントを叩く
// （ユーザー自身の API キーを設定画面で登録して利用する前提。無料枠あり）。
// 画像は解析のため外部へ送信される（§プライバシー上の重要注意、同意ダイアログは UI 側）。
//
// プロンプト契約・画像判定・JSON 正規化は map-vision-extraction.ts で Anthropic と共有する。

import type { MapVisionProvider, VisionExtraction } from "./ai-map-import";
import {
  arrayBufferToBase64,
  detectMediaType,
  EXTRACTION_PROMPT,
  extractJson,
  normalizeExtraction,
} from "./map-vision-extraction";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_MAX_TOKENS = 8192;

export interface GeminiMapVisionOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  fetchFn?: typeof fetch;
}

export class GeminiMapVision implements MapVisionProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: GeminiMapVisionOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    // ネイティブ fetch はメソッド呼び出しにすると this が Window でなくなり
    // 'Illegal invocation' になるため globalThis にバインドする。
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  }

  async analyze(image: ArrayBuffer): Promise<VisionExtraction> {
    const bytes = new Uint8Array(image);
    const mediaType = detectMediaType(bytes);
    const data = arrayBufferToBase64(image);

    // API キーはクエリパラメータで渡す（Google が公式にブラウザ向けに案内する方式。
    // カスタム認証ヘッダより CORS プリフライトが通りやすい）。
    const endpoint = `${GEMINI_BASE}/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const res = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mediaType, data } },
              { text: EXTRACTION_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: this.maxTokens,
        },
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
        `GeminiMapVision: 解析リクエストに失敗しました (HTTP ${res.status}${detail})`,
      );
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
    const json = extractJson(text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(
        "GeminiMapVision: 応答を JSON として解釈できませんでした",
      );
    }
    return normalizeExtraction(parsed);
  }
}

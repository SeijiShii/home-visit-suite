// 地図画像解析（vision）プロバイダ共通の抽出ロジック。
// プロンプト契約・画像 media type 判定・base64 変換・JSON 抽出・正規化を
// Anthropic / Gemini など複数アダプタで共有する。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 1（抽出）/ 5（トレース）。

import type { VisionExtraction } from "./ai-map-import";

// 抽出スキーマ契約: この JSON だけを返すよう指示する（VisionExtraction と対応）。
export const EXTRACTION_PROMPT = `あなたは地図画像の解析アシスタントです。この地図画像を解析し、次の JSON だけを出力してください（説明文・コードフェンスなし）。

{
  "areaGuess": "推定した地区の自由記述（例: 千葉県成田市成田周辺）",
  "landmarks": [{ "label": "ジオコーディング可能な住所・地名・施設名", "pixel": { "x": 数値, "y": 数値 } }],
  "boundaries": [{ "vertices": [{ "x": 数値, "y": 数値 }] }],
  "places": [{ "number": 整数, "pixel": { "x": 数値, "y": 数値 }, "label": "任意(表札名)", "address": "任意(住所)", "kind": "house または building" }]
}

- 座標 x・y は **0〜1000 の整数の正規化座標**で表す（実ピクセル数ではない）。x は画像の左端=0・右端=1000（画像幅に対する位置）、y は上端=0・下端=1000（画像高さに対する位置）。例: 中央付近は { "x": 500, "y": 500 }。0〜1000 の範囲を必ず守る。
- landmarks は町名・丁目・駅・学校・寺社・公園・大型店など、実在の場所として住所検索できる手がかりを、画像内での位置とともに列挙する。多いほど接地精度が上がる。
- boundaries は **区域全体を囲む「太い色付きの境界線」（赤・ピンク・オレンジ等の目立つ太線）**を頂点列としてトレースする。通常この種の地図には道路に沿って折れ曲がる**大きな外周が 1 本**ある。
  - **太線の中心線を忠実にたどる**こと。カーブや折れ点をなめらかに再現できるよう**頂点を多め（目安 30〜80 点）**に打つ。太線が緩くカーブする箇所も直線で省略せず細かく頂点を置く。
  - 追うのは**太い色付き線だけ**。建物の footprint（オレンジや黒の小さな四角）、細い灰色の道路・地番界・等高線、番号付きの小枠には**惑わされない**。これらは境界ではない。太線が建物や細線と交差・近接していても、太線だけを一続きに追う。
  - 太線は閉じた輪（始点に戻る）になっているはず。輪に沿って一周する頂点列を返す。
- places は **丸数字（①②③… や 1,2,3…）や番号が付いたマーカー・小さな枠**で、家や集合住宅を指す。number にその番号、pixel にその位置（番号の中心）。**番号付きの小さな赤枠（建物の拡大表示）は boundaries ではなく places に入れる**。小枠で拡大表示された番号付き区画は集合住宅の可能性が高く kind="building"、単独の番号マーカーは kind="house"。label/address は読み取れた場合のみ。
- **boundaries にも places にも含めないもの**（装飾・注記）: 凡例・凡例枠、縮尺（スケールバー）、方位記号（北矢印）、タイトル欄、画像全体の外枠・罫線、著作権表記、別枠の索引図（インセット）。
- 手がかりが乏しく判断できない項目は空配列にする。推測で埋めない。`;

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** マジックバイトから画像 media type を判定する。 */
export function detectMediaType(bytes: Uint8Array): MediaType {
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
  throw new Error("対応していない画像形式です（PNG/JPEG/WebP/GIF）");
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 応答テキストから JSON 本体を取り出す（```json フェンス等を除去）。 */
export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/**
 * パース結果を VisionExtraction 形へ正規化（欠損は空配列・省略に落とす）。
 * 座標は「画像の幅/高さに対する 0〜1 の比率」に統一する:
 * vision モデルは指示に反して 0〜1000 の正規化座標を返すことが多いため、
 * 観測最大値から座標空間を推定して 0〜1 へ換算し、[0,1] にクランプする
 * （範囲外の値による洋上への飛び出しを防ぐ）。
 */
export function normalizeExtraction(v: unknown): VisionExtraction {
  const o = (v ?? {}) as Record<string, unknown>;

  // まず生座標のまま収集し、座標空間（0〜1 か 0〜1000 か）を推定する。
  const rawPixel = (p: unknown) => {
    const q = (p ?? {}) as Record<string, unknown>;
    return { x: Number(q.x) || 0, y: Number(q.y) || 0 };
  };
  const rawLandmarks = Array.isArray(o.landmarks)
    ? o.landmarks.map((l) => {
        const q = (l ?? {}) as Record<string, unknown>;
        return { label: String(q.label ?? ""), pixel: rawPixel(q.pixel) };
      })
    : [];
  const rawBoundaries = Array.isArray(o.boundaries)
    ? o.boundaries.map((b) => {
        const q = (b ?? {}) as Record<string, unknown>;
        const verts = Array.isArray(q.vertices) ? q.vertices : [];
        return { vertices: verts.map(rawPixel) };
      })
    : [];
  const rawPlaces = Array.isArray(o.places)
    ? o.places.map((p) => {
        const q = (p ?? {}) as Record<string, unknown>;
        return {
          q,
          number: Number(q.number) || 0,
          pixel: rawPixel(q.pixel),
        };
      })
    : [];

  // 観測最大座標。> 1.5 なら 0〜1000 系（÷1000）、それ以下なら既に 0〜1 系。
  let maxCoord = 0;
  const observe = (p: { x: number; y: number }) => {
    maxCoord = Math.max(maxCoord, Math.abs(p.x), Math.abs(p.y));
  };
  rawLandmarks.forEach((l) => observe(l.pixel));
  rawBoundaries.forEach((b) => b.vertices.forEach(observe));
  rawPlaces.forEach((p) => observe(p.pixel));
  const scale = maxCoord > 1.5 ? 1000 : 1;
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const norm = (p: { x: number; y: number }) => ({
    x: clamp01(p.x / scale),
    y: clamp01(p.y / scale),
  });

  const landmarks = rawLandmarks.map((l) => ({
    label: l.label,
    pixel: norm(l.pixel),
  }));
  const boundaries = rawBoundaries.map((b) => ({
    vertices: b.vertices.map(norm),
  }));
  const places = rawPlaces.map((p) => {
    const out: VisionExtraction["places"][number] = {
      number: p.number,
      pixel: norm(p.pixel),
    };
    if (p.q.label != null && String(p.q.label) !== "")
      out.label = String(p.q.label);
    if (p.q.address != null && String(p.q.address) !== "")
      out.address = String(p.q.address);
    if (p.q.kind === "building" || p.q.kind === "house") out.kind = p.q.kind;
    return out;
  });

  const result: VisionExtraction = { landmarks, boundaries, places };
  if (o.areaGuess != null && String(o.areaGuess) !== "")
    result.areaGuess = String(o.areaGuess);
  return result;
}

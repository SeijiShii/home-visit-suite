// AI 地図取込のオーケストレーション。
// vision（画像解析）で得た画素空間の抽出結果を、geocoder（GSI 接地）と
// ジオリファレンス変換で実座標の下書きへ変換する。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー / §信頼度による分岐。
//
// vision / geocoder は interface として注入する（テストは fake、本番は
// Anthropic vision / GSI ジオコーディングの実アダプタを差し込む）。

import type { LatLng } from "../lib/area-detail-geo";
import {
  classifyConfidence,
  pixelToLatLng,
  solveGeoreference,
  type ConfidenceLevel,
  type Gcp,
  type GeoreferenceResult,
  type Pixel,
} from "../lib/georeference";

export type { Pixel } from "../lib/georeference";

// ── vision（画像解析）が返す画素空間の抽出結果 ──────────────────

/** 地図内で読み取れた接地手がかり（町名・ランドマーク等）。 */
export interface VisionLandmark {
  /** ジオコーディングに渡すテキスト（住所・地名・施設名）。 */
  label: string;
  /** 画像内のピクセル位置。 */
  pixel: Pixel;
}

/** トレースした 1 区域の境界線（画素空間の頂点列）。 */
export interface VisionBoundary {
  vertices: Pixel[];
}

/** 場所番号付きマーカー（画素空間）。 */
export interface VisionPlace {
  /** 地図に書かれた場所番号。 */
  number: number;
  pixel: Pixel;
  label?: string;
  address?: string;
  /** 戸建て/集合住宅の別（AI が判別できた場合。既定は戸建て）。 */
  kind?: "house" | "building";
}

export interface VisionExtraction {
  landmarks: VisionLandmark[];
  boundaries: VisionBoundary[];
  places: VisionPlace[];
  /** AI が推定した地区の自由記述（UI 表示・確認用）。 */
  areaGuess?: string;
}

/** 画像を解析して抽出結果を返すプロバイダ（Anthropic vision 等）。 */
export interface MapVisionProvider {
  analyze(image: ArrayBuffer): Promise<VisionExtraction>;
}

// ── geocoder（実座標への接地） ────────────────────────────────

export interface GeocodeHit {
  title: string;
  geo: LatLng;
}

/** テキスト（住所・地名）を実座標へ接地するジオコーダ（GSI 等）。 */
export interface Geocoder {
  geocode(query: string): Promise<GeocodeHit[]>;
}

// ── 下書き（未確定） ─────────────────────────────────────────

export interface DraftPolygon {
  vertices: LatLng[];
}

export interface DraftPlace {
  geo: LatLng;
  number: number;
  label: string;
  address: string;
  /** 戸建て/集合住宅の別。既定は戸建て。 */
  kind: "house" | "building";
}

export interface ImportDraft {
  confidence: ConfidenceLevel;
  /** 接地に成功したジオリファレンス結果。3 点未満で解けない場合は null。 */
  georeference: GeoreferenceResult | null;
  /** 実座標へ写像した境界ポリゴン（low 信頼時は空）。 */
  polygons: DraftPolygon[];
  /** 実座標へ写像した場所（low 信頼時は空）。 */
  places: DraftPlace[];
  /** ジオコーディングで実座標を得られたランドマーク（= 使用した GCP）。 */
  matchedGcps: Gcp[];
  /** ジオコーディングで接地できなかったランドマーク名。 */
  unmatchedLandmarks: string[];
  /** AI が推定した地区の自由記述。 */
  areaGuess?: string;
  /**
   * vision の生の抽出結果（画素空間）。低信頼で自動配置しない場合でも、
   * 手動オーバーレイ整列（Phase 1.2）で境界線を配置するために保持する。
   */
  extraction: VisionExtraction;
}

export class AiMapImportService {
  constructor(
    private readonly vision: MapVisionProvider,
    private readonly geocoder: Geocoder,
  ) {}

  /**
   * 画像を解析し、実座標の下書きを構築する。
   * - 接地できたランドマークが 3 点未満: low（下書きなし、手動整列へ誘導）
   * - 3 点以上だが残差が大: low（同上）
   * - 3 点以上かつ残差小: high（境界・場所を実座標へ写像）
   */
  async buildDraft(image: ArrayBuffer): Promise<ImportDraft> {
    const extraction = await this.vision.analyze(image);

    const matchedGcps: Gcp[] = [];
    const unmatchedLandmarks: string[] = [];
    for (const lm of extraction.landmarks) {
      const hits = await this.geocoder.geocode(lm.label);
      if (hits.length > 0) {
        matchedGcps.push({ pixel: lm.pixel, geo: hits[0].geo });
      } else {
        unmatchedLandmarks.push(lm.label);
      }
    }

    const base = {
      matchedGcps,
      unmatchedLandmarks,
      areaGuess: extraction.areaGuess,
      extraction,
    };

    // 接地点が足りず変換を確定できない → 手動整列フォールバック。
    if (matchedGcps.length < 3) {
      return {
        ...base,
        confidence: "low",
        georeference: null,
        polygons: [],
        places: [],
      };
    }

    const georeference = solveGeoreference(matchedGcps);
    const confidence = classifyConfidence(georeference);

    // 残差が大きい（low）ときも自動配置せず手動整列へ誘導する。
    if (confidence === "low") {
      return { ...base, confidence, georeference, polygons: [], places: [] };
    }

    const { transform } = georeference;
    const polygons: DraftPolygon[] = extraction.boundaries.map((b) => ({
      vertices: b.vertices.map((v) => pixelToLatLng(transform, v)),
    }));
    const places: DraftPlace[] = extraction.places.map((p) => ({
      geo: pixelToLatLng(transform, p.pixel),
      number: p.number,
      label: p.label ?? "",
      address: p.address ?? "",
      kind: p.kind ?? "house",
    }));

    return { ...base, confidence, georeference, polygons, places };
  }
}

import L from "leaflet";
import type {
  ChangeSet,
  PolygonID,
  VertexID,
  EdgeID,
  NetworkPolygonEditor,
} from "map-polygon-editor";
import { polygonCenter } from "./area-detail-geo";
import { loadGoogleMapsApi } from "./google-maps-loader";
// 一時診断ログ（原因特定後に削除）
import { mapDebugLog } from "./map-debug";
import { computeParentBoundaryEdges } from "./parent-boundary";
import { parentAreaColorPair } from "./parent-area-color";
import {
  requestCurrentLocation,
  resolveInitialMapView,
  TOKYO_FALLBACK_VIEW,
} from "./initial-map-view";

const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

const SNAP_THRESHOLD_PX = 20;
// 頂点吸着（ドラッグ中の磁着＋確定時の頂点統合）のしきい値。通常スナップより
// 狭くし、他頂点の近くへの繊細な配置を許容する（wants 03「ドラッグ中の吸着」）
const VERTEX_ATTRACT_THRESHOLD_PX = 12;

/** ベース地図プロバイダ設定。GSI はキー不要、Google は API キー必須。 */
export interface BaseMapConfig {
  provider: "gsi" | "google";
  /** Google Maps JavaScript API キー（provider === "google" のとき必須）。 */
  googleApiKey?: string;
  /** Google のレイヤー種別（既定は roadmap）。 */
  googleMapType?: "roadmap" | "satellite" | "terrain" | "hybrid";
  /**
   * Google のときだけ地図/航空写真を切り替えるトグルの表示ラベル（i18n 済み文字列）。
   * 省略時はトグルを表示しない。MapRenderer は i18n 非依存のため呼び出し側から渡す。
   */
  googleTypeLabels?: { map: string; aerial: string };
}

const DEFAULT_BASE_MAP: BaseMapConfig = { provider: "gsi" };

// Google Maps JS API の読み込みは lib/google-maps-loader.ts に分離
// （loading=async のタイミング仕様と GoogleMutant の 10 秒ポーリング制限のため、
//  API が完全に使える時点まで resolve を遅らせる実装。テストもそちらに）。

// GoogleMutant プラグインは bare な global `L` を参照するため、動的 import 前に window.L を注入する。
let googleMutantLoader: Promise<void> | null = null;
function loadGoogleMutantPlugin(): Promise<void> {
  if (googleMutantLoader) return googleMutantLoader;
  (window as unknown as { L: typeof L }).L = L;
  // パッケージの package.json は main/exports 未定義でバンドラが entry 解決に失敗するため、
  // 自己完結した IIFE ビルド（global L を参照）を明示パスで読み込む。
  googleMutantLoader =
    import("leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant.js").then(
      () => undefined,
    );
  return googleMutantLoader;
}

export interface PolygonStyle {
  color: string;
  weight: number;
  fillOpacity: number;
  /** 塗り色を輪郭色と分けるとき指定（省略時は Leaflet 既定で color と同色） */
  fillColor?: string;
}

export function getPolygonStyle(
  isLinked: boolean,
  isSelected: boolean,
  areaId?: string,
): PolygonStyle {
  if (isLinked) {
    // 紐付け済みは区域親番ごとに緑系数色を塗り分ける
    // （docs/wants/03「区域親番ごとのポリゴン塗り分け」）
    const pair = parentAreaColorPair(areaId);
    return isSelected
      ? { color: pair.selected, weight: 3, fillOpacity: 0.35 }
      : { color: pair.base, weight: 2, fillOpacity: 0.15 };
  }
  // 未紐付けは灰色（無彩色）。紐付くと色彩（緑系パレット）がつく
  // （docs/wants/03「区域親番ごとのポリゴン塗り分け」）
  return isSelected
    ? { color: "#475569", weight: 3, fillOpacity: 0.35 }
    : { color: "#94a3b8", weight: 2, fillOpacity: 0.15 };
}

/** 親番境界線の専用 Leaflet ペイン名（overlayPane より下に固定描画） */
const PARENT_BOUNDARY_PANE = "parentBoundary";

/**
 * 区域親番境界（親番グループの境目）の強調スタイル。区域の境界線（ポリゴン
 * 輪郭）より下層に実線の太線を描く（docs/wants/03「区域親番境界の強調表示」）。
 */
export function getParentBoundaryStyle(): {
  color: string;
  weight: number;
  opacity: number;
} {
  // 区域境界線（最大 weight 4）を手前に重ねても両側に太線が見えるよう weight 8
  return { color: "#334155", weight: 8, opacity: 0.9 };
}

export type AreaDetailPolygonRole = "target" | "neighbor";

/** 訪問記録画面（詳細モード）の親番色極薄塗りの不透明度 */
const AREA_DETAIL_FILL_OPACITY = 0.08;

/**
 * 訪問記録画面（詳細モード）用ポリゴンスタイル。輪郭は
 * 対象=オレンジ太線/その他=水色細線（緑系はベース地図と紛れるため不採用）。
 * 塗りは区域親番ごとの塗り分け色を極薄で敷く。
 * 仕様: docs/wants/03_地図機能.md「場所の直接編集」描画ルール・
 * 「区域親番ごとのポリゴン塗り分け」。
 */
export function getAreaDetailPolygonStyle(
  role: AreaDetailPolygonRole,
  areaId?: string,
): PolygonStyle {
  const fillColor = parentAreaColorPair(areaId).base;
  if (role === "target") {
    return {
      color: "#f97316",
      weight: 4,
      fillOpacity: AREA_DETAIL_FILL_OPACITY,
      fillColor,
    };
  }
  return {
    color: "#38bdf8",
    weight: 2,
    fillOpacity: AREA_DETAIL_FILL_OPACITY,
    fillColor,
  };
}

export type PlaceType = "house" | "building" | "room";

/** 仕様: house=青 / building=オレンジ (room は Phase 1 では地図非表示、当面 house と同色) */
export function getPlaceMarkerColor(type: PlaceType): string {
  switch (type) {
    case "house":
      return "#2563eb"; // 青
    case "building":
      return "#ea580c"; // オレンジ
    case "room":
      return "#2563eb"; // Phase 1 では地図表示しないので暫定
  }
}

/** ズーム連動の場所マーカー半径 (8〜14px)。zoom 13 で 8、zoom 19 で 14。 */
export function getPlaceMarkerRadius(zoom: number): number {
  const r = 8 + (zoom - 13);
  return Math.max(8, Math.min(14, r));
}

/**
 * 区域編集画面の読み取り専用場所オーバーレイを表示する最小ズーム。
 * 仕様: docs/wants/03「区域編集画面での場所表示と番号再採番」（ズーム 16 以上で表示）。
 */
export const PLACE_OVERLAY_MIN_ZOOM = 16;

/**
 * 区域IDラベルを表示する最小ズーム。これ未満の広域表示ではポリゴンが小さく
 * なりラベル同士が重なって視認性を損なうため非表示にする。
 * 仕様: docs/wants/03「区域IDラベル表示」（ズーム 16 以上で表示）。
 */
export const AREA_ID_LABEL_MIN_ZOOM = 16;

/** 区域IDラベルを表示すべきズームかどうか。 */
export function isAreaIdLabelZoomVisible(zoom: number): boolean {
  return zoom >= AREA_ID_LABEL_MIN_ZOOM;
}

/** 場所オーバーレイの専用 Leaflet ペイン名（overlayPane より上に固定描画） */
const PLACE_OVERLAY_PANE = "placeOverlay";

/** 現在地マーカーの専用 Leaflet ペイン名（場所オーバーレイより上・非対話） */
const CURRENT_LOCATION_PANE = "currentLocation";

/** 現在地マーカー・精度円の色（青） */
const CURRENT_LOCATION_COLOR = "#2563eb";

/** 現在地パン時の最低ズーム（広域のままではパンの意味がないため引き上げる） */
const LOCATE_MIN_ZOOM = 15;

/** 読み取り専用（不活性）場所アイコンの塗り色（灰色）。 */
export const PLACE_OVERLAY_COLOR = "#94a3b8";

/** 所属区域のどのポリゴンにも内包されない場所の警告色（赤灰色）。 */
export const PLACE_OVERLAY_ORPHAN_COLOR = "#b06a6a";

/** 区域編集画面の読み取り専用場所オーバーレイの 1 件分。 */
export interface PlaceOverlayItem {
  id: string;
  lat: number;
  lng: number;
  /** 通し番号バッジ用 index（0 始まり。表示は +1）。 */
  index: number;
  /** 所属区域のどのポリゴンにも内包されない場所なら true（赤灰色表示）。 */
  orphan: boolean;
}

/** 場所マーカーに重ねる通し番号バッジの表示テキスト (index は 0 始まり → 表示は 1 始まり) */
export function getPlaceBadgeText(index: number): string {
  return String(index + 1);
}

/**
 * 場所マーカーの不透明度 (枠線=opacity, 塗り=fillOpacity)。
 * 選択時は強調のため高い値を返す。
 */
export function getPlaceMarkerOpacity(selected: boolean): {
  fillOpacity: number;
  opacity: number;
} {
  return selected
    ? { fillOpacity: 1, opacity: 1 }
    : { fillOpacity: 0.55, opacity: 0.85 };
}

const VIEW_STORAGE_KEY = "map-view";

export interface VertexDragCallbacks {
  onDragStart: (vertexId: VertexID) => void;
  /**
   * 戻り値で位置を返すと、マーカーをその位置へ表示する（頂点吸着プレビュー。
   * wants 03「ドラッグ中の吸着」）。void ならカーソル位置のまま。
   */
  onDragMove: (
    vertexId: VertexID,
    lat: number,
    lng: number,
  ) => { lat: number; lng: number } | void;
  onDragEnd: (vertexId: VertexID, lat: number, lng: number) => void;
}

export interface MapRendererCallbacks {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
  onPolygonDoubleClick?: (id: PolygonID) => void;
  onPolygonHover?: (id: PolygonID) => void;
  onContextMenu?: (
    lat: number,
    lng: number,
    containerX: number,
    containerY: number,
  ) => void;
  onVertexHover?: (id: VertexID) => void;
  onEdgeHover?: (id: EdgeID) => void;
}

export class MapRenderer {
  private map: L.Map | null = null;
  private editor: NetworkPolygonEditor | null = null;

  // ベース地図（背景タイル）レイヤー。プロバイダ切替時に差し替える。
  private baseLayer: L.Layer | null = null;
  private baseMapConfig: BaseMapConfig = DEFAULT_BASE_MAP;
  // 非同期のベース地図適用が競合したとき、最後の要求だけを反映するための世代カウンタ。
  private baseMapGeneration = 0;
  // 地図/航空写真トグル（Google のときのみ表示する Leaflet コントロール）。
  private baseMapControl: L.Control | null = null;
  private baseMapControlEl: HTMLDivElement | null = null;
  // 現在の Google レイヤー種別。トグルの active 表示と再適用に使う。
  private googleMapType: "roadmap" | "hybrid" = "roadmap";

  // ネットワーク要素のレイヤー
  private vertexLayers = new Map<string, L.CircleMarker>();
  private edgeLayers = new Map<string, L.Polyline>();
  private polygonLayers = new Map<string, L.GeoJSON>();

  // ラバーバンド（描画中のみ）
  private rubberBandLine: L.Polyline | null = null;
  private lastPlacedVertexId: VertexID | null = null;
  private mouseMoveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
  private mouseOutHandler: (() => void) | null = null;
  private snapIndicator: L.CircleMarker | null = null;

  // 区域IDラベル（紐付け済みポリゴンの中心にテキスト表示）
  private polygonAreaIds = new Map<string, string>();
  private areaIdLabelMarkers = new Map<
    string,
    { marker: L.Marker; text: string }
  >();

  // 区域親番境界の強調帯（edgeId → 太線ポリライン）
  private parentBoundaryLayers = new Map<string, L.Polyline>();

  // 現在地マーカー（青ドット）と測位精度円・「現在地へ移動」コントロール
  private currentLocationMarker: L.CircleMarker | null = null;
  private currentLocationAccuracyCircle: L.Circle | null = null;
  private locateControl: L.Control | null = null;

  // ポリゴンメタデータ（区域紐付け、選択状態）
  private linkedPolygonIds: Set<string> = new Set();
  private selectedId: string | null = null;
  private polygonClickCallback: ((id: PolygonID) => void) | null = null;
  private polygonDoubleClickCallback: ((id: PolygonID) => void) | null = null;

  // 区域詳細編集モード: target/neighbor のみ描画 (それ以外は非表示)
  // targetIds は対象区域の全ポリゴン（飛地対応で複数可）
  private detailMode: {
    targetIds: Set<string>;
    neighborIds: Set<string>;
  } | null = null;

  // 場所マーカー (詳細編集モード時のみ表示)
  private placeMarkers = new Map<string, L.CircleMarker>();

  private placeBadgeMarkers = new Map<string, L.Marker>();

  // 読み取り専用の場所オーバーレイ（区域編集画面専用。ズーム閾値ゲート付き）
  private placeOverlayItems: PlaceOverlayItem[] = [];
  private placeOverlayMarkers: (L.CircleMarker | L.Marker)[] = [];
  private placeOverlayZoomHandler: (() => void) | null = null;
  private placeContextMenuCallback:
    ((placeId: string, type: PlaceType, x: number, y: number) => void) | null =
    null;
  private placeClickCallback:
    ((placeId: string, type: PlaceType) => void) | null = null;
  private placeZoomHandler: (() => void) | null = null;

  // 場所マーカー移動追従モード
  private placeMoveSession: {
    placeId: string;
    /** 移動開始時のマーカー位置（キャンセル時に表示を戻すため）。 */
    origLatLng: L.LatLng | null;
    onConfirm: (lat: number, lng: number) => void;
    onCancel: () => void;
    moveHandler: (e: L.LeafletMouseEvent) => void;
    clickHandler: (e: L.LeafletMouseEvent) => void;
    keyHandler: (e: KeyboardEvent) => void;
  } | null = null;

  // 頂点表示制御
  private verticesVisible = false;

  // mount 後に表示位置が動いたか（ユーザー操作・区域フォーカス・GPS 適用のいずれか）。
  // 非同期の GPS 現在地適用が後から表示を奪わないためのガード。
  private viewTouched = false;

  // 頂点ドラッグ
  private vertexDragCallbacks: VertexDragCallbacks | null = null;
  // renderAll で頂点マーカーは作り直されるため、二重付与の判定は「頂点ID」ではなく
  // 「マーカー実体」で行う（ID 基準だと再生成後の新マーカーに listener が付かず、
  // 頂点ドラッグが効かず地図がパンしてしまう）。
  private draggableMarkers = new WeakSet<L.CircleMarker>();

  // ホバーコールバック（ヘルプツールチップ用）
  private vertexHoverCallback: ((id: VertexID) => void) | null = null;
  private edgeHoverCallback: ((id: EdgeID) => void) | null = null;
  private polygonHoverCallback: ((id: PolygonID) => void) | null = null;

  mount(
    container: HTMLElement,
    callbacks: MapRendererCallbacks = {},
    baseMap: BaseMapConfig = DEFAULT_BASE_MAP,
  ): void {
    const resolved = resolveInitialMapView(this.loadView());
    const center = [resolved.view.lat, resolved.view.lng] as L.LatLngExpression;
    const zoom = resolved.view.zoom;

    this.map = L.map(container, {
      doubleClickZoom: false,
      maxZoom: 19,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 120,
      clickTolerance: 8,
    } as L.MapOptions).setView(center, zoom);

    // 親番境界線の専用ペイン: tilePane(200) より上・overlayPane(400) より下。
    // 区域の境界線（ポリゴン輪郭）を太線より手前に見せるため下層に固定しつつ、
    // DOM 追加順に依存しない重なり順を保つ（wants/03「区域親番境界の強調表示」）。
    const boundaryPane = this.map.createPane(PARENT_BOUNDARY_PANE);
    boundaryPane.style.zIndex = "390";
    boundaryPane.style.pointerEvents = "none";

    // 読み取り専用の場所オーバーレイの専用ペイン: overlayPane(400) より上・
    // markerPane(600) より下。ポリゴンの再 add（頂点ドラッグ中の applyChangeSet
    // 等）で DOM 追加順が変わっても、灰色アイコンが塗りの下へ沈まないよう
    // 重なり順をペインで固定する（learnings L-015 対応）。非インタラクティブ。
    const overlayPane = this.map.createPane(PLACE_OVERLAY_PANE);
    overlayPane.style.zIndex = "450";
    overlayPane.style.pointerEvents = "none";

    // 現在地マーカーの専用ペイン: 場所オーバーレイ(450)より上・markerPane(600)
    // より下。ポリゴン・場所マーカーの操作を妨げないよう非対話
    // （wants/03「現在地マーカーと現在地への移動」）。
    const locationPane = this.map.createPane(CURRENT_LOCATION_PANE);
    locationPane.style.zIndex = "460";
    locationPane.style.pointerEvents = "none";

    this.setBaseMap(baseMap);

    // viewTouched は movestart で立てる: focusPolygons の flyToBounds や
    // ユーザードラッグは完了（moveend）まで最大数秒かかり、その間に GPS
    // 取得が完了すると表示を奪ってしまうため、移動「開始」時点でガードする
    this.map.on("movestart", () => {
      this.viewTouched = true;
    });
    this.map.on("moveend", () => {
      this.viewTouched = true;
      this.saveView();
    });

    // 区域IDラベルはズーム閾値未満で非表示にするため、ズーム変化に追従させる
    // （wants/03「区域IDラベル表示」）。map.remove() が購読ごと破棄する。
    this.map.on("zoomend", () => {
      this.refreshAreaIdLabels();
    });

    if (resolved.shouldLocate) {
      requestCurrentLocation(
        typeof navigator !== "undefined" ? navigator.geolocation : undefined,
        (lat, lng) => {
          // 保存ビューなしの初回のみ現在地へ移動する。取得完了より先に
          // ユーザー操作や区域フォーカスで表示が動いていたら上書きしない
          // （docs/wants/03「地図の初期表示位置」）
          if (!this.map || this.viewTouched) return;
          this.map.setView([lat, lng], TOKYO_FALLBACK_VIEW.zoom);
        },
      );
    }

    if (callbacks.onMapClick) {
      this.map.on("click", (e: L.LeafletMouseEvent) => {
        callbacks.onMapClick!(e.latlng.lat, e.latlng.lng);
      });
    }

    if (callbacks.onContextMenu) {
      this.map.on("contextmenu", (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
        // 場所移動セッション中はコンテキストメニューを開かない（タッチでは
        // マーカーがカーソル追従しないため空白部の長押しがここへ到達し得る。
        // 追加フローと移動セッションの並走を防ぐ）
        if (this.placeMoveSession) return;
        callbacks.onContextMenu!(
          e.latlng.lat,
          e.latlng.lng,
          e.containerPoint.x,
          e.containerPoint.y,
        );
      });
    }

    this.polygonClickCallback = callbacks.onPolygonClick ?? null;
    this.polygonDoubleClickCallback = callbacks.onPolygonDoubleClick ?? null;
    this.vertexHoverCallback = callbacks.onVertexHover ?? null;
    this.edgeHoverCallback = callbacks.onEdgeHover ?? null;
    this.polygonHoverCallback = callbacks.onPolygonHover ?? null;
  }

  setEditor(editor: NetworkPolygonEditor): void {
    this.editor = editor;
  }

  /**
   * ベース地図（背景タイル）を切り替える。GSI は同期的に、Google は API 読み込み後に適用する。
   * Google に必要な API キーが無い、または読み込みに失敗した場合は GSI にフォールバックする。
   * ポリゴン・マーカー等の上位レイヤーは別 pane のため差し替えても保持される。
   */
  setBaseMap(config: BaseMapConfig): void {
    mapDebugLog(
      `renderer: setBaseMap provider=${config.provider} hasKey=${!!config.googleApiKey} mounted=${!!this.map}`,
    );
    if (!this.map) return;
    const prev = this.baseMapConfig;
    this.baseMapConfig = config;
    const generation = ++this.baseMapGeneration;

    if (config.provider === "google" && config.googleApiKey) {
      // 種別は config 既定 → 現在値の順で決める（初回は roadmap）。
      this.googleMapType =
        config.googleMapType === "hybrid" ? "hybrid" : "roadmap";
      // 先に GSI を出しておき、Google 読み込み完了後に差し替える（読み込み中の空白を防ぐ）。
      if (!this.baseLayer) this.applyGsiLayer();
      void this.applyGoogleLayer(config, generation);
      return;
    }
    // GSI を既に表示中なら貼り直さない（マウント直後の二重適用によるタイル再読み込みを防ぐ）。
    if (
      this.baseLayer &&
      prev.provider === "gsi" &&
      config.provider === "gsi"
    ) {
      return;
    }
    this.applyGsiLayer();
  }

  /** 現在のベース地図プロバイダ識別子を返す。 */
  getBaseMapProvider(): "gsi" | "google" {
    return this.baseMapConfig.provider;
  }

  private replaceBaseLayer(layer: L.Layer): void {
    if (!this.map) return;
    if (this.baseLayer) this.map.removeLayer(this.baseLayer);
    this.baseLayer = layer;
    layer.addTo(this.map);
    // ベースタイルは最背面へ（後から追加すると上に載るため）。
    if ("bringToBack" in layer) {
      (layer as L.GridLayer).bringToBack();
    }
  }

  private applyGsiLayer(): void {
    this.replaceBaseLayer(
      L.tileLayer(GSI_TILE_URL, {
        attribution: GSI_ATTRIBUTION,
        maxNativeZoom: 18,
        maxZoom: 19,
      }),
    );
    this.removeBaseMapToggle();
  }

  /** 地図/航空写真を切り替える（Google 表示中のみ有効）。 */
  setGoogleMapType(type: "roadmap" | "hybrid"): void {
    if (this.baseMapConfig.provider !== "google" || !this.map) return;
    if (this.googleMapType === type) return;
    this.googleMapType = type;
    this.baseMapConfig = { ...this.baseMapConfig, googleMapType: type };
    const generation = ++this.baseMapGeneration;
    void this.applyGoogleLayer(this.baseMapConfig, generation);
    this.updateBaseMapToggleActive();
  }

  /** 地図/航空写真トグル（Leaflet コントロール, 右上）を追加する。既に在れば何もしない。 */
  private addBaseMapToggle(labels: { map: string; aerial: string }): void {
    if (!this.map || this.baseMapControl) return;
    const control = new L.Control({ position: "topright" });
    control.onAdd = () => {
      const el = L.DomUtil.create(
        "div",
        "map-basemap-toggle leaflet-bar",
      ) as HTMLDivElement;
      const mk = (text: string, type: "roadmap" | "hybrid") => {
        const btn = L.DomUtil.create(
          "button",
          "map-basemap-toggle-btn",
          el,
        ) as HTMLButtonElement;
        btn.type = "button";
        btn.textContent = text;
        btn.dataset.type = type;
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stop(e);
          this.setGoogleMapType(type);
        });
      };
      mk(labels.map, "roadmap");
      mk(labels.aerial, "hybrid");
      // 地図のドラッグ/クリックにコントロール操作が漏れないようにする。
      L.DomEvent.disableClickPropagation(el);
      this.baseMapControlEl = el;
      this.updateBaseMapToggleActive();
      return el;
    };
    control.addTo(this.map);
    this.baseMapControl = control;
  }

  private removeBaseMapToggle(): void {
    if (this.baseMapControl && this.map) {
      this.map.removeControl(this.baseMapControl);
    }
    this.baseMapControl = null;
    this.baseMapControlEl = null;
  }

  /** トグル内の 2 ボタンの active 表示を現在種別に合わせて更新する。 */
  private updateBaseMapToggleActive(): void {
    if (!this.baseMapControlEl) return;
    const btns = this.baseMapControlEl.querySelectorAll<HTMLButtonElement>(
      ".map-basemap-toggle-btn",
    );
    btns.forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        btn.dataset.type === this.googleMapType,
      );
    });
  }

  private async applyGoogleLayer(
    config: BaseMapConfig,
    generation: number,
  ): Promise<void> {
    try {
      await loadGoogleMapsApi(config.googleApiKey!);
      mapDebugLog("renderer: gmaps api ready, loading mutant plugin");
      await loadGoogleMutantPlugin();
      mapDebugLog(
        `renderer: mutant plugin loaded (gen ok=${generation === this.baseMapGeneration} mounted=${!!this.map})`,
      );
      // 読み込み中にさらに切替要求が来ていたら、この結果は破棄する。
      if (generation !== this.baseMapGeneration || !this.map) return;
      // プラグインは untyped のため L.gridLayer.googleMutant をキャストして呼ぶ。
      const googleMutant = (
        L.gridLayer as unknown as {
          googleMutant: (opts: {
            type?: string;
            maxZoom?: number;
          }) => L.GridLayer;
        }
      ).googleMutant;
      this.replaceBaseLayer(
        googleMutant({
          // 航空写真は hybrid（衛星＋道路/地名ラベル）にして訪問時に道路名を残す。
          type: this.googleMapType,
          maxZoom: 21,
        }),
      );
      // 地図/航空写真トグルを表示（ラベルがあるときのみ）。
      if (config.googleTypeLabels) {
        this.addBaseMapToggle(config.googleTypeLabels);
      }
      this.updateBaseMapToggleActive();
      mapDebugLog("renderer: google layer applied");
    } catch (e) {
      // 失敗時は GSI のまま（applyGsiLayer は setBaseMap 側で既に適用済み）。
      mapDebugLog(
        `renderer: applyGoogleLayer FAILED: ${String(e).slice(0, 200)}`,
      );
      console.error("Google Maps ベース地図の適用に失敗しました:", e);
    }
  }

  private saveView(): void {
    if (!this.map) return;
    const c = this.map.getCenter();
    localStorage.setItem(
      VIEW_STORAGE_KEY,
      JSON.stringify({ lat: c.lat, lng: c.lng, zoom: this.map.getZoom() }),
    );
  }

  private loadView(): { lat: number; lng: number; zoom: number } | null {
    try {
      const raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setCursor(cursor: string): void {
    if (this.map) {
      this.map.getContainer().style.cursor = cursor;
    }
  }

  unmount(): void {
    this.disableRubberBand();
    this.clearPlaceOverlay();
    // map.remove() がコントロールも破棄するため参照だけ落とす。
    this.baseMapControl = null;
    this.baseMapControlEl = null;
    this.baseLayer = null;
    // map.remove() がレイヤー・コントロールごと破棄するため参照だけ落とす。
    this.currentLocationMarker = null;
    this.currentLocationAccuracyCircle = null;
    this.locateControl = null;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.vertexLayers.clear();
    this.edgeLayers.clear();
    this.polygonLayers.clear();
    this.areaIdLabelMarkers.clear();
    this.parentBoundaryLayers.clear();
    this.editor = null;
  }

  // --- ネットワーク全体の初期描画 ---

  renderAll(linkedPolygonIds?: Set<string>): void {
    if (!this.map || !this.editor) return;

    if (linkedPolygonIds) {
      this.linkedPolygonIds = linkedPolygonIds;
    }

    // 既存レイヤーをクリア
    this.vertexLayers.forEach((l) => l.remove());
    this.vertexLayers.clear();
    this.edgeLayers.forEach((l) => l.remove());
    this.edgeLayers.clear();
    this.polygonLayers.forEach((l) => l.remove());
    this.polygonLayers.clear();

    // 頂点
    for (const v of this.editor.getVertices()) {
      this.addVertexLayer(v.id, v.lat, v.lng);
    }

    // 線分
    for (const e of this.editor.getEdges()) {
      this.addEdgeLayer(e.id, e.v1, e.v2);
    }

    // ポリゴン
    for (const p of this.editor.getPolygons()) {
      this.addPolygonLayer(p.id);
    }

    // 詳細モードでは当該（対象）区域を最前面に描画する。共有境界で後から
    // 描画された隣接区域の線が対象のオレンジ線を上書きしないようにするため
    // （docs/wants/03「場所の直接編集」描画ルール）。
    if (this.detailMode) {
      for (const targetId of this.detailMode.targetIds) {
        this.polygonLayers.get(targetId)?.bringToFront();
      }
    }

    this.refreshAreaIdLabels();
    this.refreshParentBoundaries();
  }

  // --- ChangeSet 差分適用 ---

  applyChangeSet(cs: ChangeSet): void {
    if (!this.map || !this.editor) return;

    // 頂点
    for (const v of cs.vertices.added) {
      this.addVertexLayer(v.id, v.lat, v.lng);
    }
    for (const id of cs.vertices.removed) {
      this.vertexLayers.get(id as string)?.remove();
      this.vertexLayers.delete(id as string);
    }
    for (const m of cs.vertices.moved) {
      const marker = this.vertexLayers.get(m.id as string);
      if (marker) marker.setLatLng([m.to.lat, m.to.lng]);
    }

    // 線分
    for (const e of cs.edges.added) {
      this.addEdgeLayer(e.id, e.v1, e.v2);
    }
    for (const id of cs.edges.removed) {
      this.edgeLayers.get(id as string)?.remove();
      this.edgeLayers.delete(id as string);
    }
    // 線分の移動: 頂点が動いたら端点も更新
    if (cs.vertices.moved.length > 0) {
      this.updateEdgePositions(cs);
    }

    // ポリゴン
    for (const p of cs.polygons.created) {
      this.addPolygonLayer(p.id);
    }
    for (const p of cs.polygons.modified) {
      // 再描画
      this.polygonLayers.get(p.id as string)?.remove();
      this.polygonLayers.delete(p.id as string);
      this.addPolygonLayer(p.id);
    }
    for (const id of cs.polygons.removed) {
      this.polygonLayers.get(id as string)?.remove();
      this.polygonLayers.delete(id as string);
    }

    // 状態変更（active/locked）
    for (const sc of cs.polygons.statusChanged) {
      if (sc.field === "active") {
        if (sc.after) {
          // 活性化: レイヤーを追加
          this.addPolygonLayer(sc.id);
        } else {
          // 不活性化: レイヤーを削除
          this.polygonLayers.get(sc.id as string)?.remove();
          this.polygonLayers.delete(sc.id as string);
        }
      }
    }

    // ポリゴンレイヤーが再追加された場合、頂点マーカーを前面に戻す
    const polygonsChanged =
      cs.polygons.created.length > 0 ||
      cs.polygons.modified.length > 0 ||
      cs.polygons.statusChanged.length > 0;
    if (polygonsChanged && this.verticesVisible) {
      for (const marker of this.vertexLayers.values()) {
        marker.bringToFront();
      }
    }

    // ラバーバンドの始点を更新
    // placeVertex() ではユーザーが置いた頂点が added[0]、
    // 交差解決で生じた頂点がその後に来る。始点は最初の頂点。
    if (cs.vertices.added.length > 0) {
      this.lastPlacedVertexId = cs.vertices.added[0].id;
    }

    // ポリゴンの増減・形状変化（頂点移動含む）に区域IDラベルを追従させる
    if (polygonsChanged || cs.vertices.moved.length > 0) {
      this.refreshAreaIdLabels();
    }

    // 親番境界の強調帯は辺単位のため、辺の増減にも追従させる
    const edgesChanged =
      cs.edges.added.length > 0 || cs.edges.removed.length > 0;
    if (polygonsChanged || edgesChanged || cs.vertices.moved.length > 0) {
      this.refreshParentBoundaries();
    }
  }

  private updateEdgePositions(cs: ChangeSet): void {
    if (!this.editor) return;
    const movedIds = new Set(cs.vertices.moved.map((m) => m.id as string));
    for (const [edgeIdStr, line] of this.edgeLayers) {
      const edge = this.editor.getEdge(edgeIdStr as EdgeID);
      if (!edge) continue;
      if (movedIds.has(edge.v1 as string) || movedIds.has(edge.v2 as string)) {
        const v1 = this.editor.getVertex(edge.v1);
        const v2 = this.editor.getVertex(edge.v2);
        if (v1 && v2) {
          line.setLatLngs([
            [v1.lat, v1.lng],
            [v2.lat, v2.lng],
          ]);
        }
      }
    }
  }

  // --- レイヤー作成ヘルパー ---

  private addVertexLayer(id: VertexID, lat: number, lng: number): void {
    if (!this.map) return;
    const marker = L.circleMarker([lat, lng], {
      radius: 5,
      color: "#333",
      fillColor: "#fff",
      fillOpacity: 1,
      weight: 2,
    });

    // 頂点表示状態に応じて地図に追加
    if (this.verticesVisible) {
      marker.addTo(this.map);
    }

    // 頂点ドラッグ
    if (this.vertexDragCallbacks) {
      this.makeVertexDraggable(id, marker);
    }

    // ホバー通知
    if (this.vertexHoverCallback) {
      marker.on("mouseover", () => this.vertexHoverCallback?.(id));
    }

    this.vertexLayers.set(id as string, marker);
  }

  /** 全頂点を表示する（描画/編集モード用） */
  showVertices(): void {
    if (!this.map) return;
    this.verticesVisible = true;
    for (const marker of this.vertexLayers.values()) {
      marker.addTo(this.map);
    }
  }

  /** 全頂点を非表示にする（通常モード用） */
  hideVertices(): void {
    this.verticesVisible = false;
    for (const marker of this.vertexLayers.values()) {
      marker.remove();
    }
  }

  private makeVertexDraggable(id: VertexID, marker: L.CircleMarker): void {
    if (this.draggableMarkers.has(marker)) return;
    this.draggableMarkers.add(marker);

    let dragging = false;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!this.map || !this.vertexDragCallbacks) return;
      dragging = true;
      this.map.dragging.disable();
      L.DomEvent.stop(e.originalEvent);
      this.vertexDragCallbacks.onDragStart(id);

      const onMouseMove = (ev: L.LeafletMouseEvent) => {
        if (!dragging) return;
        // 吸着があれば戻り値の位置へマーカーを表示する（無ければカーソル位置）
        const adjusted = this.vertexDragCallbacks?.onDragMove(
          id,
          ev.latlng.lat,
          ev.latlng.lng,
        );
        marker.setLatLng(adjusted ? [adjusted.lat, adjusted.lng] : ev.latlng);
      };

      const onMouseUp = (ev: L.LeafletMouseEvent) => {
        if (!dragging) return;
        dragging = false;
        this.map!.dragging.enable();
        this.map!.off("mousemove", onMouseMove);
        this.map!.off("mouseup", onMouseUp);
        this.vertexDragCallbacks?.onDragEnd(id, ev.latlng.lat, ev.latlng.lng);
      };

      this.map.on("mousemove", onMouseMove);
      this.map.on("mouseup", onMouseUp);
    };

    marker.on("mousedown", onMouseDown);
  }

  private addEdgeLayer(id: EdgeID, v1Id: VertexID, v2Id: VertexID): void {
    if (!this.map || !this.editor) return;
    const v1 = this.editor.getVertex(v1Id);
    const v2 = this.editor.getVertex(v2Id);
    if (!v1 || !v2) return;

    const line = L.polyline(
      [
        [v1.lat, v1.lng],
        [v2.lat, v2.lng],
      ],
      { color: "#666", weight: 2, opacity: 0.6 },
    ).addTo(this.map);

    if (this.edgeHoverCallback) {
      line.on("mouseover", () => this.edgeHoverCallback?.(id));
    }

    this.edgeLayers.set(id as string, line);
  }

  private computePolygonStyle(id: PolygonID): PolygonStyle | null {
    const idStr = id as string;
    if (this.detailMode) {
      if (this.detailMode.targetIds.has(idStr)) {
        return getAreaDetailPolygonStyle(
          "target",
          this.polygonAreaIds.get(idStr),
        );
      }
      if (this.detailMode.neighborIds.has(idStr)) {
        return getAreaDetailPolygonStyle(
          "neighbor",
          this.polygonAreaIds.get(idStr),
        );
      }
      // detail モード中は対象/隣接以外を非表示
      return null;
    }
    const isLinked = this.linkedPolygonIds.has(idStr);
    const isSelected = this.selectedId === idStr;
    return getPolygonStyle(
      isLinked,
      isSelected,
      this.polygonAreaIds.get(idStr),
    );
  }

  private addPolygonLayer(id: PolygonID): void {
    if (!this.map || !this.editor) return;

    // 不活性ポリゴンはレイヤーを追加しない
    if (!this.editor.isPolygonActive(id)) return;

    const geo = this.editor.getPolygonGeoJSON(id);
    if (!geo) return;

    const style = this.computePolygonStyle(id);
    if (!style) return;

    const feature = {
      type: "Feature" as const,
      geometry: geo,
      properties: {},
    };
    const layer = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
      style: () => style,
    }).addTo(this.map);

    if (this.polygonClickCallback) {
      layer.on("click", (e: L.LeafletMouseEvent) => {
        // 描画モード中は選択で塞がず、クリックを map まで伝播させて
        // スナップ判定（頂点/線分）に委ねる（docs/wants/03「ポリゴン描画のスナップ」）。
        if (this.editor?.getMode() === "drawing") return;
        L.DomEvent.stopPropagation(e);
        // 場所移動セッション中の確定クリックはポリゴン上にも落ちる
        // （特にタッチではマーカーがカーソル追従しないため常にこの経路）。
        // 確定として処理し、ポリゴン選択は発火させない。
        if (this.confirmPlaceMoveAt(e)) return;
        this.polygonClickCallback!(id);
      });
    }

    if (this.polygonDoubleClickCallback) {
      layer.on("dblclick", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.polygonDoubleClickCallback!(id);
      });
    }

    if (this.polygonHoverCallback) {
      layer.on("mouseover", () => this.polygonHoverCallback?.(id));
    }

    this.polygonLayers.set(id as string, layer);
  }

  // --- ポリゴン選択/ハイライト ---

  highlightPolygon(id: PolygonID | null): void {
    this.selectedId = id as string | null;
    // ポリゴンレイヤーを再スタイル
    for (const [layerId, layer] of this.polygonLayers) {
      const style = this.computePolygonStyle(layerId as PolygonID);
      if (style) layer.setStyle(style);
    }
  }

  /**
   * 区域詳細編集モードに入る。targets（飛地含む全対象ポリゴン）は濃色、
   * neighbors は薄色で描画され、それ以外のポリゴンは非表示。
   * 再描画は呼び出し側で renderAll() を実行すること。
   */
  setDetailMode(
    targetIds: readonly PolygonID[],
    neighborIds: Set<string>,
  ): void {
    this.detailMode = {
      targetIds: new Set(targetIds as readonly string[]),
      neighborIds: new Set(neighborIds),
    };
  }

  clearDetailMode(): void {
    this.detailMode = null;
  }

  isDetailMode(): boolean {
    return this.detailMode !== null;
  }

  /**
   * 区域詳細編集モード中の最小ズーム制限。
   * 半径 N km が画面に収まるズームを下回らないようにロックする。
   */
  setMinZoom(zoom: number): void {
    if (!this.map) return;
    this.map.setMinZoom(zoom);
    if (this.map.getZoom() < zoom) {
      this.map.setZoom(zoom);
    }
  }

  clearMinZoom(): void {
    if (!this.map) return;
    this.map.setMinZoom(0);
  }

  // --- 場所マーカー（区域詳細編集モード専用） ---

  /**
   * 場所マーカー右クリック時のコールバックを登録する。
   * (placeId, type, containerX, containerY) を受け取る。
   */
  setPlaceContextMenuHandler(
    cb:
      ((placeId: string, type: PlaceType, x: number, y: number) => void) | null,
  ): void {
    this.placeContextMenuCallback = cb;
  }

  /**
   * 場所マーカー左クリック時のコールバックを登録する。
   * 訪問記録画面でアイコンタップ → 訪問ダイアログを開くために使う。
   */
  setPlaceClickHandler(
    cb: ((placeId: string, type: PlaceType) => void) | null,
  ): void {
    this.placeClickCallback = cb;
  }

  /**
   * 場所マーカー一覧を地図に反映する。既存マーカーは全て破棄してから再描画する。
   * 詳細編集モード専用 (区域編集モードでは表示しない)。
   */
  setPlaces(
    places: ReadonlyArray<{
      id: string;
      lat: number;
      lng: number;
      type: PlaceType;
      tooltip?: string;
      /** 1 始まりの通し番号バッジ用 index (0 始まり) */
      index?: number;
      /** 選択中なら true。マーカー不透明度を上げて強調表示する。 */
      selected?: boolean;
    }>,
  ): void {
    this.clearPlaces();
    if (!this.map) return;
    const zoom = this.map.getZoom();
    const radius = getPlaceMarkerRadius(zoom);
    for (const p of places) {
      const color = getPlaceMarkerColor(p.type);
      const { fillOpacity, opacity } = getPlaceMarkerOpacity(
        Boolean(p.selected),
      );
      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        color: "#fff",
        weight: p.selected ? 3 : 2,
        opacity,
        fillColor: color,
        fillOpacity,
      }).addTo(this.map);
      if (p.tooltip) {
        marker.bindTooltip(p.tooltip, {
          direction: "top",
          offset: [0, -radius],
          opacity: 0.9,
        });
      }
      marker.on("contextmenu", (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
        L.DomEvent.stopPropagation(e);
        // 移動セッション中は場所メニューを開かない（移動の確定/Esc を待つ）
        if (this.placeMoveSession) return;
        this.placeContextMenuCallback?.(
          p.id,
          p.type,
          e.containerPoint.x,
          e.containerPoint.y,
        );
      });
      marker.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        // 移動セッション中のクリックは「移動の確定」。移動中のマーカーは
        // カーソルに追従しており、確定クリックは自マーカー上に落ちるため、
        // stopPropagation で地図の click（確定ハンドラ）が発火しない。ここで
        // セッションの確定へ渡し、訪問ダイアログは開かない（仕様: 03「場所操作 /
        // 移動」クリックで確定）。
        if (this.confirmPlaceMoveAt(e)) return;
        this.placeClickCallback?.(p.id, p.type);
      });
      this.placeMarkers.set(p.id, marker);

      // 通し番号バッジを重ねる (index 指定時のみ)
      // iconSize=[0,0] + iconAnchor=[0,0] で lat/lng 上に divIcon の左上を置き、
      // 内部の span を transform で中央に寄せることで、円マーカー半径の変化や
      // ブラウザ側のフォントメトリクスに依存せず常に中心に表示する。
      if (typeof p.index === "number") {
        const badgeIcon = L.divIcon({
          className: "place-number-badge",
          html: `<span class="place-number-badge-text">${getPlaceBadgeText(p.index)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const badge = L.marker([p.lat, p.lng], {
          icon: badgeIcon,
          interactive: false,
          keyboard: false,
        }).addTo(this.map);
        this.placeBadgeMarkers.set(p.id, badge);
      }
    }

    // ズーム変更時に半径を更新
    if (!this.placeZoomHandler) {
      this.placeZoomHandler = () => this.updatePlaceMarkerRadii();
      this.map.on("zoomend", this.placeZoomHandler);
    }
  }

  clearPlaces(): void {
    for (const m of this.placeMarkers.values()) {
      m.remove();
    }
    this.placeMarkers.clear();
    for (const b of this.placeBadgeMarkers.values()) {
      b.remove();
    }
    this.placeBadgeMarkers.clear();
    if (this.placeZoomHandler && this.map) {
      this.map.off("zoomend", this.placeZoomHandler);
      this.placeZoomHandler = null;
    }
  }

  // --- 読み取り専用の場所オーバーレイ（区域編集画面専用） ---
  // 仕様: docs/wants/03「区域編集画面での場所表示と番号再採番」。
  // ズーム PLACE_OVERLAY_MIN_ZOOM 以上でのみ描画し、一切のポインタ操作に反応しない。

  /**
   * 場所オーバーレイのデータを設定する。空配列で消去。
   * ズームが閾値未満の間はデータだけ保持し、閾値以上になったら描画する。
   */
  setPlaceOverlay(places: ReadonlyArray<PlaceOverlayItem>): void {
    this.placeOverlayItems = [...places];
    if (!this.map) return;
    if (!this.placeOverlayZoomHandler) {
      this.placeOverlayZoomHandler = () => this.renderPlaceOverlay();
      this.map.on("zoomend", this.placeOverlayZoomHandler);
    }
    this.renderPlaceOverlay();
  }

  clearPlaceOverlay(): void {
    this.placeOverlayItems = [];
    if (this.placeOverlayZoomHandler && this.map) {
      this.map.off("zoomend", this.placeOverlayZoomHandler);
      this.placeOverlayZoomHandler = null;
    }
    this.removePlaceOverlayLayers();
  }

  private removePlaceOverlayLayers(): void {
    for (const m of this.placeOverlayMarkers) m.remove();
    this.placeOverlayMarkers = [];
  }

  private renderPlaceOverlay(): void {
    this.removePlaceOverlayLayers();
    if (!this.map) return;
    const zoom = this.map.getZoom();
    if (zoom < PLACE_OVERLAY_MIN_ZOOM) return;
    const radius = getPlaceMarkerRadius(zoom);
    for (const p of this.placeOverlayItems) {
      const fill = p.orphan ? PLACE_OVERLAY_ORPHAN_COLOR : PLACE_OVERLAY_COLOR;
      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        color: "#fff",
        weight: 2,
        opacity: 0.85,
        fillColor: fill,
        fillOpacity: 0.55,
        interactive: false,
        pane: PLACE_OVERLAY_PANE,
      }).addTo(this.map);
      this.placeOverlayMarkers.push(marker);
      const badgeIcon = L.divIcon({
        className: "place-number-badge",
        html: `<span class="place-number-badge-text">${getPlaceBadgeText(p.index)}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const badge = L.marker([p.lat, p.lng], {
        icon: badgeIcon,
        interactive: false,
        keyboard: false,
        pane: PLACE_OVERLAY_PANE,
      }).addTo(this.map);
      this.placeOverlayMarkers.push(badge);
    }
  }

  /**
   * 場所マーカー移動の追従モードを開始する。
   * 仕様 03_地図機能.md「場所操作 / 移動」: 選択直後からマウス追従。
   * クリックで確定 / Esc キャンセル。移動中は地図ドラッグを無効化。
   */
  startPlaceMove(
    placeId: string,
    onConfirm: (lat: number, lng: number) => void,
    onCancel: () => void,
  ): void {
    if (!this.map) return;
    if (this.placeMoveSession) this.cancelPlaceMove();
    const map = this.map;
    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";

    // マーカーは閉包に捕捉せず毎回引く（セッション中に setPlaces が全マーカーを
    // 再生成しても、新しいマーカーに追従が乗り移るように）。
    const moveHandler = (e: L.LeafletMouseEvent) => {
      this.placeMarkers.get(placeId)?.setLatLng(e.latlng);
    };
    const clickHandler = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e.originalEvent);
      this.confirmPlaceMoveAt(e);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      this.cancelPlaceMove();
    };

    map.on("mousemove", moveHandler);
    map.on("click", clickHandler);
    document.addEventListener("keydown", keyHandler);

    this.placeMoveSession = {
      placeId,
      origLatLng: this.placeMarkers.get(placeId)?.getLatLng() ?? null,
      onConfirm,
      onCancel,
      moveHandler,
      clickHandler,
      keyHandler,
    };
  }

  /**
   * 場所移動セッション中のクリックを「移動の確定」として処理する（処理したら true）。
   * 確定クリックは map・追従中の自マーカー・ポリゴン等どのレイヤーにも落ち得るため、
   * 全経路がこの単一実装を通る（learnings L-018: 規則の複数実装を避ける）。
   * e.latlng は半径 10px 以下の circleMarker 上ではそのマーカー座標に差し替えられる
   * ため、originalEvent から実際のカーソル/タップ位置を取り直す。
   */
  private confirmPlaceMoveAt(e: L.LeafletMouseEvent): boolean {
    const s = this.placeMoveSession;
    if (!s || !this.map) return false;
    const { lat, lng } = this.map.mouseEventToLatLng(e.originalEvent);
    this.endPlaceMoveSession();
    s.onConfirm(lat, lng);
    return true;
  }

  /** 移動セッションを破棄してハンドラを外す (確定/キャンセル共通)。 */
  private endPlaceMoveSession(): void {
    const s = this.placeMoveSession;
    if (!s || !this.map) return;
    this.map.off("mousemove", s.moveHandler);
    this.map.off("click", s.clickHandler);
    document.removeEventListener("keydown", s.keyHandler);
    this.map.dragging.enable();
    this.map.getContainer().style.cursor = "";
    this.placeMoveSession = null;
  }

  cancelPlaceMove(): void {
    const s = this.placeMoveSession;
    if (!s) return;
    this.endPlaceMoveSession();
    // 追従で動かした表示位置を元へ戻す（データは未変更のため表示のみの復元）
    if (s.origLatLng) this.placeMarkers.get(s.placeId)?.setLatLng(s.origLatLng);
    s.onCancel();
  }

  isPlaceMoving(): boolean {
    return this.placeMoveSession !== null;
  }

  private updatePlaceMarkerRadii(): void {
    if (!this.map) return;
    const r = getPlaceMarkerRadius(this.map.getZoom());
    for (const m of this.placeMarkers.values()) {
      m.setRadius(r);
    }
  }

  focusPolygon(id: PolygonID): void {
    this.focusPolygons([id]);
  }

  /** 指定ポリゴン群（飛地含む）が全て収まる範囲へフォーカスする。 */
  focusPolygons(ids: readonly PolygonID[]): void {
    if (!this.map) return;
    let bounds: L.LatLngBounds | null = null;
    for (const id of ids) {
      const layer = this.polygonLayers.get(id as string);
      if (!layer) continue;
      bounds = bounds ? bounds.extend(layer.getBounds()) : layer.getBounds();
    }
    if (!bounds) return;
    // maxZoom は指定しない: 小さな区域では z17 上限がフィットを妨げ、周辺の
    // 広い範囲が表示されてしまう（区域が画面の一部にしか映らない）。ズームは
    // getBoundsZoom が地図の maxZoom(19) で自然にクランプする。
    this.map.flyToBounds(bounds, {
      padding: [50, 50],
      duration: 0.8,
    });
  }

  /** 指定座標へパン移動する (ズームレベルは変更しない)。 */
  focusPlace(lat: number, lng: number): void {
    if (!this.map) return;
    this.map.panTo([lat, lng]);
  }

  /** パネル開閉などで地図コンテナサイズが変わった際に呼ぶ。 */
  invalidateSize(): void {
    if (!this.map) return;
    this.map.invalidateSize();
  }

  // --- 現在地（wants/03「現在地マーカーと現在地への移動」） ---

  /** 現在地マーカー（青ドット＋精度円）を作成/更新する。 */
  setCurrentLocation(lat: number, lng: number, accuracyMeters: number): void {
    if (!this.map) return;
    const latlng: L.LatLngExpression = [lat, lng];
    if (this.currentLocationMarker) {
      this.currentLocationMarker.setLatLng(latlng);
    } else {
      this.currentLocationMarker = L.circleMarker(latlng, {
        pane: CURRENT_LOCATION_PANE,
        interactive: false,
        radius: 7,
        color: "#ffffff",
        weight: 3,
        fillColor: CURRENT_LOCATION_COLOR,
        fillOpacity: 1,
      }).addTo(this.map);
    }
    if (this.currentLocationAccuracyCircle) {
      this.currentLocationAccuracyCircle.setLatLng(latlng);
      this.currentLocationAccuracyCircle.setRadius(accuracyMeters);
    } else {
      this.currentLocationAccuracyCircle = L.circle(latlng, {
        pane: CURRENT_LOCATION_PANE,
        interactive: false,
        radius: accuracyMeters,
        color: CURRENT_LOCATION_COLOR,
        weight: 1,
        opacity: 0.4,
        fillColor: CURRENT_LOCATION_COLOR,
        fillOpacity: 0.1,
      }).addTo(this.map);
    }
  }

  /** 現在地へパンする。ズームは現状維持（LOCATE_MIN_ZOOM 未満なら引き上げ）。 */
  panToLocation(lat: number, lng: number): void {
    if (!this.map) return;
    const zoom = Math.max(this.map.getZoom(), LOCATE_MIN_ZOOM);
    this.map.setView([lat, lng], zoom);
  }

  /** 「現在地へ移動」ボタン（Leaflet コントロール, 右上）を追加する。 */
  addLocateControl(title: string, onClick: () => void): void {
    if (!this.map || this.locateControl) return;
    const control = new L.Control({ position: "topright" });
    control.onAdd = () => {
      const el = L.DomUtil.create(
        "div",
        "map-locate-control leaflet-bar",
      ) as HTMLDivElement;
      const btn = L.DomUtil.create(
        "button",
        "map-locate-btn",
        el,
      ) as HTMLButtonElement;
      btn.type = "button";
      btn.title = title;
      btn.setAttribute("aria-label", title);
      // 照準アイコン（クロスヘア）。外部アセットに依存しないインライン SVG
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="12" cy="12" r="1.8" fill="currentColor"/>' +
        '<path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>";
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        onClick();
      });
      L.DomEvent.disableClickPropagation(el);
      return el;
    };
    control.addTo(this.map);
    this.locateControl = control;
  }

  setLinkedPolygonIds(ids: Set<string>): void {
    this.linkedPolygonIds = ids;
  }

  // --- 区域IDラベル ---

  /** ポリゴンID→区域ID の対応を設定し、区域IDラベルと親番境界を描画し直す。 */
  setPolygonAreaIds(ids: ReadonlyMap<string, string>): void {
    this.polygonAreaIds = new Map(ids);
    this.refreshAreaIdLabels();
    this.refreshParentBoundaries();
    // 親番ごとの塗り分け色は区域ID対応に依存するため、表示中レイヤーを再スタイル
    for (const [layerId, layer] of this.polygonLayers) {
      const style = this.computePolygonStyle(layerId as PolygonID);
      if (style) layer.setStyle(style);
    }
  }

  /**
   * 区域IDラベルを現状のポリゴンに同期する。表示中ポリゴンのうち区域紐付け済みの
   * ものへ、ポリゴン中心（頂点平均）に非インタラクティブな divIcon を置く。
   * 頂点ドラッグ中に毎フレーム呼ばれるため、既存マーカーは位置更新で使い回す。
   * 詳細モード（訪問記録画面）でも表示する。表示中レイヤー＝対象＋隣接区域
   * のみなので、対象範囲は polygonLayers への追従で自然に絞られる。
   * ズームが AREA_ID_LABEL_MIN_ZOOM 未満の広域表示では全ラベルを消す
   * （docs/wants/03「区域IDラベル表示」）。
   */
  private refreshAreaIdLabels(): void {
    if (!this.map) return;
    const wanted = new Map<
      string,
      { lat: number; lng: number; text: string }
    >();
    if (this.editor && isAreaIdLabelZoomVisible(this.map.getZoom())) {
      for (const idStr of this.polygonLayers.keys()) {
        const text = this.polygonAreaIds.get(idStr);
        if (!text) continue;
        const ring = this.editor.getPolygonGeoJSON(idStr as PolygonID)
          ?.coordinates[0];
        if (!ring || ring.length === 0) continue;
        const center = polygonCenter(ring.map(([lng, lat]) => ({ lat, lng })));
        wanted.set(idStr, { ...center, text });
      }
    }
    for (const [id, entry] of this.areaIdLabelMarkers) {
      const next = wanted.get(id);
      if (!next || next.text !== entry.text) {
        entry.marker.remove();
        this.areaIdLabelMarkers.delete(id);
      }
    }
    for (const [id, { lat, lng, text }] of wanted) {
      const existing = this.areaIdLabelMarkers.get(id);
      if (existing) {
        existing.marker.setLatLng([lat, lng]);
        continue;
      }
      const el = document.createElement("span");
      el.className = "area-id-label-text";
      el.textContent = text;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "area-id-label",
          html: el,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(this.map);
      this.areaIdLabelMarkers.set(id, { marker, text });
    }
  }

  // --- 区域親番境界の強調帯 ---

  /**
   * 区域親番の境目にあたる辺へ、ポリゴン輪郭より下層に実線の太線を描く
   * （区域境界線が太線の手前に見える。docs/wants/03「区域親番境界の強調表示」）。
   * 境目判定は全活性ポリゴンの紐付けで行い、描画は表示中ポリゴン
   * （polygonLayers。詳細モードでは対象＋隣接のみ）の辺に絞る。
   * 頂点ドラッグ中に毎フレーム呼ばれるため、既存ポリラインは位置更新で使い回す。
   */
  private refreshParentBoundaries(): void {
    if (!this.map) return;
    const wanted = new Map<string, [L.LatLngTuple, L.LatLngTuple]>();
    if (this.editor && this.polygonAreaIds.size > 0) {
      const editor = this.editor;
      const polygons = editor
        .getPolygons()
        .filter((p) => editor.isPolygonActive(p.id));
      const boundaryEdges = computeParentBoundaryEdges(
        polygons.map((p) => ({
          id: p.id as string,
          // 穴の辺も境目判定に含める（穴の内側に別親番の区域が入り得るため）
          edgeIds: [...p.edgeIds, ...p.holes.flat()] as string[],
        })),
        this.polygonAreaIds,
      );
      const visibleEdges = new Set<string>();
      for (const p of polygons) {
        if (!this.polygonLayers.has(p.id as string)) continue;
        for (const eid of p.edgeIds) visibleEdges.add(eid as string);
        for (const hole of p.holes) {
          for (const eid of hole) visibleEdges.add(eid as string);
        }
      }
      for (const eid of boundaryEdges) {
        if (!visibleEdges.has(eid)) continue;
        const edge = editor.getEdge(eid as EdgeID);
        if (!edge) continue;
        const v1 = editor.getVertex(edge.v1);
        const v2 = editor.getVertex(edge.v2);
        if (!v1 || !v2) continue;
        wanted.set(eid, [
          [v1.lat, v1.lng],
          [v2.lat, v2.lng],
        ]);
      }
    }
    for (const [id, line] of this.parentBoundaryLayers) {
      if (!wanted.has(id)) {
        line.remove();
        this.parentBoundaryLayers.delete(id);
      }
    }
    const style = getParentBoundaryStyle();
    for (const [id, latlngs] of wanted) {
      const existing = this.parentBoundaryLayers.get(id);
      if (existing) {
        existing.setLatLngs(latlngs);
        continue;
      }
      // 専用ペイン（zIndex 390）に描くため、ポリゴン層の再追加でも順序が崩れない
      const line = L.polyline(latlngs, {
        ...style,
        pane: PARENT_BOUNDARY_PANE,
        interactive: false,
      }).addTo(this.map);
      this.parentBoundaryLayers.set(id, line);
    }
  }

  // --- 頂点ドラッグモード ---

  enableVertexDrag(callbacks: VertexDragCallbacks): void {
    this.vertexDragCallbacks = callbacks;
    // 既存の頂点マーカーにドラッグ機能を追加
    for (const [idStr, marker] of this.vertexLayers) {
      this.makeVertexDraggable(idStr as VertexID, marker);
    }
  }

  disableVertexDrag(): void {
    this.vertexDragCallbacks = null;
  }

  // --- ラバーバンド（描画モード用） ---

  enableRubberBand(): void {
    if (!this.map || this.mouseMoveHandler) return;

    this.mouseMoveHandler = (e: L.LeafletMouseEvent) => {
      if (!this.editor) {
        this.removeRubberBand();
        this.hideSnapIndicator();
        return;
      }

      // スナップインジケーター（頂点優先、次に線分上の最近点）。
      // 1 点目を置く前（ラバーバンド無し）でも表示する。
      const thresholdDeg = this.pixelsToDegrees(SNAP_THRESHOLD_PX);
      const nearVertex = this.editor.findNearestVertex(
        e.latlng.lat,
        e.latlng.lng,
        thresholdDeg,
      );
      const nearEdge = nearVertex
        ? null
        : this.editor.findNearestEdge(e.latlng.lat, e.latlng.lng, thresholdDeg);
      const snapPoint = nearVertex ?? nearEdge?.point ?? null;

      if (snapPoint) {
        this.showSnapIndicator(snapPoint.lat, snapPoint.lng);
      } else {
        this.hideSnapIndicator();
      }

      if (!this.lastPlacedVertexId) {
        this.removeRubberBand();
        return;
      }
      const lastVertex = this.editor.getVertex(this.lastPlacedVertexId);
      if (!lastVertex) {
        this.removeRubberBand();
        return;
      }

      const endLat = snapPoint ? snapPoint.lat : e.latlng.lat;
      const endLng = snapPoint ? snapPoint.lng : e.latlng.lng;

      const latlngs: L.LatLngTuple[] = [
        [lastVertex.lat, lastVertex.lng],
        [endLat, endLng],
      ];

      if (this.rubberBandLine) {
        this.rubberBandLine.setLatLngs(latlngs);
      } else {
        this.rubberBandLine = L.polyline(latlngs, {
          color: "#f39c12",
          weight: 3,
          dashArray: "6 4",
          opacity: 0.7,
        }).addTo(this.map!);
      }
    };

    this.mouseOutHandler = () => {
      this.removeRubberBand();
      this.hideSnapIndicator();
    };

    this.map.on("mousemove", this.mouseMoveHandler);
    this.map.on("mouseout", this.mouseOutHandler);
  }

  setRubberBandOrigin(vertexId: VertexID): void {
    this.lastPlacedVertexId = vertexId;
  }

  disableRubberBand(): void {
    if (this.map) {
      if (this.mouseMoveHandler) {
        this.map.off("mousemove", this.mouseMoveHandler);
      }
      if (this.mouseOutHandler) {
        this.map.off("mouseout", this.mouseOutHandler);
      }
    }
    this.mouseMoveHandler = null;
    this.mouseOutHandler = null;
    this.removeRubberBand();
    this.hideSnapIndicator();
    this.lastPlacedVertexId = null;
  }

  private removeRubberBand(): void {
    if (this.rubberBandLine) {
      this.rubberBandLine.remove();
      this.rubberBandLine = null;
    }
  }

  // --- スナップ ---

  private showSnapIndicator(lat: number, lng: number): void {
    if (this.snapIndicator) {
      this.snapIndicator.setLatLng([lat, lng]);
    } else if (this.map) {
      this.snapIndicator = L.circleMarker([lat, lng], {
        radius: 8,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.6,
        weight: 2,
      }).addTo(this.map);
    }
  }

  private hideSnapIndicator(): void {
    if (this.snapIndicator) {
      this.snapIndicator.remove();
      this.snapIndicator = null;
    }
  }

  /** ピクセル閾値を度数に変換（現在のズームレベルで） */
  pixelsToDegrees(px: number): number {
    if (!this.map) return 0.001;
    const center = this.map.getCenter();
    const point = this.map.latLngToContainerPoint(center);
    const offset = this.map.containerPointToLatLng(
      L.point(point.x + px, point.y),
    );
    return Math.abs(offset.lng - center.lng);
  }

  getSnapThresholdPx(): number {
    return SNAP_THRESHOLD_PX;
  }

  getVertexAttractThresholdPx(): number {
    return VERTEX_ATTRACT_THRESHOLD_PX;
  }
}

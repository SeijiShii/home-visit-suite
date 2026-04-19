import L from "leaflet";
import type {
  ChangeSet,
  PolygonID,
  VertexID,
  EdgeID,
  NetworkPolygonEditor,
} from "map-polygon-editor";

const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

const SNAP_THRESHOLD_PX = 20;

export interface PolygonStyle {
  color: string;
  weight: number;
  fillOpacity: number;
}

export function getPolygonStyle(
  isLinked: boolean,
  isSelected: boolean,
): PolygonStyle {
  if (isLinked) {
    return isSelected
      ? { color: "#166534", weight: 3, fillOpacity: 0.35 }
      : { color: "#22c55e", weight: 2, fillOpacity: 0.15 };
  }
  return isSelected
    ? { color: "#1e40af", weight: 3, fillOpacity: 0.35 }
    : { color: "#3b82f6", weight: 2, fillOpacity: 0.15 };
}

export type AreaDetailPolygonRole = "target" | "neighbor";

/**
 * 区域詳細編集モード用ポリゴンスタイル。塗りつぶしなし、対象=濃色太線/隣接=薄色細線。
 * 仕様: docs/wants/03_地図機能.md「区域詳細編集モード」描画ルール。
 */
export function getAreaDetailPolygonStyle(
  role: AreaDetailPolygonRole,
): PolygonStyle {
  if (role === "target") {
    return { color: "#166534", weight: 4, fillOpacity: 0 };
  }
  return { color: "#86efac", weight: 2, fillOpacity: 0 };
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

// 日本の中心付近（成田市）
const DEFAULT_CENTER: L.LatLngExpression = [35.776, 140.318];
const DEFAULT_ZOOM = 14;
const VIEW_STORAGE_KEY = "map-view";

export interface VertexDragCallbacks {
  onDragStart: (vertexId: VertexID) => void;
  onDragMove: (vertexId: VertexID, lat: number, lng: number) => void;
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

  // ポリゴンメタデータ（区域紐付け、選択状態）
  private linkedPolygonIds: Set<string> = new Set();
  private selectedId: string | null = null;
  private polygonClickCallback: ((id: PolygonID) => void) | null = null;
  private polygonDoubleClickCallback: ((id: PolygonID) => void) | null = null;

  // 区域詳細編集モード: target/neighbor のみ描画 (それ以外は非表示)
  private detailMode: {
    targetId: string;
    neighborIds: Set<string>;
  } | null = null;

  // 場所マーカー (詳細編集モード時のみ表示)
  private placeMarkers = new Map<string, L.CircleMarker>();
  private placeBadgeMarkers = new Map<string, L.Marker>();
  private placeContextMenuCallback:
    | ((placeId: string, type: PlaceType, x: number, y: number) => void)
    | null = null;
  private placeZoomHandler: (() => void) | null = null;

  // 場所マーカー移動追従モード
  private placeMoveSession: {
    placeId: string;
    onConfirm: (lat: number, lng: number) => void;
    onCancel: () => void;
    moveHandler: (e: L.LeafletMouseEvent) => void;
    clickHandler: (e: L.LeafletMouseEvent) => void;
    keyHandler: (e: KeyboardEvent) => void;
  } | null = null;

  // 頂点表示制御
  private verticesVisible = false;

  // 頂点ドラッグ
  private vertexDragCallbacks: VertexDragCallbacks | null = null;
  private draggableVertexIds = new Set<string>();

  // ホバーコールバック（ヘルプツールチップ用）
  private vertexHoverCallback: ((id: VertexID) => void) | null = null;
  private edgeHoverCallback: ((id: EdgeID) => void) | null = null;
  private polygonHoverCallback: ((id: PolygonID) => void) | null = null;

  mount(container: HTMLElement, callbacks: MapRendererCallbacks = {}): void {
    const saved = this.loadView();
    const center = saved
      ? ([saved.lat, saved.lng] as L.LatLngExpression)
      : DEFAULT_CENTER;
    const zoom = saved ? saved.zoom : DEFAULT_ZOOM;

    this.map = L.map(container, {
      doubleClickZoom: false,
      maxZoom: 19,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 120,
      clickTolerance: 8,
    } as L.MapOptions).setView(center, zoom);

    L.tileLayer(GSI_TILE_URL, {
      attribution: GSI_ATTRIBUTION,
      maxNativeZoom: 18,
      maxZoom: 19,
    }).addTo(this.map);

    this.map.on("moveend", () => this.saveView());

    if (callbacks.onMapClick) {
      this.map.on("click", (e: L.LeafletMouseEvent) => {
        callbacks.onMapClick!(e.latlng.lat, e.latlng.lng);
      });
    }

    if (callbacks.onContextMenu) {
      this.map.on("contextmenu", (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
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
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.vertexLayers.clear();
    this.edgeLayers.clear();
    this.polygonLayers.clear();
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
    if (this.draggableVertexIds.has(id as string)) return;
    this.draggableVertexIds.add(id as string);

    let dragging = false;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!this.map || !this.vertexDragCallbacks) return;
      dragging = true;
      this.map.dragging.disable();
      L.DomEvent.stop(e.originalEvent);
      this.vertexDragCallbacks.onDragStart(id);

      const onMouseMove = (ev: L.LeafletMouseEvent) => {
        if (!dragging) return;
        marker.setLatLng(ev.latlng);
        this.vertexDragCallbacks?.onDragMove(id, ev.latlng.lat, ev.latlng.lng);
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
      if (this.detailMode.targetId === idStr) {
        return getAreaDetailPolygonStyle("target");
      }
      if (this.detailMode.neighborIds.has(idStr)) {
        return getAreaDetailPolygonStyle("neighbor");
      }
      // detail モード中は対象/隣接以外を非表示
      return null;
    }
    const isLinked = this.linkedPolygonIds.has(idStr);
    const isSelected = this.selectedId === idStr;
    return getPolygonStyle(isLinked, isSelected);
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
        L.DomEvent.stopPropagation(e);
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
   * 区域詳細編集モードに入る。target は濃色、neighbors は薄色で描画され、
   * それ以外のポリゴンは非表示。再描画は呼び出し側で renderAll() を実行すること。
   */
  setDetailMode(targetId: PolygonID, neighborIds: Set<string>): void {
    this.detailMode = {
      targetId: targetId as string,
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
      | ((placeId: string, type: PlaceType, x: number, y: number) => void)
      | null,
  ): void {
    this.placeContextMenuCallback = cb;
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
        this.placeContextMenuCallback?.(
          p.id,
          p.type,
          e.containerPoint.x,
          e.containerPoint.y,
        );
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
    const marker = this.placeMarkers.get(placeId);
    map.dragging.disable();
    map.getContainer().style.cursor = "crosshair";

    const moveHandler = (e: L.LeafletMouseEvent) => {
      if (marker) marker.setLatLng(e.latlng);
    };
    const clickHandler = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e.originalEvent);
      const { lat, lng } = e.latlng;
      this.endPlaceMoveSession();
      onConfirm(lat, lng);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      this.endPlaceMoveSession();
      onCancel();
    };

    map.on("mousemove", moveHandler);
    map.on("click", clickHandler);
    document.addEventListener("keydown", keyHandler);

    this.placeMoveSession = {
      placeId,
      onConfirm,
      onCancel,
      moveHandler,
      clickHandler,
      keyHandler,
    };
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
    if (!this.map) return;
    const layer = this.polygonLayers.get(id as string);
    if (!layer) return;
    this.map.flyToBounds(layer.getBounds(), {
      padding: [50, 50],
      maxZoom: 17,
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

  setLinkedPolygonIds(ids: Set<string>): void {
    this.linkedPolygonIds = ids;
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
      if (!this.editor || !this.lastPlacedVertexId) {
        this.removeRubberBand();
        this.hideSnapIndicator();
        return;
      }

      const lastVertex = this.editor.getVertex(this.lastPlacedVertexId);
      if (!lastVertex) {
        this.removeRubberBand();
        return;
      }

      // スナップインジケーター
      const thresholdDeg = this.pixelsToDegrees(SNAP_THRESHOLD_PX);
      const nearVertex = this.editor.findNearestVertex(
        e.latlng.lat,
        e.latlng.lng,
        thresholdDeg,
      );

      if (nearVertex) {
        this.showSnapIndicator(nearVertex.lat, nearVertex.lng);
      } else {
        this.hideSnapIndicator();
      }

      const endLat = nearVertex ? nearVertex.lat : e.latlng.lat;
      const endLng = nearVertex ? nearVertex.lng : e.latlng.lng;

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
}

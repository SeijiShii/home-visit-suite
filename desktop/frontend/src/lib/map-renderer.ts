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

  // 頂点表示制御
  private verticesVisible = false;

  // 頂点ドラッグ
  private vertexDragCallbacks: VertexDragCallbacks | null = null;
  private draggableVertexIds = new Set<string>();

  // ホバーコールバック（ヘルプツールチップ用）
  private vertexHoverCallback: ((id: VertexID) => void) | null = null;
  private edgeHoverCallback: ((id: EdgeID) => void) | null = null;

  mount(container: HTMLElement, callbacks: MapRendererCallbacks = {}): void {
    const saved = this.loadView();
    const center = saved
      ? ([saved.lat, saved.lng] as L.LatLngExpression)
      : DEFAULT_CENTER;
    const zoom = saved ? saved.zoom : DEFAULT_ZOOM;

    this.map = L.map(container, {
      doubleClickZoom: false,
      maxZoom: 19,
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
    this.vertexHoverCallback = callbacks.onVertexHover ?? null;
    this.edgeHoverCallback = callbacks.onEdgeHover ?? null;
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

  private addPolygonLayer(id: PolygonID): void {
    if (!this.map || !this.editor) return;

    // 不活性ポリゴンはレイヤーを追加しない
    if (!this.editor.isPolygonActive(id)) return;

    const geo = this.editor.getPolygonGeoJSON(id);
    if (!geo) return;

    const isLinked = this.linkedPolygonIds.has(id as string);
    const isSelected = this.selectedId === (id as string);
    const style = getPolygonStyle(isLinked, isSelected);

    const feature = {
      type: "Feature" as const,
      geometry: geo,
      properties: {},
    };
    const layer = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
      style: () => style,
    }).addTo(this.map);

    if (this.polygonClickCallback) {
      layer.on("click", () => {
        this.polygonClickCallback!(id);
      });
    }

    this.polygonLayers.set(id as string, layer);
  }

  // --- ポリゴン選択/ハイライト ---

  highlightPolygon(id: PolygonID | null): void {
    this.selectedId = id as string | null;
    // ポリゴンレイヤーを再スタイル
    for (const [layerId, layer] of this.polygonLayers) {
      const isLinked = this.linkedPolygonIds.has(layerId);
      const isSelected = layerId === (id as string);
      layer.setStyle(getPolygonStyle(isLinked, isSelected));
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

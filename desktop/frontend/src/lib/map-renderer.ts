import L from "leaflet";
import type { MapPolygon, DraftShape, PolygonID } from "map-polygon-editor";
import type { BridgeInfo } from "./drawing-controller";

const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

const SNAP_THRESHOLD_PX = 20;

export interface PolygonStyle {
  color: string;
  weight: number;
  fillOpacity: number;
}

export interface SnapVertex {
  lat: number;
  lng: number;
  polygonId: string;
  vertexIndex: number;
}

export interface SnapInfo {
  lat: number;
  lng: number;
  /** ポリゴン頂点にスナップした場合のみセット */
  anchor?: { polygonId: string; vertexIndex: number };
}

export function findNearestVertex(
  lat: number,
  lng: number,
  vertices: SnapVertex[],
  threshold: number,
): SnapVertex | null {
  let nearest: SnapVertex | null = null;
  let minDist = Infinity;
  for (const v of vertices) {
    const dlat = v.lat - lat;
    const dlng = v.lng - lng;
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist < threshold && dist < minDist) {
      minDist = dist;
      nearest = v;
    }
  }
  return nearest;
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

export interface VertexDragEvent {
  polygonId: string;
  vertexIndex: number;
  lat: number;
  lng: number;
}

export interface EdgeClickEvent {
  polygonId: string;
  afterIndex: number;
  lat: number;
  lng: number;
}

export interface MapRendererCallbacks {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
  onContextMenu?: () => void;
}

export class MapRenderer {
  private map: L.Map | null = null;
  private polygonLayers = new Map<string, L.Polygon>();
  private draftLayer: L.LayerGroup | null = null;
  private rubberBandLine: L.Polyline | null = null;
  private currentDraft: DraftShape | null = null;
  private mouseMoveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
  private mouseOutHandler: (() => void) | null = null;
  private snapIndicator: L.CircleMarker | null = null;
  private editMarkers: L.Marker[] = [];
  private editingPolygonId: string | null = null;
  private onVertexDragCallback: ((event: VertexDragEvent) => void) | null =
    null;

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

    this.draftLayer = L.layerGroup().addTo(this.map);

    this.map.on("moveend", () => this.saveView());

    if (callbacks.onMapClick) {
      this.map.on("click", (e: L.LeafletMouseEvent) => {
        callbacks.onMapClick!(e.latlng.lat, e.latlng.lng);
      });
    }

    if (callbacks.onContextMenu) {
      this.map.on("contextmenu", (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
        callbacks.onContextMenu!();
      });
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
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.polygonLayers.clear();
    this.draftLayer = null;
  }

  private linkedPolygonIds: Set<string> = new Set();
  private selectedId: string | null = null;

  renderPolygons(
    polygons: MapPolygon[],
    callbacks: MapRendererCallbacks = {},
    linkedPolygonIds?: Set<string>,
  ): void {
    if (!this.map) return;

    if (linkedPolygonIds) {
      this.linkedPolygonIds = linkedPolygonIds;
    }

    // 既存レイヤーをクリア
    this.polygonLayers.forEach((layer) => layer.remove());
    this.polygonLayers.clear();

    for (const poly of polygons) {
      const coords = poly.geometry.coordinates[0];
      // GeoJSON: [lng, lat] → Leaflet: [lat, lng]
      const latLngs = coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);

      const isLinked = this.linkedPolygonIds.has(poly.id as string);
      const isSelected = this.selectedId === (poly.id as string);
      const style = getPolygonStyle(isLinked, isSelected);

      const layer = L.polygon(latLngs, style).addTo(this.map!);

      layer.bindTooltip(poly.display_name);

      if (callbacks.onPolygonClick) {
        layer.on("click", () => {
          callbacks.onPolygonClick!(poly.id);
        });
      }

      this.polygonLayers.set(poly.id as string, layer);
    }
  }

  highlightPolygon(id: PolygonID | null): void {
    this.selectedId = id as string | null;
    this.polygonLayers.forEach((layer, layerId) => {
      const isLinked = this.linkedPolygonIds.has(layerId);
      const isSelected = layerId === (id as string);
      layer.setStyle(getPolygonStyle(isLinked, isSelected));
    });
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

  enterEditMode(
    id: PolygonID,
    onVertexDrag: (event: VertexDragEvent) => void,
  ): void {
    if (!this.map) return;
    this.exitEditMode();
    this.editingPolygonId = id as string;
    this.onVertexDragCallback = onVertexDrag;

    this.buildEditMarkers(id as string, onVertexDrag);
  }

  /**
   * 編集中のポリゴンの辺近傍にクリックがあるか判定。
   * 辺に近ければ EdgeClickEvent を返し、遠ければ null。
   */
  findEdgeAtClick(lat: number, lng: number): EdgeClickEvent | null {
    if (!this.editingPolygonId) return null;
    const result = this.findNearestEdge(lat, lng, this.editingPolygonId);
    if (!result) return null;
    return {
      polygonId: this.editingPolygonId,
      afterIndex: result.afterIndex,
      lat: result.lat,
      lng: result.lng,
    };
  }

  private buildEditMarkers(
    polygonId: string,
    onVertexDrag: (event: VertexDragEvent) => void,
  ): void {
    if (!this.map) return;
    for (const m of this.editMarkers) m.remove();
    this.editMarkers = [];

    const layer = this.polygonLayers.get(polygonId);
    if (!layer) return;

    const latlngs = layer.getLatLngs()[0] as L.LatLng[];

    for (let i = 0; i < latlngs.length; i++) {
      const ll = latlngs[i];
      const marker = L.marker([ll.lat, ll.lng], {
        draggable: true,
        icon: L.divIcon({
          className: "edit-vertex-marker",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(this.map);

      const vertexIndex = i;

      // ドラッグ中: ポリゴン形状をリアルタイム更新（ラバーバンド）
      marker.on("drag", () => {
        const pos = marker.getLatLng();
        const currentLatLngs = layer.getLatLngs()[0] as L.LatLng[];
        currentLatLngs[vertexIndex] = pos;
        layer.setLatLngs(currentLatLngs);
      });

      // ドラッグ終了: 永続化
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onVertexDrag({
          polygonId,
          vertexIndex,
          lat: pos.lat,
          lng: pos.lng,
        });
      });

      this.editMarkers.push(marker);
    }
  }

  exitEditMode(): void {
    this.onVertexDragCallback = null;
    for (const marker of this.editMarkers) {
      marker.remove();
    }
    this.editMarkers = [];
    this.editingPolygonId = null;
  }

  /** 頂点追加後にマーカーを再構築 */
  rebuildEditMarkers(polygon: MapPolygon): void {
    if (!this.editingPolygonId || !this.map || !this.onVertexDragCallback)
      return;

    const layer = this.polygonLayers.get(polygon.id as string);
    if (layer) {
      const coords = polygon.geometry.coordinates[0];
      const latLngs = coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      layer.setLatLngs(latLngs);
    }

    this.buildEditMarkers(this.editingPolygonId, this.onVertexDragCallback);
  }

  /**
   * 編集中のポリゴンの辺のうち、クリック地点に最も近いものを返す。
   * ピクセルベースの閾値 (SNAP_THRESHOLD_PX) で判定。
   */
  private findNearestEdge(
    lat: number,
    lng: number,
    polygonId: string,
  ): { afterIndex: number; lat: number; lng: number } | null {
    if (!this.map) return null;
    const layer = this.polygonLayers.get(polygonId);
    if (!layer) return null;

    const latlngs = layer.getLatLngs()[0] as L.LatLng[];
    const clickPx = this.map.latLngToContainerPoint([lat, lng]);
    const n = latlngs.length;

    let bestDist = Infinity;
    let bestResult: { afterIndex: number; lat: number; lng: number } | null =
      null;

    for (let i = 0; i < n; i++) {
      const a = latlngs[i];
      const b = latlngs[(i + 1) % n];
      const aPx = this.map.latLngToContainerPoint(a);
      const bPx = this.map.latLngToContainerPoint(b);

      // 頂点近傍はスキップ（頂点ドラッグと競合しないように）
      const dToA = Math.sqrt(
        (clickPx.x - aPx.x) ** 2 + (clickPx.y - aPx.y) ** 2,
      );
      const dToB = Math.sqrt(
        (clickPx.x - bPx.x) ** 2 + (clickPx.y - bPx.y) ** 2,
      );
      if (dToA < SNAP_THRESHOLD_PX || dToB < SNAP_THRESHOLD_PX) continue;

      // 線分への射影
      const proj = this.projectPointToSegment(clickPx, aPx, bPx);
      const dist = Math.sqrt(
        (clickPx.x - proj.x) ** 2 + (clickPx.y - proj.y) ** 2,
      );

      if (dist < SNAP_THRESHOLD_PX && dist < bestDist) {
        bestDist = dist;
        const projLatLng = this.map.containerPointToLatLng(proj);
        bestResult = {
          afterIndex: i,
          lat: projLatLng.lat,
          lng: projLatLng.lng,
        };
      }
    }

    return bestResult;
  }

  private projectPointToSegment(p: L.Point, a: L.Point, b: L.Point): L.Point {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return a;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
    );
    return L.point(a.x + t * dx, a.y + t * dy);
  }

  /** 編集中のポリゴンの頂点マーカーを再配置（頂点移動後） */
  updateEditMarkers(polygons: MapPolygon[]): void {
    if (!this.editingPolygonId || !this.map) return;

    // 変更されたポリゴンのレイヤーを更新
    for (const poly of polygons) {
      const layer = this.polygonLayers.get(poly.id as string);
      if (layer) {
        const coords = poly.geometry.coordinates[0];
        const latLngs = coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
        layer.setLatLngs(latLngs);
      }
    }

    // 編集中のポリゴンのマーカーを新しい座標に移動
    const editingPoly = polygons.find(
      (p) => (p.id as string) === this.editingPolygonId,
    );
    if (!editingPoly) return;

    const coords = editingPoly.geometry.coordinates[0];
    // GeoJSON ring は最初と最後が同じなので -1
    const vertexCount = coords.length - 1;
    for (let i = 0; i < this.editMarkers.length && i < vertexCount; i++) {
      const [lng, lat] = coords[i];
      this.editMarkers[i].setLatLng([lat, lng]);
    }
  }

  renderDraft(
    draft: DraftShape | null,
    bridgeInfo?: BridgeInfo | null,
    isSplitMode?: boolean,
  ): void {
    if (!this.draftLayer) return;
    this.draftLayer.clearLayers();
    this.currentDraft = draft;

    if (!draft || draft.points.length === 0) {
      this.removeRubberBand();
      return;
    }

    const latLngs = draft.points.map((p) => [p.lat, p.lng] as L.LatLngTuple);

    if (isSplitMode) {
      // 分割モード: 赤い破線で分割パスを表示
      this.removeRubberBand();
      L.polyline(latLngs, {
        color: "#ef4444",
        weight: 3,
        dashArray: "8, 4",
      }).addTo(this.draftLayer);
    } else if (draft.isClosed) {
      this.removeRubberBand();
      // ブリッジプレビュー: 既存ポリゴン境界に沿った形状を表示
      const previewLatLngs = bridgeInfo
        ? this.computeBridgePreview(draft, bridgeInfo)
        : null;

      L.polygon(previewLatLngs ?? latLngs, {
        color: "#22c55e",
        weight: 3,
        fillOpacity: 0.2,
        dashArray: "5, 5",
      }).addTo(this.draftLayer);
    } else {
      L.polyline(latLngs, {
        color: "#22c55e",
        weight: 3,
        dashArray: "5, 5",
      }).addTo(this.draftLayer);
    }

    // 頂点マーカー
    const markerColor = isSplitMode ? "#ef4444" : "#22c55e";
    for (const p of draft.points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: markerColor,
        fillColor: "#fff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(this.draftLayer);
    }
  }

  private computeBridgePreview(
    draft: DraftShape,
    bridgeInfo: BridgeInfo,
  ): L.LatLngTuple[] | null {
    // 同一ポリゴンのブリッジのみ対応
    if (bridgeInfo.startPolygonId !== bridgeInfo.endPolygonId) return null;

    const polygonLayer = this.polygonLayers.get(bridgeInfo.startPolygonId);
    if (!polygonLayer) return null;

    const polyLatLngs = polygonLayer.getLatLngs()[0] as L.LatLng[];
    const n = polyLatLngs.length;
    const startIdx = bridgeInfo.startVertexIndex;
    const endIdx = bridgeInfo.endVertexIndex;

    // 同一頂点の場合はドラフトをそのまま表示
    if (startIdx === endIdx) return null;

    // ドラフトポイント（開始頂点→終了頂点の描画パス）
    const draftLatLngs = draft.points.map(
      (p) => [p.lat, p.lng] as L.LatLngTuple,
    );

    // 既存ポリゴン境界を endIdx → startIdx で歩く（2方向試して短い方）
    const forwardPath: L.LatLngTuple[] = [];
    let i = endIdx;
    while (true) {
      i = (i + 1) % n;
      if (i === startIdx) break;
      forwardPath.push([polyLatLngs[i].lat, polyLatLngs[i].lng]);
    }

    const backwardPath: L.LatLngTuple[] = [];
    i = endIdx;
    while (true) {
      i = (i - 1 + n) % n;
      if (i === startIdx) break;
      backwardPath.push([polyLatLngs[i].lat, polyLatLngs[i].lng]);
    }

    const boundaryPath =
      forwardPath.length <= backwardPath.length ? forwardPath : backwardPath;

    return [...draftLatLngs, ...boundaryPath];
  }

  isNearStartPoint(lat: number, lng: number): boolean {
    if (
      !this.map ||
      !this.currentDraft ||
      this.currentDraft.points.length < 3
    ) {
      return false;
    }
    const start = this.currentDraft.points[0];
    const cursorPx = this.map.latLngToContainerPoint([lat, lng]);
    const startPx = this.map.latLngToContainerPoint([start.lat, start.lng]);
    const dx = cursorPx.x - startPx.x;
    const dy = cursorPx.y - startPx.y;
    return Math.sqrt(dx * dx + dy * dy) < SNAP_THRESHOLD_PX;
  }

  collectAllVertices(): SnapVertex[] {
    const vertices: SnapVertex[] = [];
    this.polygonLayers.forEach((layer, id) => {
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      for (let i = 0; i < latlngs.length; i++) {
        const ll = latlngs[i];
        vertices.push({
          lat: ll.lat,
          lng: ll.lng,
          polygonId: id,
          vertexIndex: i,
        });
      }
    });
    return vertices;
  }

  findSnapTarget(lat: number, lng: number): SnapInfo | null {
    if (!this.map) return null;

    // Check all polygon vertices first
    const vertices = this.collectAllVertices();
    const cursorPx = this.map.latLngToContainerPoint([lat, lng]);
    let nearestVertex: SnapVertex | null = null;
    let minDist = Infinity;

    for (const v of vertices) {
      const vPx = this.map.latLngToContainerPoint([v.lat, v.lng]);
      const dx = cursorPx.x - vPx.x;
      const dy = cursorPx.y - vPx.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SNAP_THRESHOLD_PX && dist < minDist) {
        minDist = dist;
        nearestVertex = v;
      }
    }

    if (nearestVertex) {
      return {
        lat: nearestVertex.lat,
        lng: nearestVertex.lng,
        anchor: {
          polygonId: nearestVertex.polygonId,
          vertexIndex: nearestVertex.vertexIndex,
        },
      };
    }

    // Check draft start point (for closing)
    if (this.currentDraft && this.currentDraft.points.length >= 3) {
      const start = this.currentDraft.points[0];
      const startPx = this.map.latLngToContainerPoint([start.lat, start.lng]);
      const dx = cursorPx.x - startPx.x;
      const dy = cursorPx.y - startPx.y;
      if (Math.sqrt(dx * dx + dy * dy) < SNAP_THRESHOLD_PX) {
        return { lat: start.lat, lng: start.lng };
      }
    }

    return null;
  }

  getSnapInfo(lat: number, lng: number): SnapInfo | null {
    return this.findSnapTarget(lat, lng);
  }

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

  enableRubberBand(): void {
    if (!this.map || this.mouseMoveHandler) return;

    this.mouseMoveHandler = (e: L.LeafletMouseEvent) => {
      const draft = this.currentDraft;

      // スナップインジケーター: ポイント0個（描画開始前）でも表示
      const snap = this.findSnapTarget(e.latlng.lat, e.latlng.lng);
      if (snap) {
        this.showSnapIndicator(snap.lat, snap.lng);
      } else {
        this.hideSnapIndicator();
      }

      // ラバーバンド: ポイントが1つ以上あるときのみ
      if (!draft || draft.points.length === 0 || draft.isClosed) {
        this.removeRubberBand();
        return;
      }

      const endLat = snap ? snap.lat : e.latlng.lat;
      const endLng = snap ? snap.lng : e.latlng.lng;

      const lastPoint = draft.points[draft.points.length - 1];
      const latlngs: L.LatLngTuple[] = [
        [lastPoint.lat, lastPoint.lng],
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
  }

  private removeRubberBand(): void {
    if (this.rubberBandLine) {
      this.rubberBandLine.remove();
      this.rubberBandLine = null;
    }
  }
}

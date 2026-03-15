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

  mount(container: HTMLElement, callbacks: MapRendererCallbacks = {}): void {
    const saved = this.loadView();
    const center = saved
      ? ([saved.lat, saved.lng] as L.LatLngExpression)
      : DEFAULT_CENTER;
    const zoom = saved ? saved.zoom : DEFAULT_ZOOM;

    this.map = L.map(container, {
      doubleClickZoom: false,
      maxZoom: 19,
    }).setView(center, zoom);

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

  renderDraft(draft: DraftShape | null, bridgeInfo?: BridgeInfo | null): void {
    if (!this.draftLayer) return;
    this.draftLayer.clearLayers();
    this.currentDraft = draft;

    if (!draft || draft.points.length === 0) {
      this.removeRubberBand();
      return;
    }

    const latLngs = draft.points.map((p) => [p.lat, p.lng] as L.LatLngTuple);

    if (draft.isClosed) {
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
    for (const p of draft.points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: "#22c55e",
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

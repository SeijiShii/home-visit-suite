import L from "leaflet";
import type { MapPolygon, DraftShape, PolygonID } from "map-polygon-editor";

const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

const SNAP_THRESHOLD_PX = 20;

// 日本の中心付近（成田市）
const DEFAULT_CENTER: L.LatLngExpression = [35.776, 140.318];
const DEFAULT_ZOOM = 14;
const VIEW_STORAGE_KEY = "map-view";

export interface MapRendererCallbacks {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
}

export class MapRenderer {
  private map: L.Map | null = null;
  private polygonLayers = new Map<string, L.Polygon>();
  private draftLayer: L.LayerGroup | null = null;
  private rubberBandLine: L.Polyline | null = null;
  private currentDraft: DraftShape | null = null;
  private mouseMoveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
  private mouseOutHandler: (() => void) | null = null;

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

  renderPolygons(
    polygons: MapPolygon[],
    callbacks: MapRendererCallbacks = {},
  ): void {
    if (!this.map) return;

    // 既存レイヤーをクリア
    this.polygonLayers.forEach((layer) => layer.remove());
    this.polygonLayers.clear();

    for (const poly of polygons) {
      const coords = poly.geometry.coordinates[0];
      // GeoJSON: [lng, lat] → Leaflet: [lat, lng]
      const latLngs = coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);

      const layer = L.polygon(latLngs, {
        color: "#3b82f6",
        weight: 2,
        fillOpacity: 0.15,
      }).addTo(this.map!);

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
    this.polygonLayers.forEach((layer, layerId) => {
      if (layerId === (id as string)) {
        layer.setStyle({ color: "#ef4444", weight: 3, fillOpacity: 0.3 });
      } else {
        layer.setStyle({ color: "#3b82f6", weight: 2, fillOpacity: 0.15 });
      }
    });
  }

  renderDraft(draft: DraftShape | null): void {
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
      L.polygon(latLngs, {
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

  enableRubberBand(): void {
    if (!this.map || this.mouseMoveHandler) return;

    this.mouseMoveHandler = (e: L.LeafletMouseEvent) => {
      const draft = this.currentDraft;
      if (!draft || draft.points.length === 0 || draft.isClosed) {
        this.removeRubberBand();
        return;
      }

      const lastPoint = draft.points[draft.points.length - 1];
      const latlngs: L.LatLngTuple[] = [
        [lastPoint.lat, lastPoint.lng],
        [e.latlng.lat, e.latlng.lng],
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
  }

  private removeRubberBand(): void {
    if (this.rubberBandLine) {
      this.rubberBandLine.remove();
      this.rubberBandLine = null;
    }
  }
}

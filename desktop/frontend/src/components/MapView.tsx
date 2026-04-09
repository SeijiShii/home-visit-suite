import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import {
  MapRenderer,
  type VertexDragCallbacks,
  type PlaceType,
} from "../lib/map-renderer";
import type {
  ChangeSet,
  PolygonID,
  VertexID,
  EdgeID,
  NetworkPolygonEditor,
} from "map-polygon-editor";

export interface MapViewHandle {
  applyChangeSet(cs: ChangeSet): void;
  renderAll(linkedPolygonIds?: Set<string>): void;
  setEditor(editor: NetworkPolygonEditor): void;
  setCursor(cursor: string): void;
  highlightPolygon(id: PolygonID | null): void;
  focusPolygon(id: PolygonID): void;
  setLinkedPolygonIds(ids: Set<string>): void;
  enableRubberBand(): void;
  disableRubberBand(): void;
  setRubberBandOrigin(vertexId: VertexID): void;
  enableVertexDrag(callbacks: VertexDragCallbacks): void;
  disableVertexDrag(): void;
  showVertices(): void;
  hideVertices(): void;
  pixelsToDegrees(px: number): number;
  getSnapThresholdPx(): number;
  // --- 区域詳細編集モード ---
  setDetailMode(targetId: PolygonID, neighborIds: Set<string>): void;
  clearDetailMode(): void;
  setPlaces(
    places: ReadonlyArray<{
      id: string;
      lat: number;
      lng: number;
      type: PlaceType;
    }>,
  ): void;
  clearPlaces(): void;
  setMinZoom(zoom: number): void;
  clearMinZoom(): void;
  setPlaceContextMenuHandler(
    cb:
      | ((placeId: string, type: PlaceType, x: number, y: number) => void)
      | null,
  ): void;
}

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
  onPolygonDoubleClick?: (id: PolygonID) => void;
  onContextMenu?: (
    lat: number,
    lng: number,
    containerX: number,
    containerY: number,
  ) => void;
  onVertexHover?: (id: VertexID) => void;
  onEdgeHover?: (id: EdgeID) => void;
  onPolygonHover?: (id: PolygonID) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const callbacksRef = useRef({
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  });
  callbacksRef.current = {
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  };

  useImperativeHandle(ref, () => ({
    applyChangeSet(cs) {
      rendererRef.current?.applyChangeSet(cs);
    },
    renderAll(linkedPolygonIds) {
      rendererRef.current?.renderAll(linkedPolygonIds);
    },
    setEditor(editor) {
      rendererRef.current?.setEditor(editor);
    },
    setCursor(cursor) {
      rendererRef.current?.setCursor(cursor);
    },
    highlightPolygon(id) {
      rendererRef.current?.highlightPolygon(id);
    },
    focusPolygon(id) {
      rendererRef.current?.focusPolygon(id);
    },
    setLinkedPolygonIds(ids) {
      rendererRef.current?.setLinkedPolygonIds(ids);
    },
    enableRubberBand() {
      rendererRef.current?.enableRubberBand();
    },
    disableRubberBand() {
      rendererRef.current?.disableRubberBand();
    },
    setRubberBandOrigin(vertexId) {
      rendererRef.current?.setRubberBandOrigin(vertexId);
    },
    enableVertexDrag(callbacks) {
      rendererRef.current?.enableVertexDrag(callbacks);
    },
    disableVertexDrag() {
      rendererRef.current?.disableVertexDrag();
    },
    showVertices() {
      rendererRef.current?.showVertices();
    },
    hideVertices() {
      rendererRef.current?.hideVertices();
    },
    pixelsToDegrees(px) {
      return rendererRef.current?.pixelsToDegrees(px) ?? 0.001;
    },
    getSnapThresholdPx() {
      return rendererRef.current?.getSnapThresholdPx() ?? 20;
    },
    setDetailMode(targetId, neighborIds) {
      rendererRef.current?.setDetailMode(targetId, neighborIds);
    },
    clearDetailMode() {
      rendererRef.current?.clearDetailMode();
    },
    setPlaces(places) {
      rendererRef.current?.setPlaces(places);
    },
    clearPlaces() {
      rendererRef.current?.clearPlaces();
    },
    setMinZoom(zoom) {
      rendererRef.current?.setMinZoom(zoom);
    },
    clearMinZoom() {
      rendererRef.current?.clearMinZoom();
    },
    setPlaceContextMenuHandler(cb) {
      rendererRef.current?.setPlaceContextMenuHandler(cb);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapRenderer();
    renderer.mount(containerRef.current, {
      onMapClick: (lat, lng) => callbacksRef.current.onMapClick?.(lat, lng),
      onPolygonClick: (id) => callbacksRef.current.onPolygonClick?.(id),
      onPolygonDoubleClick: (id) =>
        callbacksRef.current.onPolygonDoubleClick?.(id),
      onContextMenu: (lat, lng, cx, cy) =>
        callbacksRef.current.onContextMenu?.(lat, lng, cx, cy),
      onVertexHover: (id) => callbacksRef.current.onVertexHover?.(id),
      onEdgeHover: (id) => callbacksRef.current.onEdgeHover?.(id),
      onPolygonHover: (id) => callbacksRef.current.onPolygonHover?.(id),
    });
    rendererRef.current = renderer;
    return () => {
      renderer.unmount();
      rendererRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
});

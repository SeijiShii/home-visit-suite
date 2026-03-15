import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { MapRenderer } from "../lib/map-renderer";
import type { MapRendererCallbacks, SnapInfo } from "../lib/map-renderer";
import type { DraftShape, PolygonID, MapPolygon } from "map-polygon-editor";
import type { BridgeInfo } from "../lib/drawing-controller";

export interface MapViewHandle {
  renderDraft(draft: DraftShape | null, bridgeInfo?: BridgeInfo | null): void;
  setCursor(cursor: string): void;
  highlightPolygon(id: PolygonID | null): void;
  renderPolygons(
    polygons: MapPolygon[],
    callbacks?: MapRendererCallbacks,
    linkedPolygonIds?: Set<string>,
  ): void;
  enableRubberBand(): void;
  disableRubberBand(): void;
  isNearStartPoint(lat: number, lng: number): boolean;
  getSnapInfo(lat: number, lng: number): SnapInfo | null;
}

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
  onContextMenu?: () => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { onMapClick, onPolygonClick, onContextMenu },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const callbacksRef = useRef({ onMapClick, onPolygonClick, onContextMenu });
  callbacksRef.current = { onMapClick, onPolygonClick, onContextMenu };

  useImperativeHandle(ref, () => ({
    renderDraft(draft, bridgeInfo) {
      rendererRef.current?.renderDraft(draft, bridgeInfo);
    },
    setCursor(cursor) {
      rendererRef.current?.setCursor(cursor);
    },
    highlightPolygon(id) {
      rendererRef.current?.highlightPolygon(id);
    },
    renderPolygons(polygons, callbacks, linkedPolygonIds) {
      rendererRef.current?.renderPolygons(
        polygons,
        callbacks,
        linkedPolygonIds,
      );
    },
    enableRubberBand() {
      rendererRef.current?.enableRubberBand();
    },
    disableRubberBand() {
      rendererRef.current?.disableRubberBand();
    },
    isNearStartPoint(lat, lng) {
      return rendererRef.current?.isNearStartPoint(lat, lng) ?? false;
    },
    getSnapInfo(lat, lng) {
      return rendererRef.current?.getSnapInfo(lat, lng) ?? null;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapRenderer();
    renderer.mount(containerRef.current, {
      onMapClick: (lat, lng) => callbacksRef.current.onMapClick?.(lat, lng),
      onPolygonClick: (id) => callbacksRef.current.onPolygonClick?.(id),
      onContextMenu: () => callbacksRef.current.onContextMenu?.(),
    });
    rendererRef.current = renderer;
    return () => {
      renderer.unmount();
      rendererRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
});

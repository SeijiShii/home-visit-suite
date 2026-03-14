import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { MapRenderer } from "../lib/map-renderer";
import type { MapRendererCallbacks } from "../lib/map-renderer";
import type { DraftShape, PolygonID, MapPolygon } from "map-polygon-editor";

export interface MapViewHandle {
  renderDraft(draft: DraftShape | null): void;
  setCursor(cursor: string): void;
  highlightPolygon(id: PolygonID | null): void;
  renderPolygons(
    polygons: MapPolygon[],
    callbacks?: MapRendererCallbacks,
  ): void;
  enableRubberBand(): void;
  disableRubberBand(): void;
  isNearStartPoint(lat: number, lng: number): boolean;
}

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { onMapClick, onPolygonClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const callbacksRef = useRef({ onMapClick, onPolygonClick });
  callbacksRef.current = { onMapClick, onPolygonClick };

  useImperativeHandle(ref, () => ({
    renderDraft(draft) {
      rendererRef.current?.renderDraft(draft);
    },
    setCursor(cursor) {
      rendererRef.current?.setCursor(cursor);
    },
    highlightPolygon(id) {
      rendererRef.current?.highlightPolygon(id);
    },
    renderPolygons(polygons, callbacks) {
      rendererRef.current?.renderPolygons(polygons, callbacks);
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
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapRenderer();
    renderer.mount(containerRef.current, {
      onMapClick: (lat, lng) => callbacksRef.current.onMapClick?.(lat, lng),
      onPolygonClick: (id) => callbacksRef.current.onPolygonClick?.(id),
    });
    rendererRef.current = renderer;
    return () => {
      renderer.unmount();
      rendererRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
});

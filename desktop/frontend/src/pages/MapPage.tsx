import { useRef, useCallback, useMemo, useState } from "react";
import { useMapState } from "../hooks/useMapState";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaTree } from "../components/AreaTree";
import { RegionService } from "../services/region-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { type PolygonID } from "map-polygon-editor";

const SIDEBAR_MIN_WIDTH = 192;

export function MapPage() {
  const { actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);

  const regionService = useMemo(() => new RegionService(RegionBinding), []);

  const handleMapClick = useCallback((_lat: number, _lng: number) => {
    // TODO: map click handling
  }, []);

  const handlePolygonClick = useCallback(
    (id: PolygonID) => {
      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(actions.selectedPolygonId);
    },
    [actions],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  return (
    <div className="map-page">
      <MapView
        ref={mapRef}
        onMapClick={handleMapClick}
        onPolygonClick={handlePolygonClick}
      />
      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      <div className="map-sidebar" style={{ width: sidebarWidth }}>
        <AreaTree service={regionService} api={RegionBinding} />
      </div>
    </div>
  );
}

import { useRef, useCallback, useMemo } from "react";
import { useMapState } from "../hooks/useMapState";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaTree } from "../components/AreaTree";
import { RegionService } from "../services/region-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { type PolygonID } from "map-polygon-editor";

export function MapPage() {
  const { actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);

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

  return (
    <div className="map-page">
      <MapView
        ref={mapRef}
        onMapClick={handleMapClick}
        onPolygonClick={handlePolygonClick}
      />
      <div className="map-sidebar">
        <AreaTree service={regionService} api={RegionBinding} />
      </div>
    </div>
  );
}

import { useRef, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useMapState, MapMode } from "../hooks/useMapState";
import { MapView, type MapViewHandle } from "../components/MapView";
import { addPoint, closeDraft, type PolygonID } from "map-polygon-editor";

export function MapPage() {
  const { t } = useI18n();
  const m = t.map;
  const { snapshot, actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (actions.mode === MapMode.Drawing && actions.draft) {
        const updated = addPoint(actions.draft, { lat, lng });
        actions.updateDraft(updated);
        mapRef.current?.renderDraft(updated);
      }
    },
    [actions],
  );

  const handlePolygonClick = useCallback(
    (id: PolygonID) => {
      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(actions.selectedPolygonId);
    },
    [actions],
  );

  const handleDraw = () => {
    actions.startDrawing();
    mapRef.current?.renderDraft(actions.draft);
    mapRef.current?.setCursor("crosshair");
  };

  const handleCloseDraft = () => {
    if (actions.draft && actions.draft.points.length >= 3) {
      const closed = closeDraft(actions.draft);
      actions.updateDraft(closed);
      mapRef.current?.renderDraft(closed);
      // TODO: saveAsPolygon via MapPolygonEditor
    }
  };

  const handleCancelDraw = () => {
    actions.cancelDrawing();
    mapRef.current?.renderDraft(null);
    mapRef.current?.setCursor("");
  };

  return (
    <div className="map-page">
      <div className="map-toolbar">
        <h2>{m.title}</h2>
        {snapshot.mode === MapMode.Viewing && (
          <div className="toolbar-actions">
            <button className="toolbar-btn" onClick={handleDraw}>
              {m.draw}
            </button>
          </div>
        )}
        {snapshot.mode === MapMode.Drawing && (
          <div className="drawing-controls">
            <button className="toolbar-btn" onClick={handleCloseDraft}>
              {m.closeDraft}
            </button>
            <button
              className="toolbar-btn btn-secondary"
              onClick={handleCancelDraw}
            >
              {m.cancelDraw}
            </button>
          </div>
        )}
      </div>
      <MapView
        ref={mapRef}
        onMapClick={handleMapClick}
        onPolygonClick={handlePolygonClick}
      />
    </div>
  );
}

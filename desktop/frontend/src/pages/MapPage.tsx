import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useMapState, MapMode } from "../hooks/useMapState";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useI18n } from "../contexts/I18nContext";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaTree, type AreaTreeHandle } from "../components/AreaTree";
import { PolygonList } from "../components/PolygonList";
import { RegionService } from "../services/region-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import { type PolygonID } from "map-polygon-editor";

const SIDEBAR_MIN_WIDTH = 192;

type SidebarTab = "areas" | "polygons";

export function MapPage() {
  const { t } = useI18n();
  const { snapshot, actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);
  const treeRef = useRef<AreaTreeHandle>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [activeTab, setActiveTab] = useState<SidebarTab>("areas");

  const regionService = useMemo(() => new RegionService(RegionBinding), []);

  const regionAPI = useMemo(
    () => ({
      BindPolygonToArea: RegionBinding.BindPolygonToArea,
      UnbindPolygonFromArea: RegionBinding.UnbindPolygonFromArea,
    }),
    [],
  );
  const { polygonService, ready: editorReady } = usePolygonEditor(
    MapBinding,
    regionAPI,
  );

  // エディタ準備完了時にポリゴンを描画
  useEffect(() => {
    if (!editorReady || !polygonService) return;
    const polygons = polygonService.getAllPolygons();
    mapRef.current?.renderPolygons(polygons, {
      onPolygonClick: (id: PolygonID) => {
        actions.selectPolygon(id);
        mapRef.current?.highlightPolygon(id);
      },
    });
  }, [editorReady, polygonService, actions]);

  // ドラフト変更時にマップを再描画
  useEffect(() => {
    mapRef.current?.renderDraft(snapshot.draft);
    if (snapshot.mode === MapMode.Drawing) {
      mapRef.current?.setCursor("crosshair");
      mapRef.current?.enableRubberBand();
    } else {
      mapRef.current?.setCursor("");
      mapRef.current?.disableRubberBand();
    }
  }, [snapshot.draft, snapshot.mode]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (
        snapshot.mode === MapMode.Drawing &&
        mapRef.current?.isNearStartPoint(lat, lng)
      ) {
        actions.closeDrawing();
      } else {
        actions.handleMapClick(lat, lng);
      }
    },
    [actions, snapshot.mode],
  );

  const handlePolygonClick = useCallback(
    (id: PolygonID) => {
      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(id);
    },
    [actions],
  );

  const handleStartDrawing = useCallback(
    (areaId: string) => {
      actions.startDrawingForArea(areaId);
    },
    [actions],
  );

  const handleCloseDrawing = useCallback(() => {
    actions.closeDrawing();
  }, [actions]);

  const handleCancelDrawing = useCallback(() => {
    actions.cancelDrawing();
  }, [actions]);

  const handleUndoPoint = useCallback(() => {
    actions.undoLastPoint();
  }, [actions]);

  const handleSavePolygon = useCallback(async () => {
    const result = actions.finalizeDrawing();
    if (!result || !polygonService) return;

    try {
      await polygonService.savePolygonForArea(
        result.draft,
        result.targetAreaId,
        result.targetAreaId,
      );
      // ポリゴン再描画 + AreaTree リロード
      const polygons = polygonService.getAllPolygons();
      mapRef.current?.renderPolygons(polygons, {
        onPolygonClick: handlePolygonClick,
      });
      treeRef.current?.reload();
    } catch (err) {
      console.error("save polygon failed:", err);
    }
  }, [actions, polygonService, handlePolygonClick]);

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

  const isDrawing = snapshot.mode === MapMode.Drawing;
  const draftClosed = snapshot.draft?.isClosed ?? false;
  const canClose = actions.drawingController.canClose;
  const pointCount = snapshot.draft?.points.length ?? 0;

  return (
    <div className="map-page">
      <MapView
        ref={mapRef}
        onMapClick={handleMapClick}
        onPolygonClick={handlePolygonClick}
      />

      {isDrawing && (
        <div className="drawing-toolbar">
          <span className="drawing-hint">
            {draftClosed ? t.map.drawingClosed : t.map.drawingHint}
          </span>
          <span className="drawing-point-count">{pointCount}</span>
          {!draftClosed && pointCount > 0 && (
            <button className="drawing-btn" onClick={handleUndoPoint}>
              {t.map.undoPoint}
            </button>
          )}
          {!draftClosed && canClose && (
            <button
              className="drawing-btn drawing-btn-close"
              onClick={handleCloseDrawing}
            >
              {t.map.closePolygon}
            </button>
          )}
          {draftClosed && (
            <button
              className="drawing-btn drawing-btn-save"
              onClick={handleSavePolygon}
            >
              {t.map.savePolygon}
            </button>
          )}
          <button
            className="drawing-btn drawing-btn-cancel"
            onClick={handleCancelDrawing}
          >
            {t.map.cancelDrawing}
          </button>
        </div>
      )}

      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      <div className="map-sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${activeTab === "areas" ? " sidebar-tab-active" : ""}`}
            onClick={() => setActiveTab("areas")}
          >
            {t.map.tabAreas}
          </button>
          <button
            className={`sidebar-tab${activeTab === "polygons" ? " sidebar-tab-active" : ""}`}
            onClick={() => setActiveTab("polygons")}
          >
            {t.map.tabPolygons}
          </button>
        </div>
        <div className="sidebar-tab-content">
          {activeTab === "areas" && (
            <AreaTree
              ref={treeRef}
              service={regionService}
              api={RegionBinding}
              onStartDrawing={handleStartDrawing}
              isDrawing={isDrawing}
            />
          )}
          {activeTab === "polygons" && <PolygonList />}
        </div>
      </div>
    </div>
  );
}

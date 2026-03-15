import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useMapState, MapMode } from "../hooks/useMapState";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useI18n } from "../contexts/I18nContext";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaTree, type AreaTreeHandle } from "../components/AreaTree";
import { PolygonList } from "../components/PolygonList";
import { RegionService } from "../services/region-service";
import { buildPolygonAreaMap } from "../services/polygon-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import { type PolygonID, type MapPolygon } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

const SIDEBAR_MIN_WIDTH = 192;

type SidebarTab = "areas" | "polygons";

export function MapPage() {
  const { t } = useI18n();
  const { snapshot, actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);
  const treeRef = useRef<AreaTreeHandle>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [activeTab, setActiveTab] = useState<SidebarTab>("areas");
  const [polygons, setPolygons] = useState<MapPolygon[]>([]);
  const [polygonAreaMap, setPolygonAreaMap] = useState<
    Map<string, PolygonAreaInfo>
  >(new Map());

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

  const handlePolygonClick = useCallback(
    (id: PolygonID) => {
      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(id);
    },
    [actions],
  );

  const reloadPolygons = useCallback(async () => {
    if (!polygonService) return;
    const allPolygons = polygonService.getAllPolygons();
    const tree = await regionService.loadTree();
    const areaMap = buildPolygonAreaMap(tree);
    const linkedIds = new Set(areaMap.keys());
    setPolygons(allPolygons);
    setPolygonAreaMap(areaMap);
    mapRef.current?.renderPolygons(
      allPolygons,
      { onPolygonClick: handlePolygonClick },
      linkedIds,
    );
  }, [polygonService, regionService, handlePolygonClick]);

  // エディタ準備完了時にポリゴンを描画
  useEffect(() => {
    if (!editorReady) return;
    reloadPolygons();
  }, [editorReady, reloadPolygons]);

  // ドラフト変更時にマップを再描画
  useEffect(() => {
    const dc = actions.drawingController;
    const bridgeInfo =
      dc.bridgeStart && dc.bridgeEnd
        ? {
            startPolygonId: dc.bridgeStart.polygonId,
            startVertexIndex: dc.bridgeStart.vertexIndex,
            endPolygonId: dc.bridgeEnd.polygonId,
            endVertexIndex: dc.bridgeEnd.vertexIndex,
          }
        : null;
    mapRef.current?.renderDraft(snapshot.draft, bridgeInfo);
    if (snapshot.mode === MapMode.Drawing) {
      mapRef.current?.setCursor("crosshair");
      mapRef.current?.enableRubberBand();
    } else {
      mapRef.current?.setCursor("");
      mapRef.current?.disableRubberBand();
    }
  }, [snapshot.draft, snapshot.mode, actions]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (snapshot.mode !== MapMode.Drawing) {
        return;
      }

      const snap = mapRef.current?.getSnapInfo(lat, lng);
      const clickLat = snap ? snap.lat : lat;
      const clickLng = snap ? snap.lng : lng;
      const dc = actions.drawingController;
      const pointCount = dc.draft?.points.length ?? 0;

      // 既存ポリゴン頂点にスナップした場合
      if (snap?.anchor) {
        if (pointCount === 0) {
          // 最初のポイント: ブリッジ開始アンカーを記録
          dc.setBridgeStart(snap.anchor.polygonId, snap.anchor.vertexIndex);
          actions.handleMapClick(clickLat, clickLng);
        } else {
          // 2つ目以降: ブリッジ終了 → ポイント追加して描画終了
          dc.setBridgeEnd(snap.anchor.polygonId, snap.anchor.vertexIndex);
          actions.handleMapClick(clickLat, clickLng);
          if (dc.canClose) {
            actions.closeDrawing();
          }
        }
        return;
      }

      // ドラフト始点スナップ → 閉回路
      if (mapRef.current?.isNearStartPoint(clickLat, clickLng)) {
        actions.closeDrawing();
      } else {
        actions.handleMapClick(clickLat, clickLng);
      }
    },
    [actions, snapshot.mode],
  );

  const handleStartDrawing = useCallback(
    (areaId: string) => {
      actions.startDrawingForArea(areaId);
    },
    [actions],
  );

  const handleStartFreeDrawing = useCallback(() => {
    actions.startDrawing();
  }, [actions]);

  const handleCloseDrawing = useCallback(() => {
    actions.closeDrawing();
  }, [actions]);

  const handleCancelDrawing = useCallback(() => {
    actions.cancelDrawing();
  }, [actions]);

  const handleUndoPoint = useCallback(() => {
    actions.undoLastPoint();
  }, [actions]);

  const handleContextMenu = useCallback(() => {
    if (snapshot.mode === MapMode.Drawing) {
      actions.undoLastPoint();
    }
  }, [actions, snapshot.mode]);

  const handleSavePolygon = useCallback(async () => {
    const result = actions.finalizeDrawing();
    if (!result || !polygonService) return;

    try {
      if (result.bridgeInfo) {
        // ブリッジ描画: 全ポイント（開始・終了頂点を含む）
        const bridgePath = result.draft.points;
        await polygonService.bridgePolygon(
          result.bridgeInfo.startPolygonId as unknown as PolygonID,
          result.bridgeInfo.startVertexIndex,
          result.bridgeInfo.endPolygonId as unknown as PolygonID,
          result.bridgeInfo.endVertexIndex,
          bridgePath,
          "",
        );
      } else if (result.targetAreaId) {
        await polygonService.savePolygonForArea(
          result.draft,
          result.targetAreaId,
          result.targetAreaId,
        );
      } else {
        await polygonService.savePolygon(result.draft, "");
      }
      // ポリゴン再描画 + AreaTree リロード
      await reloadPolygons();
      treeRef.current?.reload();
    } catch (err) {
      console.error("save polygon failed:", err);
    }
  }, [actions, polygonService, reloadPolygons]);

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
        onContextMenu={handleContextMenu}
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
        <div className="sidebar-draw-area">
          <button
            className="sidebar-draw-btn"
            onClick={handleStartFreeDrawing}
            disabled={isDrawing}
          >
            {t.map.startDrawing}
          </button>
        </div>
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
          {activeTab === "polygons" && (
            <PolygonList
              polygons={polygons}
              polygonAreaMap={polygonAreaMap}
              selectedPolygonId={snapshot.selectedPolygonId}
              onPolygonClick={handlePolygonClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

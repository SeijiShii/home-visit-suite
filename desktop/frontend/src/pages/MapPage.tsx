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
import type {
  PolygonID,
  PolygonSnapshot,
  NetworkPolygonEditor,
} from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

const SIDEBAR_MIN_WIDTH = 192;

type SidebarTab = "areas" | "polygons";

export function MapPage() {
  const { t } = useI18n();
  const { snapshot, actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);
  const treeRef = useRef<AreaTreeHandle>(null);
  const editorRef = useRef<NetworkPolygonEditor | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [activeTab, setActiveTab] = useState<SidebarTab>("areas");
  const [polygons, setPolygons] = useState<PolygonSnapshot[]>([]);
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
  const {
    editor,
    polygonService,
    ready: editorReady,
  } = usePolygonEditor(MapBinding, regionAPI);

  // --- ポリゴンリロード ---

  const reloadPolygons = useCallback(async () => {
    if (!polygonService || !editor) return;
    const allPolygons = polygonService.getPolygons();
    const tree = await regionService.loadTree();
    const areaMap = buildPolygonAreaMap(tree);
    const linkedIds = new Set(areaMap.keys());
    setPolygons(allPolygons);
    setPolygonAreaMap(areaMap);
    mapRef.current?.setLinkedPolygonIds(linkedIds);
    mapRef.current?.renderAll(linkedIds);
  }, [polygonService, editor, regionService]);

  // エディタ準備完了時に初期描画
  useEffect(() => {
    if (!editorReady || !editor) return;
    editorRef.current = editor;
    mapRef.current?.setEditor(editor);
    reloadPolygons();
  }, [editorReady, editor, reloadPolygons]);

  // --- ポリゴンクリック ---

  const polygonClickRef = useRef<(id: PolygonID) => void>(() => {});
  const handlePolygonClick = useCallback((id: PolygonID) => {
    polygonClickRef.current(id);
  }, []);
  polygonClickRef.current = (id: PolygonID) => {
    if (snapshot.mode === MapMode.Drawing) return;

    if (
      snapshot.mode === MapMode.Editing &&
      snapshot.selectedPolygonId === id
    ) {
      return;
    }

    if (snapshot.mode === MapMode.Editing) {
      mapRef.current?.disableVertexDrag();
    }

    actions.startEditing(id);
    mapRef.current?.highlightPolygon(id);
    mapRef.current?.focusPolygon(id);

    // 頂点ドラッグを有効化
    mapRef.current?.enableVertexDrag((vertexId, lat, lng) => {
      if (!editorRef.current) return;
      const cs = editorRef.current.moveVertex(vertexId, lat, lng);
      mapRef.current?.applyChangeSet(cs);
      setPolygons(editorRef.current.getPolygons());
      editorRef.current.save().catch(console.error);
    });
  };

  // --- 描画モード制御 ---

  useEffect(() => {
    if (snapshot.mode === MapMode.Drawing) {
      mapRef.current?.setCursor("crosshair");
      mapRef.current?.enableRubberBand();
      mapRef.current?.showVertices();
    } else if (snapshot.mode === MapMode.Editing) {
      mapRef.current?.showVertices();
    } else {
      mapRef.current?.setCursor("");
      mapRef.current?.disableRubberBand();
      mapRef.current?.hideVertices();
    }
  }, [snapshot.mode]);

  // --- マップクリック ---

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      const ed = editorRef.current;

      // 編集モード中 → 編集終了
      if (snapshot.mode === MapMode.Editing) {
        mapRef.current?.disableVertexDrag();
        actions.endEditing();
        return;
      }

      if (snapshot.mode !== MapMode.Drawing || !ed) return;

      // スナップ判定
      const thresholdDeg =
        mapRef.current?.pixelsToDegrees(mapRef.current.getSnapThresholdPx()) ??
        0.001;

      const nearVertex = ed.findNearestVertex(lat, lng, thresholdDeg);
      const nearEdge = ed.findNearestEdge(lat, lng, thresholdDeg);

      let cs;
      if (nearVertex) {
        // 既存頂点にスナップ → 描画終了（閉回路ならポリゴン自動生成）
        cs = ed.snapToVertex(nearVertex.id);
      } else if (nearEdge) {
        // 既存線分にスナップ → 線分分割＋接続
        cs = ed.snapToEdge(
          nearEdge.edge.id,
          nearEdge.point.lat,
          nearEdge.point.lng,
        );
      } else {
        // 新規頂点を配置
        cs = ed.placeVertex(lat, lng);
      }

      mapRef.current?.applyChangeSet(cs);

      // snapToVertex / snapToEdge で描画モードが終了した場合
      if (ed.getMode() === "idle") {
        actions.endDrawing();
        ed.save().catch(console.error);
        setPolygons(ed.getPolygons());
      }
    },
    [actions, snapshot.mode],
  );

  // --- ツールバーアクション ---

  const handleStartDrawing = useCallback(
    (_areaId: string) => {
      if (!editorRef.current) return;
      editorRef.current.startDrawing();
      actions.startDrawing();
    },
    [actions],
  );

  const handleStartFreeDrawing = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.startDrawing();
    actions.startDrawing();
  }, [actions]);

  const handleEndDrawing = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.endDrawing();
    mapRef.current?.applyChangeSet(cs);
    actions.endDrawing();
  }, [actions]);

  const handleUndoDrawing = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.undo();
    if (cs) {
      mapRef.current?.applyChangeSet(cs);
    }
  }, []);

  const handleContextMenu = useCallback(() => {
    if (snapshot.mode === MapMode.Drawing) {
      handleUndoDrawing();
    }
  }, [snapshot.mode, handleUndoDrawing]);

  const handlePruneOrphans = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.pruneOrphans();
    mapRef.current?.applyChangeSet(cs);
    editorRef.current.save().catch(console.error);
    setPolygons(editorRef.current.getPolygons());
  }, []);

  const handleFinishEditing = useCallback(() => {
    mapRef.current?.disableVertexDrag();
    actions.endEditing();
    if (editorRef.current) {
      editorRef.current.save().catch(console.error);
    }
    reloadPolygons();
  }, [actions, reloadPolygons]);

  const handleDeletePolygon = useCallback(
    async (snapshot: PolygonSnapshot) => {
      if (!polygonService) return;
      try {
        const areaInfo = polygonAreaMap.get(snapshot.id as string);
        if (areaInfo) {
          await polygonService.deletePolygonForArea(snapshot, areaInfo.areaId);
        } else {
          polygonService.deletePolygonEdges(snapshot);
        }
        if (actions.selectedPolygonId === snapshot.id) {
          actions.selectPolygon(null);
          mapRef.current?.highlightPolygon(null);
        }
        await polygonService.save();
        await reloadPolygons();
        treeRef.current?.reload();
      } catch (err) {
        console.error("delete polygon failed:", err);
      }
    },
    [polygonService, polygonAreaMap, actions, reloadPolygons],
  );

  // --- リサイズ ---

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
  const isEditing = snapshot.mode === MapMode.Editing;

  return (
    <div className="map-page">
      <MapView
        ref={mapRef}
        onMapClick={handleMapClick}
        onPolygonClick={handlePolygonClick}
        onContextMenu={handleContextMenu}
      />

      {isEditing && (
        <div className="drawing-toolbar">
          <span className="drawing-hint">{t.map.editingHint}</span>
          <button
            className="drawing-btn drawing-btn-save"
            onClick={handleFinishEditing}
          >
            {t.map.finishEditing}
          </button>
        </div>
      )}

      {isDrawing && (
        <div className="drawing-toolbar">
          <span className="drawing-hint">{t.map.drawingHint}</span>
          <button className="drawing-btn" onClick={handleUndoDrawing}>
            {t.map.undoPoint}
          </button>
          <button className="drawing-btn" onClick={handleEndDrawing}>
            {t.map.endDrawing}
          </button>
        </div>
      )}

      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      <div className="map-sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-draw-area">
          <button
            className="sidebar-draw-btn"
            onClick={handleStartFreeDrawing}
            disabled={isDrawing || isEditing}
          >
            {t.map.startDrawing}
          </button>
          <button
            className="sidebar-draw-btn sidebar-prune-btn"
            onClick={handlePruneOrphans}
            disabled={isDrawing || isEditing}
          >
            {t.map.pruneOrphans}
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
              onDeletePolygon={handleDeletePolygon}
              isDrawing={isDrawing}
            />
          )}
        </div>
      </div>
    </div>
  );
}

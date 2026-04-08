import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useMapState, MapMode } from "../hooks/useMapState";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useI18n } from "../contexts/I18nContext";
import { useTips } from "../contexts/TipsContext";

/**
 * 地図画面表示時に自動で流すポリゴン描画ヘルプキー（実装済み操作のみ）。
 * 実装変更時は i18n の tips.map.polygon と齟齬がないよう注意 (MEMORY.json feedback 参照)。
 */
const POLYGON_DRAWING_TIP_KEYS = [
  "tips.map.polygon.startDraw",
  "tips.map.polygon.continueVertex",
  "tips.map.polygon.confirmDraw",
  "tips.map.polygon.cancelDraw",
  "tips.map.polygon.selectPolygon",
  "tips.map.polygon.moveVertex",
  "tips.map.polygon.splitEdge",
] as const;

// セッション中 1 回のみ初期表示するためのフラグ（モジュールスコープで保持）
let __mapTipsInitialShown = false;
import { MapView, type MapViewHandle } from "../components/MapView";
import { EdgeContextMenu } from "../components/EdgeContextMenu";
import { AreaTree, type AreaTreeHandle } from "../components/AreaTree";
import { PolygonList } from "../components/PolygonList";
import { RegionService } from "../services/region-service";
import { buildPolygonAreaMap } from "../services/polygon-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import type {
  PolygonID,
  EdgeID,
  PolygonSnapshot,
  NetworkPolygonEditor,
} from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";
import type { AreaTreeNode } from "../services/region-service";

const SIDEBAR_MIN_WIDTH = 260;

type SidebarTab = "areas" | "polygons";

export function MapPage() {
  const { t } = useI18n();
  const { showTips } = useTips();
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
  const [areaTree, setAreaTree] = useState<AreaTreeNode[]>([]);
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    edgeId: EdgeID;
    lat: number;
    lng: number;
  } | null>(null);

  const regionService = useMemo(() => new RegionService(RegionBinding), []);

  const regionAPI = useMemo(
    () => ({
      BindPolygonToArea: RegionBinding.BindPolygonToArea,
      UnbindPolygonFromArea: RegionBinding.UnbindPolygonFromArea,
      RemapPolygonIds: RegionBinding.RemapPolygonIds,
    }),
    [],
  );
  const {
    editor,
    polygonService,
    ready: editorReady,
  } = usePolygonEditor(MapBinding, regionAPI);

  // --- AreaTreeからの変更通知 ---

  const handleTreeChanged = useCallback((tree: AreaTreeNode[]) => {
    const areaMap = buildPolygonAreaMap(tree);
    setPolygonAreaMap(areaMap);
    setAreaTree(tree);
  }, []);

  // --- ポリゴンリロード ---

  const reloadPolygons = useCallback(async () => {
    if (!polygonService || !editor) return;
    const allPolygons = polygonService.getPolygons();
    const tree = await regionService.loadTree();
    const areaMap = buildPolygonAreaMap(tree);
    const linkedIds = new Set(areaMap.keys());
    setPolygons(allPolygons);
    setPolygonAreaMap(areaMap);
    setAreaTree(tree);
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

  // 地図データロード完了後、セッション中 1 回だけポリゴン描画ヘルプを流す
  useEffect(() => {
    if (!editorReady) return;
    if (__mapTipsInitialShown) return;
    __mapTipsInitialShown = true;
    showTips([...POLYGON_DRAWING_TIP_KEYS]);
  }, [editorReady, showTips]);

  // --- 地図要素ホバーでヘルプ表示 ---

  const handleVertexHover = useCallback(() => {
    showTips(["tips.map.polygon.moveVertex"]);
  }, [showTips]);

  const handleEdgeHover = useCallback(() => {
    showTips(["tips.map.polygon.splitEdge"]);
  }, [showTips]);

  // 通常表示中はポリゴン全体への hover で「選択して編集」ヒントを案内
  const handlePolygonHover = useCallback(() => {
    showTips(["tips.map.polygon.selectPolygon", "tips.map.polygon.splitEdge"]);
  }, [showTips]);

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

    // ロック中のポリゴンはフォーカスのみ（編集モードに入らない）
    if (editorRef.current?.isPolygonLocked(id)) {
      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(id);
      mapRef.current?.focusPolygon(id);
      return;
    }

    actions.startEditing(id);
    mapRef.current?.highlightPolygon(id);
    mapRef.current?.focusPolygon(id);

    // 頂点ドラッグを有効化（ドラッグ中もポリゴン形状がリアルタイム更新）
    mapRef.current?.enableVertexDrag({
      onDragStart: (vertexId) => {
        editorRef.current?.beginDrag(vertexId);
      },
      onDragMove: (_vertexId, lat, lng) => {
        if (!editorRef.current) return;
        const cs = editorRef.current.dragTo(lat, lng);
        mapRef.current?.applyChangeSet(cs);
        setPolygons(editorRef.current.getPolygons());
      },
      onDragEnd: () => {
        if (!editorRef.current) return;
        const cs = editorRef.current.endDrag();
        mapRef.current?.applyChangeSet(cs);
        setPolygons(editorRef.current.getPolygons());
        editorRef.current.save().catch(console.error);
      },
    });
  };

  // --- ポリゴンリストからのフォーカス（編集モードには入らない） ---

  const handlePolygonFocus = useCallback(
    (id: PolygonID) => {
      if (snapshot.mode === MapMode.Drawing) return;

      // 編集中なら編集を終了して保存
      if (snapshot.mode === MapMode.Editing) {
        mapRef.current?.disableVertexDrag();
        actions.endEditing();
        editorRef.current?.save().catch(console.error);
      }

      actions.selectPolygon(id);
      mapRef.current?.highlightPolygon(id);
      mapRef.current?.focusPolygon(id);
    },
    [actions, snapshot.mode],
  );

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
        mapRef.current?.highlightPolygon(null);
        actions.endEditing();
        return;
      }

      // 非描画・非編集モード → 選択解除
      if (snapshot.mode !== MapMode.Drawing) {
        if (actions.selectedPolygonId != null) {
          actions.selectPolygon(null);
          mapRef.current?.highlightPolygon(null);
        }
        return;
      }
      if (!ed) return;

      // スナップ判定
      const thresholdDeg =
        mapRef.current?.pixelsToDegrees(mapRef.current.getSnapThresholdPx()) ??
        0.001;

      const nearVertex = ed.findNearestVertex(lat, lng, thresholdDeg);
      const nearEdge = ed.findNearestEdge(lat, lng, thresholdDeg);

      let cs;
      if (nearVertex) {
        // 既存頂点にスナップ（開始時: 起点として継続、途中: 接続して終了）
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

      // 既存頂点にスナップして描画継続（開始時）→ ラバーバンド起点を設定
      if (nearVertex && ed.getMode() === "drawing") {
        mapRef.current?.setRubberBandOrigin(nearVertex.id);
      }

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

  const handleContextMenu = useCallback(
    (lat: number, lng: number, containerX: number, containerY: number) => {
      if (snapshot.mode === MapMode.Drawing) {
        handleUndoDrawing();
        return;
      }
      if (snapshot.mode === MapMode.Editing) {
        const ed = editorRef.current;
        if (!ed) return;
        const thresholdDeg =
          mapRef.current?.pixelsToDegrees(
            mapRef.current.getSnapThresholdPx(),
          ) ?? 0.001;
        const nearEdge = ed.findNearestEdge(lat, lng, thresholdDeg);
        if (nearEdge) {
          setEdgeMenu({
            x: containerX,
            y: containerY,
            edgeId: nearEdge.edge.id,
            lat: nearEdge.point.lat,
            lng: nearEdge.point.lng,
          });
        }
      }
    },
    [snapshot.mode, handleUndoDrawing],
  );

  const handleEdgeAddVertex = useCallback(() => {
    if (!edgeMenu || !editorRef.current) return;
    const cs = editorRef.current.splitEdge(
      edgeMenu.edgeId,
      edgeMenu.lat,
      edgeMenu.lng,
    );
    mapRef.current?.applyChangeSet(cs);
    editorRef.current.save().catch(console.error);
    setEdgeMenu(null);
  }, [edgeMenu]);

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

  const handleToggleActive = useCallback(
    (id: PolygonID, active: boolean) => {
      if (!editorRef.current) return;
      // 編集中のポリゴンを不活性化する場合は編集終了
      if (!active && snapshot.selectedPolygonId === id) {
        mapRef.current?.disableVertexDrag();
        actions.endEditing();
      }
      const cs = editorRef.current.setPolygonActive(id, active);
      mapRef.current?.applyChangeSet(cs);
      setPolygons(editorRef.current.getPolygons());
      editorRef.current.save().catch(console.error);
    },
    [actions, snapshot.selectedPolygonId],
  );

  const handleToggleLocked = useCallback(
    (id: PolygonID, locked: boolean) => {
      if (!editorRef.current) return;
      // ロック時に編集中なら編集終了
      if (locked && snapshot.selectedPolygonId === id) {
        mapRef.current?.disableVertexDrag();
        actions.endEditing();
      }
      const cs = editorRef.current.setPolygonLocked(id, locked);
      mapRef.current?.applyChangeSet(cs);
      setPolygons(editorRef.current.getPolygons());
      editorRef.current.save().catch(console.error);
    },
    [actions, snapshot.selectedPolygonId],
  );

  const handleLinkPolygon = useCallback(
    async (polygonId: PolygonID, areaId: string) => {
      if (!polygonService) return;
      try {
        await polygonService.bindPolygonToArea(polygonId, areaId);
        await reloadPolygons();
        await treeRef.current?.reload();
      } catch (err) {
        console.error("link polygon failed:", err);
      }
    },
    [polygonService, reloadPolygons],
  );

  const handleUnlinkPolygon = useCallback(
    async (_polygonId: PolygonID, areaId: string) => {
      if (!polygonService) return;
      try {
        await polygonService.unbindPolygonFromArea(areaId);
        await reloadPolygons();
        treeRef.current?.reload();
      } catch (err) {
        console.error("unlink polygon failed:", err);
      }
    },
    [polygonService, reloadPolygons],
  );

  const handleUnlinkArea = useCallback(
    async (areaId: string) => {
      if (!polygonService) return;
      try {
        await polygonService.unbindPolygonFromArea(areaId);
        await reloadPolygons();
        treeRef.current?.reload();
      } catch (err) {
        console.error("unlink area failed:", err);
      }
    },
    [polygonService, reloadPolygons],
  );

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
        onVertexHover={handleVertexHover}
        onEdgeHover={handleEdgeHover}
        onPolygonHover={handlePolygonHover}
      />

      {edgeMenu && (
        <EdgeContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          onAddVertex={handleEdgeAddVertex}
          onClose={() => setEdgeMenu(null)}
        />
      )}

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
          <div
            className="sidebar-tab-panel"
            style={{ display: activeTab === "areas" ? "flex" : "none" }}
          >
            <AreaTree
              ref={treeRef}
              service={regionService}
              api={RegionBinding}
              onUnlinkPolygon={handleUnlinkArea}
              onTreeChanged={handleTreeChanged}
            />
          </div>
          <div
            className="sidebar-tab-panel"
            style={{ display: activeTab === "polygons" ? "flex" : "none" }}
          >
            <PolygonList
              polygons={polygons}
              polygonAreaMap={polygonAreaMap}
              tree={areaTree}
              selectedPolygonId={snapshot.selectedPolygonId}
              onPolygonClick={handlePolygonFocus}
              onDeletePolygon={handleDeletePolygon}
              onToggleActive={handleToggleActive}
              onToggleLocked={handleToggleLocked}
              onLinkPolygon={handleLinkPolygon}
              onUnlinkPolygon={handleUnlinkPolygon}
              isDrawing={isDrawing}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

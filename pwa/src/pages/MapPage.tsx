import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { VertexContextMenu } from "../components/VertexContextMenu";
import { AreaTree, type AreaTreeHandle } from "../components/AreaTree";
import { PolygonList } from "../components/PolygonList";
import { AiMapImportDialog } from "../components/AiMapImportDialog";
import { TipStack } from "../components/TipStack";
import { useServices } from "../contexts/ServicesContext";
import { RegionService } from "../services/region-service";
import { buildPolygonAreaMap } from "../services/polygon-service";
import { buildAiMapImportService } from "../services/ai-map-import-factory";
import type {
  AiMapImportService,
  ImportDraft,
} from "../services/ai-map-import";
import { commitDraftPolygons } from "../lib/ai-map-commit";
import {
  assignPlacesToPolygons,
  type PolygonRing,
} from "../lib/assign-places-to-polygons";
import {
  overlayBoundariesToPolygons,
  largestBoundary,
  type ImageSize,
} from "../lib/overlay-georeference";
import { extractColorBoundaries } from "../lib/extract-boundary-color";
import type { VisionBoundary } from "../services/ai-map-import";
import type {
  PolygonID,
  EdgeID,
  VertexID,
  PolygonSnapshot,
  NetworkPolygonEditor,
} from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";
import type { AreaTreeNode } from "../services/region-service";

const SIDEBAR_MIN_WIDTH = 260;
// 区域親番名（例: NRT-001-05 加良部1丁目）を折り返さず表示できる初期幅。
const SIDEBAR_DEFAULT_WIDTH = 340;

type SidebarTab = "areas" | "polygons";

export function MapPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showTips } = useTips();
  const { snapshot, actions } = useMapState();
  const mapRef = useRef<MapViewHandle>(null);
  const treeRef = useRef<AreaTreeHandle>(null);
  const editorRef = useRef<NetworkPolygonEditor | null>(null);
  const reloadPolygonsRef = useRef<() => Promise<void>>(async () => {});
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [vertexMenu, setVertexMenu] = useState<{
    x: number;
    y: number;
    vertexId: VertexID;
  } | null>(null);

  const { regionBindingApi, mapBinding, settingsService, placeImportService } =
    useServices();
  const regionService = useMemo(
    () => new RegionService(regionBindingApi),
    [regionBindingApi],
  );

  // --- AI 地図取込 ---
  const [aiImportService, setAiImportService] =
    useState<AiMapImportService | null>(null);
  const [aiProviderName, setAiProviderName] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPendingCounts, setAiPendingCounts] = useState<Map<string, number>>(
    new Map(),
  );

  const refreshAiPendingCounts = useCallback(
    async (polys: PolygonSnapshot[]) => {
      const entries = await Promise.all(
        polys.map(async (p) => {
          const id = p.id as string;
          return [id, await placeImportService.pendingCount(id)] as const;
        }),
      );
      setAiPendingCounts(new Map(entries.filter(([, n]) => n > 0)));
    },
    [placeImportService],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const [provider, model, consent] = await Promise.all([
        settingsService.getAiProvider(),
        settingsService.getAiModel(),
        settingsService.getAiMapImportConsent(),
      ]);
      const apiKey = await settingsService.getAiApiKey(provider);
      if (!active) return;
      setAiProviderName(provider);
      setAiConsent(consent);
      setAiImportService(
        apiKey ? buildAiMapImportService(provider, apiKey, model) : null,
      );
    })();
    return () => {
      active = false;
    };
  }, [settingsService]);

  const handleAiGrantConsent = useCallback(async () => {
    await settingsService.setAiMapImportConsent(true);
    setAiConsent(true);
  }, [settingsService]);

  const handleAiCommit = useCallback(
    async (draft: ImportDraft): Promise<number> => {
      const ed = editorRef.current;
      if (!ed) return 0;
      const ids = commitDraftPolygons(ed, draft.polygons);
      await ed.save();

      // 場所番号は、内包する取込ポリゴンに束ねて一時保持する。
      // 区域へ紐付けた後にポリゴン一覧から Place 化する（docs/wants/03 Phase 1.1）。
      if (draft.places.length > 0) {
        const rings: PolygonRing[] = [];
        for (const id of ids) {
          const geojson = ed.getPolygonGeoJSON(id);
          const ring = geojson?.coordinates?.[0] as
            [number, number][] | undefined;
          if (ring) rings.push({ id: id as string, ring });
        }
        await placeImportService.stash(
          assignPlacesToPolygons(rings, draft.places),
        );
      }

      await reloadPolygonsRef.current();
      await refreshAiPendingCounts(ed.getPolygons());
      return ids.length;
    },
    [placeImportService, refreshAiPendingCounts],
  );

  const handleImportAiPlaces = useCallback(
    async (polygonId: PolygonID, areaId: string) => {
      await placeImportService.importForArea(areaId, [polygonId as string]);
      const ed = editorRef.current;
      if (ed) await refreshAiPendingCounts(ed.getPolygons());
    },
    [placeImportService, refreshAiPendingCounts],
  );

  // --- 手動オーバーレイ整列（低信頼フォールバック） ---
  const [alignment, setAlignment] = useState<{
    url: string;
    imageSize: ImageSize;
    boundaries: VisionBoundary[];
  } | null>(null);
  const [alignOpacity, setAlignOpacity] = useState(0.9);

  const handleManualAlign = useCallback((image: Blob, draft: ImportDraft) => {
    const url = URL.createObjectURL(image);
    const img = new Image();
    img.onload = () => {
      setAlignOpacity(0.9);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      void (async () => {
        // 太い色付き境界線を色抽出で優先的に取得（vision の座標推定より正確）。
        // 見つからなければ vision のトレース結果へフォールバックする。
        let boundaries = draft.extraction.boundaries;
        try {
          const rings = await extractColorBoundaries(image);
          if (rings.length > 0)
            boundaries = rings.map((r) => ({ vertices: r }));
        } catch {
          // 色抽出に失敗しても vision 結果で継続
        }
        // 番号付き小枠などの誤検出を落とし、面積最大の外周 1 本だけ採用する。
        boundaries = largestBoundary(boundaries);
        setAlignment({ url, imageSize: { width, height }, boundaries });
        // アスペクト比(幅/高さ)を渡して正方形化を防ぐ。拡大縮小・回転は地図上のハンドルで操作。
        mapRef.current?.showAlignmentOverlay(url, 0.9, width / height);
      })();
    };
    img.src = url;
    setAiDialogOpen(false);
  }, []);

  const clearAlignment = useCallback(() => {
    mapRef.current?.hideAlignmentOverlay();
    setAlignment((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
  }, []);

  const handleAlignConfirm = useCallback(async () => {
    const ed = editorRef.current;
    const bounds = mapRef.current?.getAlignmentOverlayBounds();
    const rotation = mapRef.current?.getAlignmentOverlayRotation() ?? 0;
    if (ed && alignment && bounds) {
      const polys = overlayBoundariesToPolygons(
        bounds,
        alignment.boundaries,
        rotation,
      );
      commitDraftPolygons(ed, polys);
      await ed.save();
      await reloadPolygonsRef.current();
    }
    clearAlignment();
  }, [alignment, clearAlignment]);

  const {
    editor,
    polygonService,
    ready: editorReady,
  } = usePolygonEditor(mapBinding, regionBindingApi);

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
  reloadPolygonsRef.current = reloadPolygons;

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
    // 編集モードでは現在のズーム・位置を維持する（頂点編集のため拡大した状態を
    // 保つ。focusPolygon は全体にフィットしてしまうので呼ばない）。

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
        const ed = editorRef.current;
        if (!ed) return;
        // 終点近傍に別の頂点/辺があれば融合して境界を共有する（スナップ付き確定）。
        // 対象が無ければ endDragWithSnap 内部で従来の交差解決 moveVertex にフォールバックする。
        const thresholdDeg =
          mapRef.current?.pixelsToDegrees(
            mapRef.current.getSnapThresholdPx(),
          ) ?? 0.001;
        const cs = ed.endDragWithSnap(thresholdDeg);
        mapRef.current?.applyChangeSet(cs);
        setPolygons(ed.getPolygons());
        ed.save().catch(console.error);
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
        // 頂点を優先（頂点はエッジ上にも乗るため、頂点上なら削除メニューを出す）。
        const nearVertex = ed.findNearestVertex(lat, lng, thresholdDeg);
        if (nearVertex) {
          setEdgeMenu(null);
          setVertexMenu({
            x: containerX,
            y: containerY,
            vertexId: nearVertex.id,
          });
          return;
        }
        const nearEdge = ed.findNearestEdge(lat, lng, thresholdDeg);
        if (nearEdge) {
          setVertexMenu(null);
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

  const handleVertexDelete = useCallback(() => {
    if (!vertexMenu || !editorRef.current) return;
    // dissolve: 頂点を除去して両隣を再接続。ポリゴン ID を保つので区域紐付けは維持。
    // 溶解できない頂点（次数≠2・三角形の頂点等）は空の ChangeSet が返る。
    const cs = editorRef.current.dissolveVertex(vertexMenu.vertexId);
    if (cs.vertices.removed.length > 0) {
      mapRef.current?.applyChangeSet(cs);
      editorRef.current.save().catch(console.error);
      setPolygons(editorRef.current.getPolygons());
    }
    setVertexMenu(null);
  }, [vertexMenu]);

  const handlePruneOrphans = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.pruneOrphans();
    mapRef.current?.applyChangeSet(cs);
    editorRef.current.save().catch(console.error);
    setPolygons(editorRef.current.getPolygons());
  }, []);

  const handleFinishEditing = useCallback(() => {
    mapRef.current?.disableVertexDrag();
    mapRef.current?.highlightPolygon(null);
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
          // 編集中のポリゴンを削除した場合は編集モードを解除する
          // （selectPolygon(null) は Idle 時しか効かないため endEditing を使う）。
          mapRef.current?.disableVertexDrag();
          actions.endEditing();
          mapRef.current?.highlightPolygon(null);
          setVertexMenu(null);
          setEdgeMenu(null);
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
      {/* 地図パネル: ツールチップ(TipStack)は地図上（左）に重ね、右サイドバーの
          区域リスト操作を塞がないようこのパネル内にアンカーする。 */}
      <div className="map-panel">
        <MapView
          ref={mapRef}
          onMapClick={handleMapClick}
          onPolygonClick={handlePolygonClick}
          onPolygonDoubleClick={(id) => {
            const info = polygonAreaMap.get(id as string);
            if (info) navigate(`/map/area/${info.areaId}/detail`);
          }}
          onContextMenu={handleContextMenu}
          onVertexHover={handleVertexHover}
          onEdgeHover={handleEdgeHover}
          onPolygonHover={handlePolygonHover}
        />
        <TipStack />
      </div>

      {edgeMenu && (
        <EdgeContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          label={t.map.contextMenu.addVertex}
          onAddVertex={handleEdgeAddVertex}
          onClose={() => setEdgeMenu(null)}
        />
      )}

      {vertexMenu && (
        <VertexContextMenu
          x={vertexMenu.x}
          y={vertexMenu.y}
          label={t.map.contextMenu.deleteVertex}
          onDelete={handleVertexDelete}
          onClose={() => setVertexMenu(null)}
        />
      )}

      {aiDialogOpen && aiImportService && (
        <AiMapImportDialog
          importService={aiImportService}
          providerName={
            aiProviderName === "anthropic"
              ? "Anthropic"
              : aiProviderName === "gemini"
                ? "Gemini"
                : aiProviderName
          }
          consentGiven={aiConsent}
          onGrantConsent={handleAiGrantConsent}
          onCommit={handleAiCommit}
          onManualAlign={handleManualAlign}
          onClose={() => setAiDialogOpen(false)}
        />
      )}

      {alignment && (
        <div className="align-panel">
          <span className="align-panel-title">{t.map.aiImport.alignTitle}</span>
          <p className="align-panel-hint">{t.map.aiImport.alignHint}</p>
          <label className="align-panel-field">
            {t.map.aiImport.alignOpacity}
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={alignOpacity}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAlignOpacity(v);
                mapRef.current?.setAlignmentOverlayOpacity(v);
              }}
            />
          </label>
          <div className="align-panel-actions">
            <button className="btn btn-sm" onClick={clearAlignment}>
              {t.common.cancel}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleAlignConfirm()}
            >
              {t.map.aiImport.alignConfirm}
            </button>
          </div>
        </div>
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

      {sidebarCollapsed ? (
        <div className="map-sidebar-collapsed">
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(false)}
            title={t.map.expandSidebar}
            aria-label={t.map.expandSidebar}
          >
            ◀
          </button>
        </div>
      ) : (
        <>
          <div
            className="sidebar-resize-handle"
            onMouseDown={handleResizeStart}
          />
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
              <button
                className="sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed(true)}
                title={t.map.collapseSidebar}
                aria-label={t.map.collapseSidebar}
              >
                ▶
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
                  api={regionBindingApi}
                  onUnlinkPolygon={handleUnlinkArea}
                  onSelectPolygon={(polygonId) =>
                    handlePolygonFocus(polygonId as PolygonID)
                  }
                  selectedPolygonId={
                    snapshot.selectedPolygonId as string | null
                  }
                  onTreeChanged={handleTreeChanged}
                  onOpenAreaDetail={(areaId) =>
                    navigate(`/map/area/${areaId}/detail`)
                  }
                />
              </div>
              <div
                className="sidebar-tab-panel"
                style={{ display: activeTab === "polygons" ? "flex" : "none" }}
              >
                {aiImportService && (
                  <button
                    className="btn btn-sm ai-import-trigger"
                    onClick={() => setAiDialogOpen(true)}
                  >
                    {t.map.aiImport.button}
                  </button>
                )}
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
                  isEditing={isEditing}
                  onStartDrawing={handleStartFreeDrawing}
                  onPruneOrphans={handlePruneOrphans}
                  aiPendingCounts={aiPendingCounts}
                  onImportAiPlaces={(polygonId, areaId) =>
                    void handleImportAiPlaces(polygonId, areaId)
                  }
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

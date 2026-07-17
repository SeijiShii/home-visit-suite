import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMapState, MapMode } from "../hooks/useMapState";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useSharedApplied } from "../hooks/useSharedApplied";
import {
  AREA_TREE_TABLES,
  MAP_NETWORK_TABLES,
  PLACE_TABLES,
} from "../lib/linkself/shared-events";
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
import { PolygonDeleteConfirmDialog } from "../components/PolygonDeleteConfirmDialog";
import { AreaTree, type AreaTreeHandle } from "../components/AreaTree";
import { PolygonList } from "../components/PolygonList";
import { TipStack } from "../components/TipStack";
import { useServices } from "../contexts/ServicesContext";
import { RegionService } from "../services/region-service";
import {
  buildPolygonAreaMap,
  toPolygonAreaIds,
} from "../services/polygon-service";
import { computeBindingFixup } from "../lib/polygon-binding-fixup";
import { findStaleBindings } from "../lib/area-binding-heal";
import {
  hasDuplicateSortOrder,
  renumberByGeometry,
  renumberTargets,
} from "../lib/place-renumber";
import { pointInRing } from "../lib/area-detail-geo";
import type { PlaceOverlayItem } from "../lib/map-renderer";
import type {
  PolygonID,
  EdgeID,
  VertexID,
  PolygonSnapshot,
  NetworkPolygonEditor,
  ChangeSet,
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
  const mapPanelRef = useRef<HTMLDivElement>(null);
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
  // ドラッグ終了コールバックは編集モード開始時に固定されるため、
  // 紐付け参照は ref 経由で常に最新を引く。
  const polygonAreaMapRef = useRef(polygonAreaMap);
  polygonAreaMapRef.current = polygonAreaMap;
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
  // 頂点統合でポリゴンが消滅した操作の ChangeSet（確認ダイアログ表示中）。
  // OK で保存＋紐付け補正、キャンセルで undo 復元（wants 03 削除の確認ダイアログ）。
  // 発生時のエディタ instance を同梱し、確定/キャンセル時に世代照合する
  // （受信起因の再構築を跨いで適用すると、削除されないポリゴンの紐付けだけ
  // 解除する事故になるため。L-014 変種）。
  const [pendingMergeDelete, setPendingMergeDelete] = useState<{
    cs: ChangeSet;
    editor: NetworkPolygonEditor;
  } | null>(null);

  const { regionBindingApi, mapBinding, placeService } = useServices();
  const regionService = useMemo(
    () => new RegionService(regionBindingApi),
    [regionBindingApi],
  );

  // --- 読み取り専用の場所オーバーレイ（灰色/赤灰色）と重複再採番 ---
  // 仕様: docs/wants/03「区域編集画面での場所表示と番号再採番」。
  // 全区域の場所を読み込み、(1) 区域内で SortOrder が重複していたら幾何順
  // （上→下、左→右）で再採番して保存、(2) 所属区域のどのポリゴンにも内包
  // されない場所は orphan（赤灰色）として地図に渡す。
  // 多重実行の完了順逆転で古い判定が最終表示に残らないための世代カウンタ。
  const placeOverlayGenRef = useRef(0);
  const refreshPlaceOverlay = useCallback(
    async (tree: AreaTreeNode[]) => {
      const ed = editorRef.current;
      if (!ed) return;
      const gen = ++placeOverlayGenRef.current;
      const overlay: PlaceOverlayItem[] = [];
      for (const region of tree) {
        for (const pa of region.parentAreas) {
          for (const area of pa.areas) {
            let places = renumberTargets(
              await placeService.listPlaces(area.id),
            );
            if (hasDuplicateSortOrder(places)) {
              const changed = renumberByGeometry(places);
              for (const p of changed) await placeService.savePlace(p);
              const byId = new Map(changed.map((p) => [p.id, p]));
              places = places.map((p) => byId.get(p.id) ?? p);
            }
            // 飛地対応: 区域に紐づく全ポリゴンの外周リング（GeoJSON [lng,lat]）
            const rings = (area.polygonIds ?? [])
              .map(
                (pid) =>
                  ed.getPolygonGeoJSON(pid as PolygonID)?.coordinates?.[0] as
                    [number, number][] | undefined,
              )
              .filter((r): r is [number, number][] => Boolean(r));
            for (const p of places) {
              overlay.push({
                id: p.id,
                lat: p.coord.lat,
                lng: p.coord.lng,
                index: p.sortOrder,
                orphan: !rings.some((r) => pointInRing(p.coord, r)),
              });
            }
          }
        }
      }
      // 後発の refresh が走っていたら古い結果は捨てる（表示のみ。保存は冪等）
      if (gen !== placeOverlayGenRef.current) return;
      mapRef.current?.setPlaceOverlay(overlay);
    },
    [placeService],
  );

  // ScopeNetwork 受信追従（他メンバー・他端末の編集の取り込み）:
  // map_* はエディタのメモリ内ネットワーク再初期化が必要（reloadKey 増分）、
  // 区域ツリー・場所はリロードで足りる。
  const [mapReloadKey, setMapReloadKey] = useState(0);
  useSharedApplied(MAP_NETWORK_TABLES, () => setMapReloadKey((k) => k + 1));
  useSharedApplied([...AREA_TREE_TABLES, ...PLACE_TABLES], () => {
    void reloadPolygonsRef.current();
    void treeRef.current?.reload();
  });

  const {
    editor,
    polygonService,
    ready: editorReady,
  } = usePolygonEditor(mapBinding, regionBindingApi, mapReloadKey);

  // ローカル編集の ChangeSet に対する区域紐付けの補正（wants 03「頂点ドラッグ
  // での頂点統合」）: 分割で新 ID が出たら分割元の区域へ紐付け、消滅した紐付け
  // 済みポリゴンは解除する。分割・消滅は頂点マージに限らず弦の描画・交差解決
  // でも起きるため、ChangeSet を生むすべてのローカル編集経路から呼ぶ。
  const applyBindingFixup = useCallback(
    (cs: ChangeSet) => {
      const fixup = computeBindingFixup(
        cs,
        (pid) => polygonAreaMapRef.current.get(pid)?.areaId,
      );
      if (fixup.bind.length === 0 && fixup.unbind.length === 0) return;
      void (async () => {
        try {
          for (const b of fixup.bind) {
            await polygonService?.bindPolygonToArea(
              b.polygonId as PolygonID,
              b.areaId,
            );
          }
          for (const u of fixup.unbind) {
            await polygonService?.unbindPolygonFromArea(
              u.areaId,
              u.polygonId as PolygonID,
            );
          }
          await reloadPolygonsRef.current();
          await treeRef.current?.reload();
        } catch (e) {
          console.error(e);
        }
      })();
    },
    [polygonService],
  );

  // --- AreaTreeからの変更通知 ---

  const handleTreeChanged = useCallback((tree: AreaTreeNode[]) => {
    const areaMap = buildPolygonAreaMap(tree);
    setPolygonAreaMap(areaMap);
    setAreaTree(tree);
    // 紐付け集合も同時に更新する（setPolygonAreaIds が表示中レイヤーを
    // 再スタイルするため、古い紐付け集合のままだと解除済みが緑に残る）
    mapRef.current?.setLinkedPolygonIds(new Set(areaMap.keys()));
    mapRef.current?.setPolygonAreaIds(toPolygonAreaIds(areaMap));
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
    mapRef.current?.setPolygonAreaIds(toPolygonAreaIds(areaMap));
    mapRef.current?.renderAll(linkedIds);
    await refreshPlaceOverlay(tree);
  }, [polygonService, editor, regionService, refreshPlaceOverlay]);
  reloadPolygonsRef.current = reloadPolygons;

  // エディタ準備完了時に初期描画 + 無効ポリゴンID紐付きの修復スキャン
  // （wants 03「区域紐付けの無効ポリゴン ID 修復」。削除済み・面積ほぼ0の
  // ポリゴンIDが紐付いたまま残っていたらサイレントに解除する）。
  // 解除は共有ストアへの書き込みとして全メンバーへ伝播するため保護を掛ける:
  // - 実行はマウントごとに 1 回のみ（受信追従のエディタ再初期化では再実行しない）
  // - 「存在しない ID」(missing) の解除はローカルにポリゴンが 1 件以上ある場合
  //   のみ（P2P 同期の未着端末が全紐付けを誤解除しないため）。面積ほぼ0
  //   (degenerate) は実データで破綻を確認できるため常に解除
  // - 非同期の途中でエディタが差し替わったら中断（世代ガード）
  const healDoneRef = useRef(false);
  useEffect(() => {
    if (!editorReady || !editor) return;
    editorRef.current = editor;
    mapRef.current?.setEditor(editor);
    void (async () => {
      await reloadPolygons();
      if (!polygonService || healDoneRef.current) return;
      healDoneRef.current = true;
      try {
        const tree = await regionService.loadTree();
        if (editorRef.current !== editor) return;
        const hasLocalPolygons = editor.getPolygons().length > 0;
        const stale = findStaleBindings(tree, (pid) =>
          editor.getPolygonGeoJSON(pid as PolygonID),
        ).filter((s) => s.reason === "degenerate" || hasLocalPolygons);
        if (stale.length === 0) return;
        for (const s of stale) {
          if (editorRef.current !== editor) return;
          await polygonService.unbindPolygonFromArea(
            s.areaId,
            s.polygonId as PolygonID,
          );
        }
        // ref 経由で常に最新の reload を呼ぶ（unbind 中にエディタが差し
        // 替わった場合、旧クロージャの reload が新表示を上書きしないように）
        await reloadPolygonsRef.current();
        await treeRef.current?.reload();
      } catch (e) {
        console.error(e);
      }
    })();
  }, [editorReady, editor, polygonService, regionService, reloadPolygons]);

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
        // 統合でポリゴンが消滅した場合は確認ダイアログを出し、保存・紐付け
        // 補正は確定後に行う（キャンセルなら undo で復元）。
        if (cs.polygons.removed.length > 0) {
          setPendingMergeDelete({ cs, editor: ed });
          return;
        }
        ed.save().catch(console.error);
        applyBindingFixup(cs);
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
      // 弦の描画（既存頂点/線分への接続）でもポリゴン分割・消滅は起き得る
      applyBindingFixup(cs);

      // 既存頂点にスナップして描画継続（開始時）→ ラバーバンド起点を設定
      if (nearVertex && ed.getMode() === "drawing") {
        mapRef.current?.setRubberBandOrigin(nearVertex.id);
      }

      // 線分スナップで描画開始（線分分割）→ 分割で追加された頂点が起点。
      // 交差解決で複数頂点が増えるケースがあるため末尾（分割点）を採用する。
      if (nearEdge && !nearVertex && ed.getMode() === "drawing") {
        const splitVertex = cs.vertices.added[cs.vertices.added.length - 1];
        if (splitVertex) {
          mapRef.current?.setRubberBandOrigin(splitVertex.id);
        }
      }

      // snapToVertex / snapToEdge で描画モードが終了した場合
      if (ed.getMode() === "idle") {
        actions.endDrawing();
        ed.save().catch(console.error);
        setPolygons(ed.getPolygons());
      }
    },
    [actions, snapshot.mode, applyBindingFixup],
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
    applyBindingFixup(cs);
    actions.endDrawing();
  }, [actions, applyBindingFixup]);

  const handleUndoDrawing = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.undo();
    if (cs) {
      mapRef.current?.applyChangeSet(cs);
      // undo で消滅したポリゴンの紐付け解除（分割 undo 時の新 ID 側など）
      applyBindingFixup(cs);
    }
  }, [applyBindingFixup]);

  // --- ポリゴン削除の確認ダイアログ（頂点統合、wants 03） ---

  // ダイアログ表示中に受信起因でエディタが再構築されたら保留を破棄する
  // （未保存のドラッグ操作自体が消えているため、適用しても意味を成さない）。
  useEffect(() => {
    setPendingMergeDelete((prev) =>
      prev && prev.editor !== editor ? null : prev,
    );
  }, [editor]);

  const handleMergeDeleteConfirm = useCallback(() => {
    if (!pendingMergeDelete) return;
    setPendingMergeDelete(null);
    if (editorRef.current !== pendingMergeDelete.editor) return; // 世代不一致
    const { cs } = pendingMergeDelete;
    // 編集中のポリゴン自体が消滅した場合は編集モードを終了する
    if (
      snapshot.selectedPolygonId != null &&
      cs.polygons.removed.includes(snapshot.selectedPolygonId as PolygonID)
    ) {
      mapRef.current?.disableVertexDrag();
      mapRef.current?.highlightPolygon(null);
      actions.endEditing();
    }
    editorRef.current?.save().catch(console.error);
    applyBindingFixup(cs);
  }, [
    pendingMergeDelete,
    applyBindingFixup,
    snapshot.selectedPolygonId,
    actions,
  ]);

  const handleMergeDeleteCancel = useCallback(() => {
    if (!pendingMergeDelete) return;
    setPendingMergeDelete(null);
    const ed = editorRef.current;
    if (!ed || ed !== pendingMergeDelete.editor) return; // 世代不一致
    const inv = ed.undo();
    if (inv) {
      mapRef.current?.applyChangeSet(inv);
      setPolygons(ed.getPolygons());
      ed.save().catch(console.error);
    }
  }, [pendingMergeDelete]);

  // --- アンドゥ・リドゥボタン（区域編集画面の常設、wants 03） ---
  // 描画モード中は描画ツールバーの「戻す」に譲る（描画セッションの整合のため
  // 非表示）。undo/redo による分割・消滅にも紐付け補正を適用する。

  const handleHistoryUndo = useCallback(() => {
    const ed = editorRef.current;
    if (!ed?.canUndo()) return;
    const cs = ed.undo();
    if (!cs) return;
    mapRef.current?.applyChangeSet(cs);
    setPolygons(ed.getPolygons());
    ed.save().catch(console.error);
    applyBindingFixup(cs);
  }, [applyBindingFixup]);

  const handleHistoryRedo = useCallback(() => {
    const ed = editorRef.current;
    if (!ed?.canRedo()) return;
    const cs = ed.redo();
    if (!cs) return;
    mapRef.current?.applyChangeSet(cs);
    setPolygons(ed.getPolygons());
    ed.save().catch(console.error);
    applyBindingFixup(cs);
  }, [applyBindingFixup]);

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
    applyBindingFixup(cs);
    editorRef.current.save().catch(console.error);
    setEdgeMenu(null);
  }, [edgeMenu, applyBindingFixup]);

  const handleVertexDelete = useCallback(() => {
    if (!vertexMenu || !editorRef.current) return;
    // dissolve: 頂点を除去して両隣を再接続。ポリゴン ID を保つので区域紐付けは維持。
    // 溶解できない頂点（次数≠2・三角形の頂点等）は空の ChangeSet が返る。
    const cs = editorRef.current.dissolveVertex(vertexMenu.vertexId);
    if (cs.vertices.removed.length > 0) {
      mapRef.current?.applyChangeSet(cs);
      applyBindingFixup(cs);
      editorRef.current.save().catch(console.error);
      setPolygons(editorRef.current.getPolygons());
    }
    setVertexMenu(null);
  }, [vertexMenu, applyBindingFixup]);

  const handlePruneOrphans = useCallback(() => {
    if (!editorRef.current) return;
    const cs = editorRef.current.pruneOrphans();
    mapRef.current?.applyChangeSet(cs);
    applyBindingFixup(cs);
    editorRef.current.save().catch(console.error);
    setPolygons(editorRef.current.getPolygons());
  }, [applyBindingFixup]);

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

  // ポリゴン一覧の ✂: 当該ポリゴンのみ解除（同一区域の他の飛地は維持）
  const handleUnlinkPolygon = useCallback(
    async (polygonId: PolygonID, areaId: string) => {
      if (!polygonService) return;
      try {
        await polygonService.unbindPolygonFromArea(areaId, polygonId);
        await reloadPolygons();
        treeRef.current?.reload();
      } catch (err) {
        console.error("unlink polygon failed:", err);
      }
    },
    [polygonService, reloadPolygons],
  );

  // 区域一覧（AreaTree）の解除メニュー: 当該区域の全ポリゴンを一括解除
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

  // 地図パネルのサイズ変化を監視して Leaflet のレイアウトを再計算する。
  // サイドバーの開閉・ドラッグリサイズ・ウィンドウリサイズのいずれでも
  // invalidateSize を確実に呼び、タイルやポリゴンの未描画領域が残らないようにする。
  useEffect(() => {
    const el = mapPanelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  // 各編集操作後の setPolygons による再レンダーで最新化される
  const canUndo = editorRef.current?.canUndo() ?? false;
  const canRedo = editorRef.current?.canRedo() ?? false;

  return (
    <div className="map-page">
      {/* 地図パネル: ツールチップ(TipStack)は地図上（左）に重ね、右サイドバーの
          区域リスト操作を塞がないようこのパネル内にアンカーする。 */}
      <div className="map-panel" ref={mapPanelRef}>
        <MapView
          ref={mapRef}
          onMapClick={handleMapClick}
          onPolygonClick={handlePolygonClick}
          onPolygonDoubleClick={(id) => {
            const info = polygonAreaMap.get(id as string);
            // ポリゴンダブルクリック → 当該区域の訪問記録画面（場所編集を兼ねる）へ
            // 遷移する（docs/wants/03「ポリゴンクリック操作」2026-07-14 改訂）。
            // 区域編集からの遷移であることを伝え、訪問記録画面に
            // 「区域編集に戻る」ボタンを出す（docs/wants/03「場所の直接編集」）。
            if (info)
              navigate(`/visits/${info.areaId}`, {
                state: { from: "map-editor" },
              });
          }}
          onContextMenu={handleContextMenu}
          onVertexHover={handleVertexHover}
          onEdgeHover={handleEdgeHover}
          onPolygonHover={handlePolygonHover}
        />
        <TipStack />
        {!isDrawing && (
          <div className="map-history-toolbar">
            <button
              className="drawing-btn"
              onClick={handleHistoryUndo}
              disabled={!canUndo}
              title={t.map.undo}
            >
              ↶ {t.map.undo}
            </button>
            <button
              className="drawing-btn"
              onClick={handleHistoryRedo}
              disabled={!canRedo}
              title={t.map.redo}
            >
              ↷ {t.map.redo}
            </button>
          </div>
        )}
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

      {pendingMergeDelete && (
        <PolygonDeleteConfirmDialog
          onConfirm={handleMergeDeleteConfirm}
          onCancel={handleMergeDeleteCancel}
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
                    navigate(`/visits/${areaId}`, {
                      state: { from: "map-editor" },
                    })
                  }
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
                  isEditing={isEditing}
                  onStartDrawing={handleStartFreeDrawing}
                  onPruneOrphans={handlePruneOrphans}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

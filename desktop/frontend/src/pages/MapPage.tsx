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
import type { VertexDragEvent } from "../lib/map-renderer";
import type { PolygonAreaInfo } from "../services/polygon-service";

const SIDEBAR_MIN_WIDTH = 192;

type SidebarTab = "areas" | "polygons";

/**
 * ポリゴンの外環 ring 上で from → to 間の頂点を返す（短い方向で歩く）。
 * ring は GeoJSON 座標 [lng, lat][] で、最初と最後が同じ点（閉じたリング）。
 * from/to は ring 上の辺に乗る点。返り値は {lat, lng}[] で from/to 自体は含まない。
 */
function walkBoundary(
  ring: number[][],
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { lat: number; lng: number }[] {
  const n = ring.length - 1; // 最後は閉じ点なので除外
  const eps = 1e-8;

  // ring 上の辺インデックスを見つける（点 p が辺 ring[i]→ring[i+1] 上にある）
  const findEdge = (p: { lat: number; lng: number }): number => {
    for (let i = 0; i < n; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      const dAP = Math.hypot(p.lng - ax, p.lat - ay);
      const dPB = Math.hypot(bx - p.lng, by - p.lat);
      const dAB = Math.hypot(bx - ax, by - ay);
      if (Math.abs(dAP + dPB - dAB) < eps) return i;
    }
    return 0;
  };

  const fromEdge = findEdge(from);
  const toEdge = findEdge(to);

  // 正方向（fromEdge → toEdge）で ring 頂点を収集
  const fwd: { lat: number; lng: number }[] = [];
  let idx = (fromEdge + 1) % n;
  while (idx !== (toEdge + 1) % n) {
    fwd.push({ lat: ring[idx][1], lng: ring[idx][0] });
    idx = (idx + 1) % n;
  }

  // 逆方向
  const bwd: { lat: number; lng: number }[] = [];
  idx = fromEdge;
  while (idx !== toEdge) {
    bwd.push({ lat: ring[idx][1], lng: ring[idx][0] });
    idx = (idx - 1 + n) % n;
  }

  return fwd.length <= bwd.length ? fwd : bwd;
}

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

  const resolvingRef = useRef(false);
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

  const handleVertexDrag = useCallback(
    async (event: VertexDragEvent) => {
      if (!polygonService) return;
      try {
        const modified = await polygonService.moveVertex(
          event.polygonId as unknown as PolygonID,
          event.vertexIndex,
          event.lat,
          event.lng,
        );
        // ポリゴンレイヤーとマーカーを更新（再描画せず差分更新）
        mapRef.current?.updateEditMarkers(modified);
        // ローカルステートも更新
        setPolygons(polygonService.getAllPolygons());
      } catch (err) {
        console.error("vertex move failed:", err);
      }
    },
    [polygonService],
  );

  // ポリゴンクリックハンドラを ref 経由で参照（ポリゴンレイヤーに登録されたクロージャが
  // stale にならないように、常に最新の snapshot.mode を参照する）
  const polygonClickRef = useRef<(id: PolygonID) => void>(() => {});
  const handlePolygonClick = useCallback((id: PolygonID) => {
    polygonClickRef.current(id);
  }, []);
  polygonClickRef.current = (id: PolygonID) => {
    if (snapshot.mode === MapMode.Drawing) return;

    // 同じポリゴンを編集中 → 何もしない
    if (
      snapshot.mode === MapMode.Editing &&
      snapshot.selectedPolygonId === id
    ) {
      return;
    }

    // 別のポリゴンを編集中 → 切り替え
    if (snapshot.mode === MapMode.Editing) {
      mapRef.current?.exitEditMode();
    }

    actions.startEditing(id);
    mapRef.current?.highlightPolygon(id);
    mapRef.current?.focusPolygon(id);
    mapRef.current?.enterEditMode(id, handleVertexDrag);
  };

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
    mapRef.current?.renderDraft(snapshot.draft, bridgeInfo, dc.isSplitMode);
    if (snapshot.mode === MapMode.Drawing && !dc.isSplitMode) {
      mapRef.current?.setCursor("crosshair");
      mapRef.current?.enableRubberBand();
    } else {
      mapRef.current?.setCursor(
        snapshot.mode === MapMode.Drawing ? "crosshair" : "",
      );
      mapRef.current?.disableRubberBand();
    }
  }, [snapshot.draft, snapshot.mode, actions]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      // 編集モード中: 辺の近傍なら頂点追加、そうでなければ編集終了
      if (snapshot.mode === MapMode.Editing) {
        const edgeHit = mapRef.current?.findEdgeAtClick(lat, lng);
        if (edgeHit && polygonService) {
          polygonService
            .insertVertex(
              edgeHit.polygonId as unknown as PolygonID,
              edgeHit.afterIndex,
              edgeHit.lat,
              edgeHit.lng,
            )
            .then((updated) => {
              mapRef.current?.rebuildEditMarkers(updated);
              setPolygons(polygonService.getAllPolygons());
            })
            .catch((err) => console.error("insert vertex failed:", err));
          return;
        }
        mapRef.current?.exitEditMode();
        actions.cancelEditing();
        return;
      }
      if (snapshot.mode !== MapMode.Drawing) {
        return;
      }
      resolvingRef.current = false; // 前回のカーブ完了フラグをリセット

      const snap = mapRef.current?.getSnapInfo(lat, lng);
      const clickLat = snap ? snap.lat : lat;
      const clickLng = snap ? snap.lng : lng;
      const dc = actions.drawingController;
      const pointCount = dc.draft?.points.length ?? 0;

      // 既存ポリゴン頂点にスナップした場合
      if (snap?.anchor) {
        if (pointCount === 0) {
          // 最初のポイント: ブリッジ/スプリット開始アンカーを記録
          dc.setBridgeStart(snap.anchor.polygonId, snap.anchor.vertexIndex);
          actions.handleMapClick(clickLat, clickLng);
        } else {
          // 2つ目以降: 終了アンカー記録 → ポイント追加
          dc.setBridgeEnd(snap.anchor.polygonId, snap.anchor.vertexIndex);
          actions.handleMapClick(clickLat, clickLng);
          // splitモード: ドラフトを閉じずにUI側でsplit判定
          if (!dc.isSplitMode && dc.canClose) {
            actions.closeDrawing();
          }
        }
        return;
      }

      // ドラフト始点スナップ → 閉回路
      if (mapRef.current?.isNearStartPoint(clickLat, clickLng)) {
        actions.closeDrawing();
        return;
      } else {
        let finalLat = clickLat;
        let finalLng = clickLng;

        if (polygonService && !snap?.anchor) {
          const nearVertex = polygonService.findNearestVertex(
            { lat: clickLat, lng: clickLng },
            0.0002,
          );
          if (nearVertex) {
            finalLat = nearVertex.lat;
            finalLng = nearVertex.lng;
          }
        }

        actions.handleMapClick(finalLat, finalLng);

        // ポイント追加後、開いたドラフトがポリゴンを横切っていれば自動くり抜き
        if (polygonService && !resolvingRef.current) {
          const currentDraft = dc.draft;
          if (currentDraft && currentDraft.points.length >= 2) {
            const openDraft = {
              points: [...currentDraft.points],
              isClosed: false,
            };
            const allPolys = polygonService.getAllPolygons();
            resolvingRef.current = true;
            (async () => {
              try {
                for (const poly of allPolys) {
                  const result = await polygonService.resolveOverlapsWithDraft(
                    poly.id as PolygonID,
                    openDraft,
                  );
                  if (result.created.length > 0) {
                    console.log("[autoSplit] carved!", {
                      targetPolygon: poly.id,
                      created: result.created.map((p) => p.id),
                      remainingDrafts: result.remainingDrafts.map(
                        (d) => d.points.length,
                      ),
                    });
                    await reloadPolygons();
                    treeRef.current?.reload();
                    // 残りドラフト断片をポリゴン境界で繋いでコの字にする
                    const drafts = result.remainingDrafts;
                    if (drafts.length > 0) {
                      // カーブ前のポリゴン境界を使う（ノッチなし）
                      const ring = poly.geometry.coordinates[0];
                      const allPoints: { lat: number; lng: number }[] = [
                        ...drafts[0].points,
                      ];
                      for (let di = 1; di < drafts.length; di++) {
                        // 前断片の末尾 → 次断片の先頭をポリゴン境界で繋ぐ
                        const exitPt = allPoints[allPoints.length - 1];
                        const entryPt = drafts[di].points[0];
                        const boundaryPts = walkBoundary(ring, exitPt, entryPt);
                        allPoints.push(...boundaryPts);
                        allPoints.push(...drafts[di].points);
                      }
                      const continuation = {
                        points: allPoints,
                        isClosed: false,
                      };
                      console.log("[autoSplit] continuation:", {
                        totalPoints: allPoints.length,
                        fragments: drafts.length,
                      });
                      actions.replaceDraft(continuation);
                      mapRef.current?.renderDraft(continuation, null, false);
                    } else {
                      actions.cancelDrawing();
                    }
                    return;
                  }
                }
              } catch (err) {
                console.error("[autoSplit] error:", err);
                resolvingRef.current = false;
              }
            })();
          }
        }
      }
    },
    [actions, snapshot.mode, polygonService, reloadPolygons],
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

  const handleSplitPolygon = useCallback(async () => {
    const result = actions.finalizeSplitDrawing();
    if (!result || !polygonService) return;

    try {
      const splitResult = await polygonService.splitPolygon(
        result.splitInfo.polygonId as unknown as PolygonID,
        result.draft,
      );
      if (splitResult.length === 0) {
        console.warn(
          "split produced no polygons (line may not intersect polygon boundary)",
        );
      }
      await reloadPolygons();
      treeRef.current?.reload();
    } catch (err) {
      console.error("split polygon failed:", err);
    }
  }, [actions, polygonService, reloadPolygons]);

  const handleSavePolygon = useCallback(async () => {
    const result = actions.finalizeDrawing();
    if (!result || !polygonService) return;
    try {
      if (result.bridgeInfo) {
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
      await reloadPolygons();
      treeRef.current?.reload();
    } catch (err) {
      console.error("save polygon failed:", err);
    }
  }, [actions, polygonService, reloadPolygons]);

  const handleDeletePolygon = useCallback(
    async (id: PolygonID) => {
      if (!polygonService) return;
      try {
        const areaInfo = polygonAreaMap.get(id as string);
        if (areaInfo) {
          await polygonService.deletePolygonForArea(id, areaInfo.areaId);
        } else {
          await polygonService.deletePolygon(id);
        }
        if (snapshot.selectedPolygonId === id) {
          actions.selectPolygon(null);
          mapRef.current?.highlightPolygon(null);
        }
        await reloadPolygons();
        treeRef.current?.reload();
      } catch (err) {
        console.error("delete polygon failed:", err);
      }
    },
    [
      polygonService,
      polygonAreaMap,
      snapshot.selectedPolygonId,
      actions,
      reloadPolygons,
    ],
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

  const isDrawing = snapshot.mode === MapMode.Drawing;
  const isEditing = snapshot.mode === MapMode.Editing;
  const draftClosed = snapshot.draft?.isClosed ?? false;
  const isSplitMode = actions.drawingController.isSplitMode;
  const canClose = actions.drawingController.canClose;
  const pointCount = snapshot.draft?.points.length ?? 0;

  const handleFinishEditing = useCallback(() => {
    mapRef.current?.exitEditMode();
    actions.cancelEditing();
    reloadPolygons();
  }, [actions, reloadPolygons]);

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
          <span className="drawing-hint">
            {isSplitMode
              ? t.map.splitHint
              : draftClosed
                ? t.map.drawingClosed
                : t.map.drawingHint}
          </span>
          <span className="drawing-point-count">{pointCount}</span>
          {!draftClosed && !isSplitMode && pointCount > 0 && (
            <button className="drawing-btn" onClick={handleUndoPoint}>
              {t.map.undoPoint}
            </button>
          )}
          {!draftClosed && !isSplitMode && canClose && (
            <button
              className="drawing-btn drawing-btn-close"
              onClick={handleCloseDrawing}
            >
              {t.map.closePolygon}
            </button>
          )}
          {isSplitMode && pointCount >= 2 && (
            <button
              className="drawing-btn drawing-btn-save"
              onClick={handleSplitPolygon}
            >
              {t.map.splitPolygon}
            </button>
          )}
          {draftClosed && !isSplitMode && (
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
            disabled={isDrawing || isEditing}
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
              onDeletePolygon={handleDeletePolygon}
              isDrawing={isDrawing}
            />
          )}
        </div>
      </div>
    </div>
  );
}

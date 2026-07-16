import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import {
  MapRenderer,
  type VertexDragCallbacks,
  type PlaceType,
} from "../lib/map-renderer";
import { resolveBaseMapConfig } from "../lib/map-config";
import { useI18n } from "../contexts/I18nContext";
import type {
  ChangeSet,
  PolygonID,
  VertexID,
  EdgeID,
  NetworkPolygonEditor,
} from "map-polygon-editor";

export interface MapViewHandle {
  applyChangeSet(cs: ChangeSet): void;
  renderAll(linkedPolygonIds?: Set<string>): void;
  setEditor(editor: NetworkPolygonEditor): void;
  setCursor(cursor: string): void;
  highlightPolygon(id: PolygonID | null): void;
  focusPolygon(id: PolygonID): void;
  /** 指定ポリゴン群（飛地含む）が全て収まる範囲へフォーカスする。 */
  focusPolygons(ids: readonly PolygonID[]): void;
  setLinkedPolygonIds(ids: Set<string>): void;
  setPolygonAreaIds(ids: ReadonlyMap<string, string>): void;
  enableRubberBand(): void;
  disableRubberBand(): void;
  setRubberBandOrigin(vertexId: VertexID): void;
  enableVertexDrag(callbacks: VertexDragCallbacks): void;
  disableVertexDrag(): void;
  showVertices(): void;
  hideVertices(): void;
  pixelsToDegrees(px: number): number;
  getSnapThresholdPx(): number;
  // --- 区域詳細編集モード ---
  setDetailMode(
    targetIds: readonly PolygonID[],
    neighborIds: Set<string>,
  ): void;
  clearDetailMode(): void;
  setPlaces(
    places: ReadonlyArray<{
      id: string;
      lat: number;
      lng: number;
      type: PlaceType;
      tooltip?: string;
      index?: number;
      selected?: boolean;
    }>,
  ): void;
  clearPlaces(): void;
  setMinZoom(zoom: number): void;
  clearMinZoom(): void;
  focusPlace(lat: number, lng: number): void;
  invalidateSize(): void;
  setPlaceContextMenuHandler(
    cb:
      ((placeId: string, type: PlaceType, x: number, y: number) => void) | null,
  ): void;
  setPlaceClickHandler(
    cb: ((placeId: string, type: PlaceType) => void) | null,
  ): void;
  startPlaceMove(
    placeId: string,
    onConfirm: (lat: number, lng: number) => void,
    onCancel: () => void,
  ): void;
  cancelPlaceMove(): void;
  isPlaceMoving(): boolean;
}

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void;
  onPolygonClick?: (id: PolygonID) => void;
  onPolygonDoubleClick?: (id: PolygonID) => void;
  onContextMenu?: (
    lat: number,
    lng: number,
    containerX: number,
    containerY: number,
  ) => void;
  onVertexHover?: (id: VertexID) => void;
  onEdgeHover?: (id: EdgeID) => void;
  onPolygonHover?: (id: PolygonID) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  },
  ref,
) {
  const { t } = useI18n();
  // 地図/航空写真トグルのラベルは mount 時点の値を使う（他の地図ラベル同様、再マウントで追従）。
  const baseMapLabelsRef = useRef({
    map: t.map.baseMapRoadmap,
    aerial: t.map.baseMapAerial,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  // renderer が作り直されても失われないよう、外部から渡された editor と
  // ハンドラを保持し、mount 時に再適用する。React StrictMode の再マウントで
  // renderer が再生成されると、旧 renderer に対する setEditor 等が消失し
  // renderAll が editor 不在で何も描画しなくなるため（開発時のみの再現だが、
  // 将来の remount 一般に対する防御でもある）。
  const appliedEditorRef = useRef<NetworkPolygonEditor | null>(null);
  const placeContextMenuHandlerRef = useRef<
    ((placeId: string, type: PlaceType, x: number, y: number) => void) | null
  >(null);
  const placeClickHandlerRef = useRef<
    ((placeId: string, type: PlaceType) => void) | null
  >(null);
  const polygonAreaIdsRef = useRef<ReadonlyMap<string, string> | null>(null);
  const callbacksRef = useRef({
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  });
  callbacksRef.current = {
    onMapClick,
    onPolygonClick,
    onPolygonDoubleClick,
    onContextMenu,
    onVertexHover,
    onEdgeHover,
    onPolygonHover,
  };

  useImperativeHandle(ref, () => ({
    applyChangeSet(cs) {
      rendererRef.current?.applyChangeSet(cs);
    },
    renderAll(linkedPolygonIds) {
      rendererRef.current?.renderAll(linkedPolygonIds);
    },
    setEditor(editor) {
      appliedEditorRef.current = editor;
      rendererRef.current?.setEditor(editor);
    },
    setCursor(cursor) {
      rendererRef.current?.setCursor(cursor);
    },
    highlightPolygon(id) {
      rendererRef.current?.highlightPolygon(id);
    },
    focusPolygon(id) {
      rendererRef.current?.focusPolygon(id);
    },
    focusPolygons(ids) {
      rendererRef.current?.focusPolygons(ids);
    },
    setLinkedPolygonIds(ids) {
      rendererRef.current?.setLinkedPolygonIds(ids);
    },
    setPolygonAreaIds(ids) {
      polygonAreaIdsRef.current = ids;
      rendererRef.current?.setPolygonAreaIds(ids);
    },
    enableRubberBand() {
      rendererRef.current?.enableRubberBand();
    },
    disableRubberBand() {
      rendererRef.current?.disableRubberBand();
    },
    setRubberBandOrigin(vertexId) {
      rendererRef.current?.setRubberBandOrigin(vertexId);
    },
    enableVertexDrag(callbacks) {
      rendererRef.current?.enableVertexDrag(callbacks);
    },
    disableVertexDrag() {
      rendererRef.current?.disableVertexDrag();
    },
    showVertices() {
      rendererRef.current?.showVertices();
    },
    hideVertices() {
      rendererRef.current?.hideVertices();
    },
    pixelsToDegrees(px) {
      return rendererRef.current?.pixelsToDegrees(px) ?? 0.001;
    },
    getSnapThresholdPx() {
      return rendererRef.current?.getSnapThresholdPx() ?? 20;
    },
    setDetailMode(targetIds, neighborIds) {
      rendererRef.current?.setDetailMode(targetIds, neighborIds);
    },
    clearDetailMode() {
      rendererRef.current?.clearDetailMode();
    },
    setPlaces(places) {
      rendererRef.current?.setPlaces(places);
    },
    clearPlaces() {
      rendererRef.current?.clearPlaces();
    },
    setMinZoom(zoom) {
      rendererRef.current?.setMinZoom(zoom);
    },
    clearMinZoom() {
      rendererRef.current?.clearMinZoom();
    },
    setPlaceContextMenuHandler(cb) {
      placeContextMenuHandlerRef.current = cb;
      rendererRef.current?.setPlaceContextMenuHandler(cb);
    },
    setPlaceClickHandler(cb) {
      placeClickHandlerRef.current = cb;
      rendererRef.current?.setPlaceClickHandler(cb);
    },
    startPlaceMove(placeId, onConfirm, onCancel) {
      rendererRef.current?.startPlaceMove(placeId, onConfirm, onCancel);
    },
    cancelPlaceMove() {
      rendererRef.current?.cancelPlaceMove();
    },
    isPlaceMoving() {
      return rendererRef.current?.isPlaceMoving() ?? false;
    },
    focusPlace(lat, lng) {
      rendererRef.current?.focusPlace(lat, lng);
    },
    invalidateSize() {
      rendererRef.current?.invalidateSize();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapRenderer();
    renderer.mount(
      containerRef.current,
      {
        onMapClick: (lat, lng) => callbacksRef.current.onMapClick?.(lat, lng),
        onPolygonClick: (id) => callbacksRef.current.onPolygonClick?.(id),
        onPolygonDoubleClick: (id) =>
          callbacksRef.current.onPolygonDoubleClick?.(id),
        onContextMenu: (lat, lng, cx, cy) =>
          callbacksRef.current.onContextMenu?.(lat, lng, cx, cy),
        onVertexHover: (id) => callbacksRef.current.onVertexHover?.(id),
        onEdgeHover: (id) => callbacksRef.current.onEdgeHover?.(id),
        onPolygonHover: (id) => callbacksRef.current.onPolygonHover?.(id),
      },
      // ベース地図プロバイダは環境変数（サービス全体設定）から解決し、
      // Google のときだけ地図/航空写真トグルのラベルを渡す。
      { ...resolveBaseMapConfig(), googleTypeLabels: baseMapLabelsRef.current },
    );
    rendererRef.current = renderer;
    // 再マウントで renderer が作り直された場合に備え、保持済みの editor と
    // ハンドラを新しい renderer へ再適用する（前回 renderer への設定は消えている）。
    if (appliedEditorRef.current) {
      renderer.setEditor(appliedEditorRef.current);
    }
    if (placeContextMenuHandlerRef.current) {
      renderer.setPlaceContextMenuHandler(placeContextMenuHandlerRef.current);
    }
    if (placeClickHandlerRef.current) {
      renderer.setPlaceClickHandler(placeClickHandlerRef.current);
    }
    if (polygonAreaIdsRef.current) {
      renderer.setPolygonAreaIds(polygonAreaIdsRef.current);
    }
    return () => {
      renderer.unmount();
      rendererRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
});

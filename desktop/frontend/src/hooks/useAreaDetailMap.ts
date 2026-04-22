import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { NetworkPolygonEditor, PolygonID } from "map-polygon-editor";
import type { MapViewHandle } from "../components/MapView";
import type { Place } from "../services/place-service";
import type { PlaceType } from "../lib/map-renderer";
import {
  buildAreaDetailViewModel,
  polygonCentersFromEditor,
  type PolygonGeoSource,
} from "../lib/area-detail-controller";
import { applyDetailViewModelToMap } from "../lib/area-detail-map-integration";
import { pointInRing } from "../lib/area-detail-geo";
import {
  assignInitialSortOrder,
  needsInitialAssignment,
} from "../lib/place-sort-order";

export interface UseAreaDetailMapPlaceService {
  listPlaces: (areaId: string) => Promise<Place[]>;
  savePlace?: (place: Place) => Promise<Place>;
}

export interface UseAreaDetailMapSettingsService {
  getAreaDetailRadiusKm: () => Promise<number>;
}

export interface UseAreaDetailMapOptions {
  mapRef: MutableRefObject<MapViewHandle | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  editor: NetworkPolygonEditor | PolygonGeoSource | undefined;
  polygonToArea: ReadonlyMap<string, string> | undefined;
  areaId: string;
  placeService?: UseAreaDetailMapPlaceService;
  settingsService?: UseAreaDetailMapSettingsService;
  linkedPolygonIds?: Set<string>;
  selectedPlaceId?: string | null;
  refreshKey?: number;
  /** マーカー tooltip / フォールバック表示用 ("名前なし" 等) */
  noNameLabel: string;
  /**
   * area-level 場所の sortOrder が全て 0 のとき CreatedAt 昇順で採番して
   * placeService.savePlace で書き戻す。AreaDetailEditPage 互換のため。
   */
  enableInitialSortAssignment?: boolean;
}

export interface UseAreaDetailMapResult {
  /** parentId === "" の場所 (house / building) */
  places: Place[];
  /** type === "room" の場所 */
  rooms: Place[];
  setPlaces: Dispatch<SetStateAction<Place[]>>;
  setRooms: Dispatch<SetStateAction<Place[]>>;
  /** 対象区域ポリゴンの内側にあるかを判定。ring 未取得時は true。 */
  isInsideTarget: (lat: number, lng: number) => boolean;
}

export function useAreaDetailMap({
  mapRef,
  containerRef,
  editor,
  polygonToArea,
  areaId,
  placeService,
  settingsService,
  linkedPolygonIds,
  selectedPlaceId = null,
  refreshKey = 0,
  noNameLabel,
  enableInitialSortAssignment = false,
}: UseAreaDetailMapOptions): UseAreaDetailMapResult {
  const [places, setPlaces] = useState<Place[]>([]);
  const [rooms, setRooms] = useState<Place[]>([]);
  const targetRingRef = useRef<[number, number][] | null>(null);
  const viewportInitializedRef = useRef(false);
  const initialSortAssignedRef = useRef(false);

  useEffect(() => {
    if (!editor || !polygonToArea) return;
    const handle = mapRef.current;
    if (!handle) return;
    let cancelled = false;

    const run = async () => {
      handle.setEditor(editor as NetworkPolygonEditor);
      const centers = polygonCentersFromEditor(editor);
      const radiusKm =
        (await settingsService?.getAreaDetailRadiusKm().catch(() => 2.5)) ??
        2.5;
      const all = placeService
        ? await placeService.listPlaces(areaId).catch(() => [])
        : [];
      if (cancelled) return;

      let areaPlaces = all.filter((p) => !p.parentId);
      const loadedRooms = all.filter((p) => p.type === "room");

      if (
        enableInitialSortAssignment &&
        placeService?.savePlace &&
        !initialSortAssignedRef.current &&
        needsInitialAssignment(areaPlaces)
      ) {
        const assigned = assignInitialSortOrder(areaPlaces);
        try {
          for (const p of assigned) {
            await placeService.savePlace(p);
          }
          areaPlaces = assigned;
          initialSortAssignedRef.current = true;
        } catch (err) {
          console.error(
            "[useAreaDetailMap] initial sortOrder save failed:",
            err,
          );
        }
      }
      if (cancelled) return;
      setPlaces(areaPlaces);
      setRooms(loadedRooms);

      const viewportPx = containerRef.current?.clientWidth || 800;
      const vm = buildAreaDetailViewModel({
        polygonCenters: centers,
        polygonToArea,
        targetAreaId: areaId,
        places: areaPlaces.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          deletedAt: p.deletedAt ?? null,
        })),
        radiusKm,
        viewportPx,
      });
      if (!vm || cancelled) return;

      const targetGeo =
        "getPolygonGeoJSON" in editor
          ? editor.getPolygonGeoJSON(vm.targetPolygonId as PolygonID)
          : null;
      targetRingRef.current =
        targetGeo && targetGeo.coordinates[0]
          ? (targetGeo.coordinates[0] as [number, number][])
          : null;

      const linked = linkedPolygonIds ?? new Set<string>();
      const sortedForMap = [...areaPlaces].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const indexById = new Map<string, number>();
      sortedForMap.forEach((p, idx) => indexById.set(p.id, idx));

      const skipFocus = viewportInitializedRef.current;
      applyDetailViewModelToMap(
        handle,
        vm,
        areaPlaces.map((p) => {
          const parts = [p.label.trim(), p.address.trim()].filter(Boolean);
          return {
            id: p.id,
            lat: p.coord.lat,
            lng: p.coord.lng,
            type: p.type as PlaceType,
            tooltip: parts.length > 0 ? parts.join(" / ") : noNameLabel,
            index: indexById.get(p.id),
            selected: p.id === selectedPlaceId,
          };
        }),
        linked,
        skipFocus,
      );
      viewportInitializedRef.current = true;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    mapRef,
    containerRef,
    editor,
    polygonToArea,
    areaId,
    placeService,
    settingsService,
    linkedPolygonIds,
    selectedPlaceId,
    refreshKey,
    noNameLabel,
    enableInitialSortAssignment,
  ]);

  const isInsideTarget = useCallback(
    (lat: number, lng: number): boolean => {
      const ring = targetRingRef.current;
      if (!ring) return true;
      return pointInRing({ lat, lng }, ring);
    },
    [],
  );

  return { places, rooms, setPlaces, setRooms, isInsideTarget };
}

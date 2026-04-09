import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { RegionService } from "../services/region-service";
import type { PlaceService, PlaceType } from "../services/place-service";
import type { SettingsService } from "../services/settings-service";
import { MapView, type MapViewHandle } from "../components/MapView";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { formatAreaLabel } from "../lib/area-detail-geo";
import {
  buildAreaDetailViewModel,
  polygonCentersFromEditor,
  type PolygonGeoSource,
} from "../lib/area-detail-controller";
import { applyDetailViewModelToMap } from "../lib/area-detail-map-integration";
import type { NetworkPolygonEditor } from "map-polygon-editor";

export interface AreaDetailEditPageProps {
  /** テスト用に注入可能。未指定なら本番 RegionBinding を使う。 */
  regionService?: RegionService;
  /** 未指定ならプレースホルダ div のみ描画 (テスト経路)。 */
  editor?: NetworkPolygonEditor | PolygonGeoSource;
  /** polygonId → areaId の紐付け表。editor 指定時に必須。 */
  polygonToArea?: ReadonlyMap<string, string>;
  /** 対象区域の場所取得。未指定なら場所は描画しない。 */
  placeService?: PlaceService;
  /** ui.areaDetailRadiusKm の取得。未指定なら既定 5km。 */
  settingsService?: SettingsService;
  /** 初期リンク済みポリゴン ID 集合 (renderAll 用)。 */
  linkedPolygonIds?: Set<string>;
}

export function AreaDetailEditPage({
  regionService,
  editor,
  polygonToArea,
  placeService,
  settingsService,
  linkedPolygonIds,
}: AreaDetailEditPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { areaId = "" } = useParams<{ areaId: string }>();
  const service = useMemo(
    () => regionService ?? new RegionService(RegionBinding),
    [regionService],
  );
  const [label, setLabel] = useState<string | null>(null);
  const mapRef = useRef<MapViewHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    service.loadTree().then((tree) => {
      if (cancelled) return;
      setLabel(formatAreaLabel(tree, areaId));
    });
    return () => {
      cancelled = true;
    };
  }, [service, areaId]);

  // --- 地図への ViewModel 適用 (editor 提供時のみ) ---
  useEffect(() => {
    if (!editor || !polygonToArea) return;
    const handle = mapRef.current;
    if (!handle) return;
    let cancelled = false;

    const run = async () => {
      handle.setEditor(editor as NetworkPolygonEditor);
      const centers = polygonCentersFromEditor(editor);
      const radiusKm =
        (await settingsService?.getAreaDetailRadiusKm().catch(() => 5)) ?? 5;
      const places = placeService
        ? await placeService.listPlaces(areaId).catch(() => [])
        : [];
      if (cancelled) return;
      const viewportPx = containerRef.current?.clientWidth || 800;
      const vm = buildAreaDetailViewModel({
        polygonCenters: centers,
        polygonToArea,
        targetAreaId: areaId,
        places: places.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          deletedAt: p.deletedAt ?? null,
        })),
        radiusKm,
        viewportPx,
      });
      if (!vm || cancelled) return;
      const linked = linkedPolygonIds ?? new Set<string>();
      applyDetailViewModelToMap(
        handle,
        vm,
        places.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          type: p.type as PlaceType,
        })),
        linked,
      );
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [editor, polygonToArea, placeService, settingsService, areaId, linkedPolygonIds]);

  const mapEnabled = Boolean(editor && polygonToArea);

  return (
    <div className="area-detail-edit-page">
      <div className="area-detail-topbar">
        <button
          className="area-detail-back-btn"
          onClick={() => navigate(-1)}
          aria-label={t.areaDetail.back}
        >
          ← {t.areaDetail.back}
        </button>
        <span className="area-detail-label">{label ?? t.areaDetail.title}</span>
      </div>
      <div
        ref={containerRef}
        className="area-detail-map"
        data-testid="area-detail-map"
      >
        {mapEnabled && <MapView ref={mapRef} />}
      </div>
    </div>
  );
}

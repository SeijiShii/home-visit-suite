import { useEffect, useMemo, useState } from "react";
import { VisitPage } from "./VisitPage";
import { PlaceService, type PlaceBindingAPI } from "../services/place-service";
import { VisitService, type VisitBindingAPI } from "../services/visit-service";
import { RegionService } from "../services/region-service";
import { SettingsService } from "../services/settings-service";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { buildPolygonAreaMap } from "../services/polygon-service";
import * as PlaceBinding from "../../wailsjs/go/binding/PlaceBinding";
import * as VisitBinding from "../../wailsjs/go/binding/VisitBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import * as SettingsBinding from "../../wailsjs/go/binding/SettingsBinding";

/**
 * Phase 1 暫定: チェックアウトモデル未設計のため
 * ポリゴン紐付け済みの NRT-001-01 へ固定遷移する。
 * 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録画面」
 */
const PHASE1_AREA_ID = "NRT-001-01";

export function VisitPageContainer() {
  const placeService = useMemo(
    () => new PlaceService(PlaceBinding as unknown as PlaceBindingAPI),
    [],
  );
  const visitService = useMemo(
    () => new VisitService(VisitBinding as unknown as VisitBindingAPI),
    [],
  );
  const regionService = useMemo(() => new RegionService(RegionBinding), []);
  const settingsService = useMemo(
    () => new SettingsService(SettingsBinding),
    [],
  );
  const regionAPI = useMemo(
    () => ({
      BindPolygonToArea: RegionBinding.BindPolygonToArea,
      UnbindPolygonFromArea: RegionBinding.UnbindPolygonFromArea,
      RemapPolygonIds: RegionBinding.RemapPolygonIds,
    }),
    [],
  );
  const { editor, ready } = usePolygonEditor(MapBinding, regionAPI);
  const [polygonToArea, setPolygonToArea] = useState<Map<string, string>>(
    new Map(),
  );
  const [linkedPolygonIds, setLinkedPolygonIds] = useState<Set<string>>(
    new Set(),
  );
  const [treeLoaded, setTreeLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    regionService.loadTree().then((tree) => {
      if (cancelled) return;
      const areaMap = buildPolygonAreaMap(tree);
      const m = new Map<string, string>();
      for (const [polyId, info] of areaMap) m.set(polyId, info.areaId);
      setPolygonToArea(m);
      setLinkedPolygonIds(new Set(m.keys()));
      setTreeLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [regionService]);

  // TODO: 自分の DID を SettingsService 等から取得する。
  // 現状は空文字（バックエンド側で actor 検証は未実装のため動作はする）。
  const actorId = "";

  // editor / loadTree (polygonToArea) は独立した非同期処理。
  // どちらかが先に解決すると hook 内 useEffect が空の polygonToArea で
  // 1 回目を実行し、buildAreaDetailViewModel が null を返して地図セットアップが
  // スキップされる。両方揃ってから渡すことで初回ロード時の地図未描画を防ぐ。
  const dataReady = ready && editor && treeLoaded;

  return (
    <VisitPage
      areaId={PHASE1_AREA_ID}
      actorId={actorId}
      placeService={placeService}
      visitService={visitService}
      editor={dataReady ? editor : undefined}
      polygonToArea={dataReady ? polygonToArea : undefined}
      linkedPolygonIds={dataReady ? linkedPolygonIds : undefined}
      settingsService={settingsService}
      onPlaceCreateRequest={(args) => {
        console.log("[VisitPage] place create request:", args);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
      onPlaceModifyRequest={(placeId, text) => {
        console.log("[VisitPage] place modify request:", placeId, text);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
    />
  );
}

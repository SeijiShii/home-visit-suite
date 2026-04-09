import { useEffect, useMemo, useState } from "react";
import { AreaDetailEditPage } from "./AreaDetailEditPage";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { RegionService } from "../services/region-service";
import { PlaceService, type PlaceBindingAPI } from "../services/place-service";
import { SettingsService } from "../services/settings-service";
import { buildPolygonAreaMap } from "../services/polygon-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import * as PlaceBinding from "../../wailsjs/go/binding/PlaceBinding";
import * as SettingsBinding from "../../wailsjs/go/binding/SettingsBinding";

/**
 * 本番依存 (Wails バインディング、usePolygonEditor) を組み立てて
 * AreaDetailEditPage に渡すラッパ。
 */
export function AreaDetailEditPageContainer() {
  const regionService = useMemo(() => new RegionService(RegionBinding), []);
  const placeService = useMemo(
    () => new PlaceService(PlaceBinding as unknown as PlaceBindingAPI),
    [],
  );
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

  useEffect(() => {
    let cancelled = false;
    regionService.loadTree().then((tree) => {
      if (cancelled) return;
      const areaMap = buildPolygonAreaMap(tree); // polygonId -> { areaId }
      const m = new Map<string, string>();
      for (const [polyId, info] of areaMap) m.set(polyId, info.areaId);
      setPolygonToArea(m);
      setLinkedPolygonIds(new Set(m.keys()));
    });
    return () => {
      cancelled = true;
    };
  }, [regionService]);

  if (!ready || !editor) {
    return (
      <AreaDetailEditPage
        regionService={regionService}
        placeService={placeService}
        settingsService={settingsService}
      />
    );
  }
  return (
    <AreaDetailEditPage
      regionService={regionService}
      editor={editor}
      polygonToArea={polygonToArea}
      placeService={placeService}
      settingsService={settingsService}
      linkedPolygonIds={linkedPolygonIds}
    />
  );
}

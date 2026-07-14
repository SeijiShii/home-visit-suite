// desktop/frontend/src/pages/AreaDetailEditPageContainer.tsx からの移植。
// Wails バインディングを useServices() のアダプタに置き換えた。

import { useEffect, useMemo, useState } from "react";
import { AreaDetailEditPage } from "./AreaDetailEditPage";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useServices } from "../contexts/ServicesContext";
import { RegionService } from "../services/region-service";
import { buildPolygonAreaMap } from "../services/polygon-service";

/**
 * 依存（サービス・アダプタ、usePolygonEditor）を組み立てて
 * AreaDetailEditPage に渡すラッパ。
 */
export function AreaDetailEditPageContainer() {
  const { regionBindingApi, mapBinding, placeService, settingsService } =
    useServices();
  const regionService = useMemo(
    () => new RegionService(regionBindingApi),
    [regionBindingApi],
  );
  const { editor, ready } = usePolygonEditor(mapBinding, regionBindingApi);
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

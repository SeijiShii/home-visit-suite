import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { RegionService } from "../services/region-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { formatAreaLabel } from "../lib/area-detail-geo";

export interface AreaDetailEditPageProps {
  /** テスト用に注入可能。未指定なら本番 RegionBinding を使う。 */
  regionService?: RegionService;
}

export function AreaDetailEditPage({ regionService }: AreaDetailEditPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { areaId = "" } = useParams<{ areaId: string }>();
  const service = useMemo(
    () => regionService ?? new RegionService(RegionBinding),
    [regionService],
  );
  const [label, setLabel] = useState<string | null>(null);

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
      <div className="area-detail-map" data-testid="area-detail-map" />
    </div>
  );
}

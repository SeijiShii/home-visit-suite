import { useI18n } from "../contexts/I18nContext";

export function PolygonList() {
  const { t } = useI18n();

  return (
    <div className="polygon-list">
      <div className="polygon-list-body">
        <p className="polygon-list-empty">{t.common.noData}</p>
      </div>
    </div>
  );
}

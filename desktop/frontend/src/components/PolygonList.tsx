import { useI18n } from "../contexts/I18nContext";
import type { MapPolygon, PolygonID } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

interface PolygonListProps {
  polygons: MapPolygon[];
  polygonAreaMap: Map<string, PolygonAreaInfo>;
  selectedPolygonId: PolygonID | null;
  onPolygonClick: (id: PolygonID) => void;
}

export function PolygonList({
  polygons,
  polygonAreaMap,
  selectedPolygonId,
  onPolygonClick,
}: PolygonListProps) {
  const { t } = useI18n();

  if (polygons.length === 0) {
    return (
      <div className="polygon-list">
        <div className="polygon-list-body">
          <p className="polygon-list-empty">{t.common.noData}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="polygon-list">
      <div className="polygon-list-body">
        {polygons.map((poly) => {
          const areaInfo = polygonAreaMap.get(poly.id as string);
          const isSelected = selectedPolygonId === poly.id;
          return (
            <div
              key={poly.id as string}
              className={`polygon-list-item${isSelected ? " polygon-list-item-selected" : ""}`}
              onClick={() => onPolygonClick(poly.id)}
            >
              {areaInfo ? areaInfo.areaLabel : t.map.noArea}
            </div>
          );
        })}
      </div>
    </div>
  );
}

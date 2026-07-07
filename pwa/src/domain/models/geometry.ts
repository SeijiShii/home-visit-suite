// 参照実装: shared/domain/models/geometry.go

/** 地理座標。 */
export interface Coordinate {
  lat: number;
  lng: number;
}

/**
 * GeoJSON Polygon ジオメトリ。
 * coordinates は [リング][頂点][lng, lat] の3次元配列。
 * 最初のリングが外周、以降は穴（ホール）を表す。
 */
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

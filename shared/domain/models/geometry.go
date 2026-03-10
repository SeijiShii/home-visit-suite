package models

// Coordinate は地理座標を表す。
type Coordinate struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// GeoJSONPolygon はGeoJSON Polygonジオメトリを表す。
// coordinates は [リング][頂点][lng, lat] の3次元配列。
// 最初のリングが外周、以降は穴（ホール）を表す。
type GeoJSONPolygon struct {
	Type        string       `json:"type"`        // "Polygon"
	Coordinates [][][2]float64 `json:"coordinates"` // [ring][point][lng,lat]
}

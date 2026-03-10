package domain

// PlaceType は場所の種別を表す。
type PlaceType string

const (
	PlaceTypeHouse     PlaceType = "house"     // 戸建て
	PlaceTypeBuilding  PlaceType = "building"  // 集合住宅
	PlaceTypeRoom      PlaceType = "room"      // 部屋
)

// Coordinate は地理座標を表す。
type Coordinate struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Place は座標と紐づく「場所」モデル。
type Place struct {
	ID         string     `json:"id"`
	AreaID     string     `json:"areaId"`
	Coord      Coordinate `json:"coord"`
	Type       PlaceType  `json:"type"`
	Label      string     `json:"label"`      // 表札名等
	ParentID   string     `json:"parentId"`   // 集合住宅の場合、親建物のID
	DoNotVisit bool       `json:"doNotVisit"` // 訪問不可フラグ
}

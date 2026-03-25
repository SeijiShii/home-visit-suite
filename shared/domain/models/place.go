package models

import "time"

// PlaceType は場所の種別を表す。
type PlaceType string

const (
	PlaceTypeHouse    PlaceType = "house"    // 戸建て
	PlaceTypeBuilding PlaceType = "building" // 集合住宅
	PlaceTypeRoom     PlaceType = "room"     // 部屋
)

// Place は座標と紐づく「場所」モデル。
type Place struct {
	ID             string     `json:"id"`             // UUID
	AreaID         string     `json:"areaId"`
	Coord          Coordinate `json:"coord"`
	Type           PlaceType  `json:"type"`
	Label          string     `json:"label"`          // 表札名等
	DisplayName    string     `json:"displayName"`    // 部屋番号等の表示名（文字列）
	ParentID       string     `json:"parentId"`       // 集合住宅の場合、親建物のID
	SortOrder      int        `json:"sortOrder"`      // 並び順（編集staff変更可）
	Languages      []string   `json:"languages"`      // ISO 639-1コード
	DoNotVisit     bool       `json:"doNotVisit"`     // 訪問不可フラグ
	DoNotVisitNote string     `json:"doNotVisitNote"` // 訪問不可理由
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

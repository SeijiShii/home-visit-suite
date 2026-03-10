// Package domain はホームビジットスイートのドメインモデルを定義する。
package domain

// Region は活動領域を表す（例: 成田市）。
type Region struct {
	ID       string `json:"id"`
	Name     string `json:"name"`     // 成田市
	Symbol   string `json:"symbol"`   // NRT（2~4文字の英大文字）
	Approved bool   `json:"approved"` // 管理者による承認済みか
}

// ParentArea は区域親番を表す（例: 加良部1丁目）。
// 識別子体系: 領域-区域親番-区域（例: NRT-001-05）
type ParentArea struct {
	ID       string `json:"id"`
	RegionID string `json:"regionId"`
	Number   string `json:"number"` // "001"
	Name     string `json:"name"`   // 加良部1丁目
}

// Area は区域（運用上の最小単位）を表す。
// 1つの区域は50~100件程度の訪問先を含む。
type Area struct {
	ID           string `json:"id"`
	ParentAreaID string `json:"parentAreaId"`
	Number       string `json:"number"` // "05"
}

// AreaIdentifier は区域の完全識別子を組み立てる。
// 例: NRT-001-05
func AreaIdentifier(regionSymbol, parentNumber, areaNumber string) string {
	return regionSymbol + "-" + parentNumber + "-" + areaNumber
}

// AreaDisplayLabel は表示用ラベルを組み立てる。
// 例: NRT-001-05　加良部1丁目
func AreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName string) string {
	return AreaIdentifier(regionSymbol, parentNumber, areaNumber) + "　" + parentName
}

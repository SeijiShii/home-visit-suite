package binding

// MapBinding は地図操作のフロントエンド向けAPI。
// ポリゴンデータの読み書きを担当し、描画自体はフロントエンドのmap-polygon-editorが行う。
type MapBinding struct{}

func NewMapBinding() *MapBinding {
	return &MapBinding{}
}

// GetPolygonsForRegion は領域内の全ポリゴンデータをGeoJSON形式で返す。
func (b *MapBinding) GetPolygonsForRegion(regionID string) (string, error) {
	// TODO: LinkSelfからポリゴンデータ取得、GeoJSON変換
	return "{}", nil
}

// SavePolygon はポリゴンデータを保存する。
func (b *MapBinding) SavePolygon(areaID string, geoJSON string) error {
	// TODO: バリデーション + LinkSelfに保存
	return nil
}

package binding

// MapBinding はmap-polygon-editorのStorageAdapter向けAPI。
// フロントエンドのWailsStorageAdapterから呼ばれる。
type MapBinding struct {
	// TODO: LinkSelfクライアントを持つ
	polygonsJSON string
	groupsJSON   string
	draftsJSON   string
}

func NewMapBinding() *MapBinding {
	return &MapBinding{
		polygonsJSON: "[]",
		groupsJSON:   "[]",
		draftsJSON:   "[]",
	}
}

// GetPolygonsJSON は全ポリゴンをJSON配列で返す。
func (b *MapBinding) GetPolygonsJSON() (string, error) {
	// TODO: LinkSelfからデータ取得
	return b.polygonsJSON, nil
}

// GetGroupsJSON は全グループをJSON配列で返す。
func (b *MapBinding) GetGroupsJSON() (string, error) {
	return b.groupsJSON, nil
}

// GetDraftsJSON は全下書きをJSON配列で返す。
func (b *MapBinding) GetDraftsJSON() (string, error) {
	return b.draftsJSON, nil
}

// BatchWrite はChangeSetをJSON文字列で受け取り、一括書き込みする。
func (b *MapBinding) BatchWrite(changesJSON string) error {
	// TODO: JSONパース → LinkSelfに保存
	// 暫定: メモリに保持するだけ（LinkSelf統合まで）
	return nil
}

// SaveDraft は下書きをJSON文字列で受け取り保存する。
func (b *MapBinding) SaveDraft(draftJSON string) error {
	// TODO: LinkSelfに保存
	return nil
}

// DeleteDraft は下書きを削除する。
func (b *MapBinding) DeleteDraft(id string) error {
	// TODO: LinkSelfから削除
	return nil
}

package binding

import "encoding/json"

// MapBinding はmap-polygon-editorのStorageAdapter向けAPI。
// フロントエンドのWailsStorageAdapterから呼ばれる。
// 暫定実装: インメモリ。将来はLinkSelfに差し替え。
type MapBinding struct {
	polygons []json.RawMessage
	groups   []json.RawMessage
	drafts   map[string]json.RawMessage
}

func NewMapBinding() *MapBinding {
	return &MapBinding{
		polygons: []json.RawMessage{},
		groups:   []json.RawMessage{},
		drafts:   make(map[string]json.RawMessage),
	}
}

// GetPolygonsJSON は全ポリゴンをJSON配列で返す。
func (b *MapBinding) GetPolygonsJSON() (string, error) {
	data, err := json.Marshal(b.polygons)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// GetGroupsJSON は全グループをJSON配列で返す。
func (b *MapBinding) GetGroupsJSON() (string, error) {
	data, err := json.Marshal(b.groups)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// GetDraftsJSON は全下書きをJSON配列で返す。
func (b *MapBinding) GetDraftsJSON() (string, error) {
	result := make([]json.RawMessage, 0, len(b.drafts))
	for _, d := range b.drafts {
		result = append(result, d)
	}
	data, err := json.Marshal(result)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// changeSet はmap-polygon-editorのChangeSet構造。
type changeSet struct {
	CreatedPolygons  []json.RawMessage `json:"createdPolygons"`
	DeletedPolygonIds []string          `json:"deletedPolygonIds"`
	ModifiedPolygons []json.RawMessage `json:"modifiedPolygons"`
	CreatedGroups    []json.RawMessage `json:"createdGroups"`
	DeletedGroupIds  []string          `json:"deletedGroupIds"`
	ModifiedGroups   []json.RawMessage `json:"modifiedGroups"`
}

// BatchWrite はChangeSetをJSON文字列で受け取り、インメモリで一括書き込みする。
func (b *MapBinding) BatchWrite(changesJSON string) error {
	var cs changeSet
	if err := json.Unmarshal([]byte(changesJSON), &cs); err != nil {
		return err
	}

	// ポリゴン: 削除
	for _, delID := range cs.DeletedPolygonIds {
		b.polygons = removeByID(b.polygons, delID)
	}
	// ポリゴン: 更新
	for _, mod := range cs.ModifiedPolygons {
		id := extractID(mod)
		b.polygons = removeByID(b.polygons, id)
		b.polygons = append(b.polygons, mod)
	}
	// ポリゴン: 追加
	b.polygons = append(b.polygons, cs.CreatedPolygons...)

	// グループ: 削除
	for _, delID := range cs.DeletedGroupIds {
		b.groups = removeByID(b.groups, delID)
	}
	// グループ: 更新
	for _, mod := range cs.ModifiedGroups {
		id := extractID(mod)
		b.groups = removeByID(b.groups, id)
		b.groups = append(b.groups, mod)
	}
	// グループ: 追加
	b.groups = append(b.groups, cs.CreatedGroups...)

	return nil
}

// SaveDraft は下書きをJSON文字列で受け取り保存する。
func (b *MapBinding) SaveDraft(draftJSON string) error {
	id := extractID(json.RawMessage(draftJSON))
	if id == "" {
		return nil
	}
	b.drafts[id] = json.RawMessage(draftJSON)
	return nil
}

// DeleteDraft は下書きを削除する。
func (b *MapBinding) DeleteDraft(id string) error {
	delete(b.drafts, id)
	return nil
}

// extractID はJSONオブジェクトからidフィールドを抽出する。
func extractID(raw json.RawMessage) string {
	var obj struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ""
	}
	return obj.ID
}

// removeByID はJSON配列からidが一致する要素を除去する。
func removeByID(items []json.RawMessage, id string) []json.RawMessage {
	result := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		if extractID(item) != id {
			result = append(result, item)
		}
	}
	return result
}

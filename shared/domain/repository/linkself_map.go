package repository

// LinkSelfMapRepo はmap-polygon-editorのネットワークJSONをLinkSelf MyDBに格納する。
type LinkSelfMapRepo struct{ *LinkSelfRepository }

const mapNetworkDefaultID = "default"
const emptyNetworkJSON = `{"vertices":[],"edges":[],"polygons":[]}`

// GetNetworkJSON はネットワークJSONを取得する。未保存時は空ネットワーク。
func (r *LinkSelfMapRepo) GetNetworkJSON() (string, error) {
	row := r.db.QueryRow(r.ctx,
		`SELECT data FROM map_network WHERE id = ?`, mapNetworkDefaultID)
	var data string
	if err := row.Scan(&data); err != nil {
		return emptyNetworkJSON, nil
	}
	return data, nil
}

// SaveNetworkJSON はネットワークJSONを保存する。
func (r *LinkSelfMapRepo) SaveNetworkJSON(jsonData string) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO map_network (id, data) VALUES (?, ?)`,
		mapNetworkDefaultID, jsonData)
	return err
}

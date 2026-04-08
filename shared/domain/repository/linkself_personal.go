package repository

import (
	"encoding/json"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfPersonalRepo はLinkSelf MyDBを使ったPersonalRepository実装。
// ScopeDeviceで同期されるため、自デバイス間のみの同期となる。
type LinkSelfPersonalRepo struct{ *LinkSelfRepository }

// --- PersonalNote ---

func (r *LinkSelfPersonalRepo) GetPersonalNote(visitRecordID string) (*models.PersonalNote, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, visit_record_id, note, created_at, updated_at
		 FROM personal_notes WHERE visit_record_id = ?`, visitRecordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}
	var n models.PersonalNote
	var createdAt, updatedAt string
	if err := rows.Scan(&n.ID, &n.VisitRecordID, &n.Note, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	n.CreatedAt = parseTime(createdAt)
	n.UpdatedAt = parseTime(updatedAt)
	return &n, nil
}

func (r *LinkSelfPersonalRepo) SavePersonalNote(note *models.PersonalNote) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO personal_notes (id, visit_record_id, note, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`,
		note.ID, note.VisitRecordID, note.Note,
		formatTime(note.CreatedAt), formatTime(note.UpdatedAt))
	return err
}

func (r *LinkSelfPersonalRepo) DeletePersonalNote(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM personal_notes WHERE id = ?`, id)
	return err
}

// --- PersonalTag ---

func (r *LinkSelfPersonalRepo) ListPersonalTags() ([]models.PersonalTag, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name FROM personal_tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.PersonalTag
	for rows.Next() {
		var t models.PersonalTag
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, nil
}

func (r *LinkSelfPersonalRepo) SavePersonalTag(tag *models.PersonalTag) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO personal_tags (id, name) VALUES (?, ?)`,
		tag.ID, tag.Name)
	return err
}

func (r *LinkSelfPersonalRepo) DeletePersonalTag(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM personal_tags WHERE id = ?`, id)
	return err
}

// --- PersonalTagAssignment ---

func (r *LinkSelfPersonalRepo) ListPersonalTagAssignments(visitRecordID string) ([]models.PersonalTagAssignment, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, tag_id, visit_record_id
		 FROM personal_tag_assignments WHERE visit_record_id = ?`, visitRecordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.PersonalTagAssignment
	for rows.Next() {
		var a models.PersonalTagAssignment
		if err := rows.Scan(&a.ID, &a.TagID, &a.VisitRecordID); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, nil
}

func (r *LinkSelfPersonalRepo) SavePersonalTagAssignment(a *models.PersonalTagAssignment) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO personal_tag_assignments (id, tag_id, visit_record_id) VALUES (?, ?, ?)`,
		a.ID, a.TagID, a.VisitRecordID)
	return err
}

func (r *LinkSelfPersonalRepo) DeletePersonalTagAssignment(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM personal_tag_assignments WHERE id = ?`, id)
	return err
}

// --- AppSettings (key-value) ---

const (
	appSettingKeyHiddenTipKeys = "ui.hiddenTipKeys"
	appSettingKeyLocale        = "ui.locale"
)

func (r *LinkSelfPersonalRepo) getAppSetting(key string) (string, error) {
	rows, err := r.db.Query(r.ctx, `SELECT value FROM app_settings WHERE key = ?`, key)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	if !rows.Next() {
		return "", nil
	}
	var v string
	if err := rows.Scan(&v); err != nil {
		return "", err
	}
	return v, nil
}

func (r *LinkSelfPersonalRepo) setAppSetting(key, value string) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, key, value)
	return err
}

func (r *LinkSelfPersonalRepo) GetHiddenTipKeys() ([]string, error) {
	v, err := r.getAppSetting(appSettingKeyHiddenTipKeys)
	if err != nil {
		return nil, err
	}
	if v == "" {
		return []string{}, nil
	}
	var keys []string
	if err := json.Unmarshal([]byte(v), &keys); err != nil {
		return nil, err
	}
	return keys, nil
}

func (r *LinkSelfPersonalRepo) AddHiddenTipKey(key string) error {
	existing, err := r.GetHiddenTipKeys()
	if err != nil {
		return err
	}
	for _, k := range existing {
		if k == key {
			return nil
		}
	}
	existing = append(existing, key)
	b, err := json.Marshal(existing)
	if err != nil {
		return err
	}
	return r.setAppSetting(appSettingKeyHiddenTipKeys, string(b))
}

func (r *LinkSelfPersonalRepo) ClearHiddenTipKeys() error {
	return r.setAppSetting(appSettingKeyHiddenTipKeys, "[]")
}

func (r *LinkSelfPersonalRepo) GetLocale() (string, error) {
	return r.getAppSetting(appSettingKeyLocale)
}

func (r *LinkSelfPersonalRepo) SetLocale(locale string) error {
	return r.setAppSetting(appSettingKeyLocale, locale)
}


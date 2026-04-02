package repository

import (
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


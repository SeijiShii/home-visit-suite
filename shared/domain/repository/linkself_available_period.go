package repository

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// --- AvailablePeriod ---

func (r *LinkSelfCoverageRepo) ListAvailablePeriods() ([]models.AvailablePeriod, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, start_date, end_date, parent_area_ids, tag_ids, created_at, updated_at
		 FROM available_periods ORDER BY start_date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.AvailablePeriod
	for rows.Next() {
		p, err := scanAvailablePeriod(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) GetAvailablePeriod(id string) (*models.AvailablePeriod, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, start_date, end_date, parent_area_ids, tag_ids, created_at, updated_at
		 FROM available_periods WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("available period not found: %s", id)
	}
	p, err := scanAvailablePeriod(rows)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *LinkSelfCoverageRepo) GetActiveAvailablePeriod(now time.Time) (*models.AvailablePeriod, error) {
	all, err := r.ListAvailablePeriods()
	if err != nil {
		return nil, err
	}
	for _, p := range all {
		if p.IsActive(now) {
			copied := p
			return &copied, nil
		}
	}
	return nil, nil
}

func (r *LinkSelfCoverageRepo) SaveAvailablePeriod(p *models.AvailablePeriod) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO available_periods
		 (id, name, start_date, end_date, parent_area_ids, tag_ids, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, formatTime(p.StartDate), formatTime(p.EndDate),
		marshalJSON(p.ParentAreaIDs), marshalJSON(p.TagIDs),
		formatTime(p.CreatedAt), formatTime(p.UpdatedAt))
	return err
}

func (r *LinkSelfCoverageRepo) DeleteAvailablePeriod(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM available_periods WHERE id = ?`, id)
	return err
}

// --- AvailablePeriodTag ---

func (r *LinkSelfCoverageRepo) ListAvailablePeriodTags() ([]models.AvailablePeriodTag, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, color FROM available_period_tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.AvailablePeriodTag
	for rows.Next() {
		var t models.AvailablePeriodTag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) GetAvailablePeriodTag(id string) (*models.AvailablePeriodTag, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, color FROM available_period_tags WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("available period tag not found: %s", id)
	}
	var t models.AvailablePeriodTag
	if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *LinkSelfCoverageRepo) SaveAvailablePeriodTag(t *models.AvailablePeriodTag) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO available_period_tags (id, name, color) VALUES (?, ?, ?)`,
		t.ID, t.Name, t.Color)
	return err
}

func (r *LinkSelfCoverageRepo) DeleteAvailablePeriodTag(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM available_period_tags WHERE id = ?`, id)
	return err
}

// --- scan helpers ---

func scanAvailablePeriod(row scannable) (models.AvailablePeriod, error) {
	var p models.AvailablePeriod
	var parentAreasJSON, tagsJSON, startDate, endDate, createdAt, updatedAt string
	err := row.Scan(&p.ID, &p.Name, &startDate, &endDate,
		&parentAreasJSON, &tagsJSON, &createdAt, &updatedAt)
	if err != nil {
		return p, err
	}
	json.Unmarshal([]byte(parentAreasJSON), &p.ParentAreaIDs)
	json.Unmarshal([]byte(tagsJSON), &p.TagIDs)
	if p.ParentAreaIDs == nil {
		p.ParentAreaIDs = []string{}
	}
	if p.TagIDs == nil {
		p.TagIDs = []string{}
	}
	p.StartDate = parseTime(startDate)
	p.EndDate = parseTime(endDate)
	p.CreatedAt = parseTime(createdAt)
	p.UpdatedAt = parseTime(updatedAt)
	return p, nil
}

package repository

import (
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfCoverageRepo はLinkSelf MyDBを使ったCoverageRepository実装。
// SchedulePeriod / Scope / AreaAvailability は 2026-05-06 仕様改訂で全廃。
// 現行は Coverage と AvailablePeriod / AvailablePeriodTag のみ扱う。
type LinkSelfCoverageRepo struct{ *LinkSelfRepository }

// --- Coverage ---

func (r *LinkSelfCoverageRepo) ListCoverages(parentAreaID string) ([]models.Coverage, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, parent_area_id, status, actual_percent, status_percent, created_at, updated_at
		 FROM coverages WHERE parent_area_id = ? ORDER BY created_at`, parentAreaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Coverage
	for rows.Next() {
		c, err := scanCoverage(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) GetCoverage(id string) (*models.Coverage, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, parent_area_id, status, actual_percent, status_percent, created_at, updated_at
		 FROM coverages WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("coverage not found: %s", id)
	}
	c, err := scanCoverage(rows)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *LinkSelfCoverageRepo) SaveCoverage(c *models.Coverage) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO coverages
		 (id, parent_area_id, status, actual_percent, status_percent, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.ParentAreaID, string(c.Status), c.ActualPercent, c.StatusPercent,
		formatTime(c.CreatedAt), formatTime(c.UpdatedAt))
	return err
}

func (r *LinkSelfCoverageRepo) DeleteCoverage(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM coverages WHERE id = ?`, id)
	return err
}

// --- scan helpers ---

func scanCoverage(row scannable) (models.Coverage, error) {
	var c models.Coverage
	var status, createdAt, updatedAt string
	err := row.Scan(&c.ID, &c.ParentAreaID, &status, &c.ActualPercent, &c.StatusPercent,
		&createdAt, &updatedAt)
	if err != nil {
		return c, err
	}
	c.Status = models.CoverageStatus(status)
	c.CreatedAt = parseTime(createdAt)
	c.UpdatedAt = parseTime(updatedAt)
	return c, nil
}

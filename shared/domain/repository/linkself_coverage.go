package repository

import (
	"encoding/json"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfCoverageRepo はLinkSelf MyDBを使ったCoverageRepository実装。
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

// --- SchedulePeriod ---

func (r *LinkSelfCoverageRepo) ListSchedulePeriods() ([]models.SchedulePeriod, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, start_date, end_date, approved, created_at, updated_at
		 FROM schedule_periods ORDER BY start_date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.SchedulePeriod
	for rows.Next() {
		sp, err := scanSchedulePeriod(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, sp)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) GetSchedulePeriod(id string) (*models.SchedulePeriod, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, start_date, end_date, approved, created_at, updated_at
		 FROM schedule_periods WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("schedule period not found: %s", id)
	}
	sp, err := scanSchedulePeriod(rows)
	if err != nil {
		return nil, err
	}
	return &sp, nil
}

func (r *LinkSelfCoverageRepo) SaveSchedulePeriod(sp *models.SchedulePeriod) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO schedule_periods
		 (id, name, start_date, end_date, approved, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		sp.ID, sp.Name, formatTime(sp.StartDate), formatTime(sp.EndDate),
		boolToInt(sp.Approved), formatTime(sp.CreatedAt), formatTime(sp.UpdatedAt))
	return err
}

func (r *LinkSelfCoverageRepo) DeleteSchedulePeriod(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM schedule_periods WHERE id = ?`, id)
	return err
}

// --- Scope ---

func (r *LinkSelfCoverageRepo) ListScopes(schedulePeriodID string) ([]models.Scope, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, schedule_period_id, name, group_id, parent_area_ids, created_at, updated_at
		 FROM scopes WHERE schedule_period_id = ? ORDER BY name`, schedulePeriodID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Scope
	for rows.Next() {
		sc, err := scanScope(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, sc)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) ListAllScopes() ([]models.Scope, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, schedule_period_id, name, group_id, parent_area_ids, created_at, updated_at
		 FROM scopes ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Scope
	for rows.Next() {
		sc, err := scanScope(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, sc)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) GetScope(id string) (*models.Scope, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, schedule_period_id, name, group_id, parent_area_ids, created_at, updated_at
		 FROM scopes WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("scope not found: %s", id)
	}
	sc, err := scanScope(rows)
	if err != nil {
		return nil, err
	}
	return &sc, nil
}

func (r *LinkSelfCoverageRepo) SaveScope(sc *models.Scope) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO scopes
		 (id, schedule_period_id, name, group_id, parent_area_ids, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		sc.ID, sc.SchedulePeriodID, sc.Name, sc.GroupID,
		marshalJSON(sc.ParentAreaIDs), formatTime(sc.CreatedAt), formatTime(sc.UpdatedAt))
	return err
}

func (r *LinkSelfCoverageRepo) DeleteScope(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM scopes WHERE id = ?`, id)
	return err
}

// --- AreaAvailability ---

func (r *LinkSelfCoverageRepo) ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, scope_id, area_id, type, scope_group_id, start_date, end_date, set_by_id, created_at
		 FROM area_availability WHERE scope_id = ? ORDER BY start_date`, scopeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.AreaAvailability
	for rows.Next() {
		aa, err := scanAreaAvailability(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, aa)
	}
	return result, nil
}

func (r *LinkSelfCoverageRepo) SaveAreaAvailability(aa *models.AreaAvailability) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO area_availability
		 (id, scope_id, area_id, type, scope_group_id, start_date, end_date, set_by_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		aa.ID, aa.ScopeID, aa.AreaID, string(aa.Type), aa.ScopeGroupID,
		formatTime(aa.StartDate), formatTime(aa.EndDate), aa.SetByID, formatTime(aa.CreatedAt))
	return err
}

func (r *LinkSelfCoverageRepo) DeleteAreaAvailability(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM area_availability WHERE id = ?`, id)
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

func scanSchedulePeriod(row scannable) (models.SchedulePeriod, error) {
	var sp models.SchedulePeriod
	var approved int
	var startDate, endDate, createdAt, updatedAt string
	err := row.Scan(&sp.ID, &sp.Name, &startDate, &endDate, &approved, &createdAt, &updatedAt)
	if err != nil {
		return sp, err
	}
	sp.Approved = approved != 0
	sp.StartDate = parseTime(startDate)
	sp.EndDate = parseTime(endDate)
	sp.CreatedAt = parseTime(createdAt)
	sp.UpdatedAt = parseTime(updatedAt)
	return sp, nil
}

func scanScope(row scannable) (models.Scope, error) {
	var sc models.Scope
	var parentAreaIDsJSON, createdAt, updatedAt string
	err := row.Scan(&sc.ID, &sc.SchedulePeriodID, &sc.Name, &sc.GroupID,
		&parentAreaIDsJSON, &createdAt, &updatedAt)
	if err != nil {
		return sc, err
	}
	json.Unmarshal([]byte(parentAreaIDsJSON), &sc.ParentAreaIDs)
	if sc.ParentAreaIDs == nil {
		sc.ParentAreaIDs = []string{}
	}
	sc.CreatedAt = parseTime(createdAt)
	sc.UpdatedAt = parseTime(updatedAt)
	return sc, nil
}

func scanAreaAvailability(row scannable) (models.AreaAvailability, error) {
	var aa models.AreaAvailability
	var typeStr, startDate, endDate, createdAt string
	err := row.Scan(&aa.ID, &aa.ScopeID, &aa.AreaID, &typeStr, &aa.ScopeGroupID,
		&startDate, &endDate, &aa.SetByID, &createdAt)
	if err != nil {
		return aa, err
	}
	aa.Type = models.AvailabilityType(typeStr)
	aa.StartDate = parseTime(startDate)
	aa.EndDate = parseTime(endDate)
	aa.CreatedAt = parseTime(createdAt)
	return aa, nil
}

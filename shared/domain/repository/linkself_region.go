package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfRegionRepo はLinkSelf MyDBを使ったRegionRepository実装。
type LinkSelfRegionRepo struct{ *LinkSelfRepository }

// --- Region ---

func (r *LinkSelfRegionRepo) ListRegions() ([]models.Region, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, symbol, approved, geometry, sort_order, deleted_at
		 FROM regions WHERE deleted_at IS NULL ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Region
	for rows.Next() {
		reg, err := scanRegion(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, reg)
	}
	return result, nil
}

func (r *LinkSelfRegionRepo) GetRegion(id string) (*models.Region, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, symbol, approved, geometry, sort_order, deleted_at
		 FROM regions WHERE id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	reg, err := scanRegion(rows)
	if err != nil {
		return nil, err
	}
	return &reg, nil
}

func (r *LinkSelfRegionRepo) GetRegionRaw(id string) (*models.Region, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, symbol, approved, geometry, sort_order, deleted_at
		 FROM regions WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	reg, err := scanRegion(rows)
	if err != nil {
		return nil, err
	}
	return &reg, nil
}

func (r *LinkSelfRegionRepo) SaveRegion(region *models.Region) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO regions (id, name, symbol, approved, geometry, sort_order, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		region.ID, region.Name, region.Symbol, boolToInt(region.Approved),
		nullableJSON(region.Geometry).String, region.Order, formatTimePtr(region.DeletedAt))
	return err
}

func (r *LinkSelfRegionRepo) DeleteRegion(id string) error {
	now := time.Now()
	_, err := r.db.Exec(r.ctx,
		`UPDATE regions SET deleted_at = ? WHERE id = ?`,
		formatTime(now), id)
	return err
}

func (r *LinkSelfRegionRepo) RemoveRegion(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM regions WHERE id = ?`, id)
	return err
}

// --- ParentArea ---

func (r *LinkSelfRegionRepo) ListParentAreas(regionID string) ([]models.ParentArea, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, region_id, number, name, geometry, deleted_at
		 FROM parent_areas WHERE region_id = ? AND deleted_at IS NULL ORDER BY number`, regionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ParentArea
	for rows.Next() {
		pa, err := scanParentArea(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, pa)
	}
	return result, nil
}

func (r *LinkSelfRegionRepo) GetParentArea(id string) (*models.ParentArea, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, region_id, number, name, geometry, deleted_at
		 FROM parent_areas WHERE id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	pa, err := scanParentArea(rows)
	if err != nil {
		return nil, err
	}
	return &pa, nil
}

func (r *LinkSelfRegionRepo) GetParentAreaRaw(id string) (*models.ParentArea, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, region_id, number, name, geometry, deleted_at
		 FROM parent_areas WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	pa, err := scanParentArea(rows)
	if err != nil {
		return nil, err
	}
	return &pa, nil
}

func (r *LinkSelfRegionRepo) SaveParentArea(pa *models.ParentArea) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO parent_areas (id, region_id, number, name, geometry, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		pa.ID, pa.RegionID, pa.Number, pa.Name,
		nullableJSON(pa.Geometry).String, formatTimePtr(pa.DeletedAt))
	return err
}

func (r *LinkSelfRegionRepo) DeleteParentArea(id string) error {
	now := time.Now()
	_, err := r.db.Exec(r.ctx,
		`UPDATE parent_areas SET deleted_at = ? WHERE id = ?`,
		formatTime(now), id)
	return err
}

func (r *LinkSelfRegionRepo) RemoveParentArea(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM parent_areas WHERE id = ?`, id)
	return err
}

// --- Area ---

func (r *LinkSelfRegionRepo) ListAreas(parentAreaID string) ([]models.Area, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, parent_area_id, number, polygon_id, geometry, deleted_at
		 FROM areas WHERE parent_area_id = ? AND deleted_at IS NULL ORDER BY number`, parentAreaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Area
	for rows.Next() {
		a, err := scanArea(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, nil
}

func (r *LinkSelfRegionRepo) GetArea(id string) (*models.Area, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, parent_area_id, number, polygon_id, geometry, deleted_at
		 FROM areas WHERE id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	a, err := scanArea(rows)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *LinkSelfRegionRepo) GetAreaRaw(id string) (*models.Area, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, parent_area_id, number, polygon_id, geometry, deleted_at
		 FROM areas WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	a, err := scanArea(rows)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *LinkSelfRegionRepo) SaveArea(area *models.Area) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO areas (id, parent_area_id, number, polygon_id, geometry, deleted_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		area.ID, area.ParentAreaID, area.Number, area.PolygonID,
		nullableJSON(area.Geometry).String, formatTimePtr(area.DeletedAt))
	return err
}

func (r *LinkSelfRegionRepo) DeleteArea(id string) error {
	now := time.Now()
	_, err := r.db.Exec(r.ctx,
		`UPDATE areas SET deleted_at = ? WHERE id = ?`,
		formatTime(now), id)
	return err
}

func (r *LinkSelfRegionRepo) RemoveArea(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM areas WHERE id = ?`, id)
	return err
}

// --- scan helpers ---

type scannable interface {
	Scan(dest ...any) error
}

func scanRegion(row scannable) (models.Region, error) {
	var reg models.Region
	var approved int
	var geomStr sql.NullString
	var deletedAt sql.NullString
	err := row.Scan(&reg.ID, &reg.Name, &reg.Symbol, &approved,
		&geomStr, &reg.Order, &deletedAt)
	if err != nil {
		return reg, err
	}
	reg.Approved = approved != 0
	if geomStr.Valid && geomStr.String != "" {
		json.Unmarshal([]byte(geomStr.String), &reg.Geometry)
	}
	reg.DeletedAt = parseTimePtr(deletedAt)
	return reg, nil
}

func scanParentArea(row scannable) (models.ParentArea, error) {
	var pa models.ParentArea
	var geomStr sql.NullString
	var deletedAt sql.NullString
	err := row.Scan(&pa.ID, &pa.RegionID, &pa.Number, &pa.Name,
		&geomStr, &deletedAt)
	if err != nil {
		return pa, err
	}
	if geomStr.Valid && geomStr.String != "" {
		json.Unmarshal([]byte(geomStr.String), &pa.Geometry)
	}
	pa.DeletedAt = parseTimePtr(deletedAt)
	return pa, nil
}

func scanArea(row scannable) (models.Area, error) {
	var a models.Area
	var geomStr sql.NullString
	var deletedAt sql.NullString
	err := row.Scan(&a.ID, &a.ParentAreaID, &a.Number, &a.PolygonID,
		&geomStr, &deletedAt)
	if err != nil {
		return a, err
	}
	if geomStr.Valid && geomStr.String != "" {
		json.Unmarshal([]byte(geomStr.String), &a.Geometry)
	}
	a.DeletedAt = parseTimePtr(deletedAt)
	return a, nil
}

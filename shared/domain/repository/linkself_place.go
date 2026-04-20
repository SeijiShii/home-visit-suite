package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfPlaceRepo はLinkSelf MyDBを使ったPlaceRepository実装。
type LinkSelfPlaceRepo struct{ *LinkSelfRepository }

func (r *LinkSelfPlaceRepo) ListPlaces(areaID string) ([]models.Place, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, lat, lng, type, label, display_name, address, description, parent_id,
		        sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at,
		        deleted_at, restored_from_id
		 FROM places WHERE area_id = ? AND (deleted_at IS NULL OR deleted_at = '') ORDER BY sort_order`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Place
	for rows.Next() {
		p, err := scanPlace(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, nil
}

func (r *LinkSelfPlaceRepo) GetPlace(id string) (*models.Place, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, lat, lng, type, label, display_name, address, description, parent_id,
		        sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at,
		        deleted_at, restored_from_id
		 FROM places WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("place not found: %s", id)
	}
	p, err := scanPlace(rows)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *LinkSelfPlaceRepo) SavePlace(place *models.Place) error {
	deletedAt := ""
	if place.DeletedAt != nil {
		deletedAt = formatTime(*place.DeletedAt)
	}
	restoredFromID := ""
	if place.RestoredFromID != nil {
		restoredFromID = *place.RestoredFromID
	}
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO places
		 (id, area_id, lat, lng, type, label, display_name, address, description, parent_id,
		  sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at,
		  deleted_at, restored_from_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		place.ID, place.AreaID, place.Coord.Lat, place.Coord.Lng,
		string(place.Type), place.Label, place.DisplayName, place.Address, place.Description,
		place.ParentID,
		place.SortOrder, marshalJSON(place.Languages),
		boolToInt(place.DoNotVisit), place.DoNotVisitNote,
		formatTime(place.CreatedAt), formatTime(place.UpdatedAt),
		deletedAt, restoredFromID)
	return err
}

// DeletePlace は論理削除（DeletedAt をセット）。
func (r *LinkSelfPlaceRepo) DeletePlace(id string) error {
	now := formatTime(time.Now())
	_, err := r.db.Exec(r.ctx,
		`UPDATE places SET deleted_at = ? WHERE id = ?`, now, id)
	return err
}

// ListDeletedPlacesNear は削除済み場所を全件取得し、ハバーサイン距離で絞り込む。
// 件数が増えたらバウンディングボックスで一次フィルタを追加する。
func (r *LinkSelfPlaceRepo) ListDeletedPlacesNear(lat, lng, radiusMeters float64) ([]models.Place, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, lat, lng, type, label, display_name, address, description, parent_id,
		        sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at,
		        deleted_at, restored_from_id
		 FROM places WHERE deleted_at IS NOT NULL AND deleted_at != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Place
	for rows.Next() {
		p, err := scanPlace(rows)
		if err != nil {
			return nil, err
		}
		if haversineMeters(lat, lng, p.Coord.Lat, p.Coord.Lng) <= radiusMeters {
			result = append(result, p)
		}
	}
	return result, nil
}

func scanPlace(row scannable) (models.Place, error) {
	var p models.Place
	var typeStr string
	var languagesJSON string
	var doNotVisit int
	var createdAt, updatedAt, deletedAt, restoredFromID string
	err := row.Scan(&p.ID, &p.AreaID, &p.Coord.Lat, &p.Coord.Lng,
		&typeStr, &p.Label, &p.DisplayName, &p.Address, &p.Description, &p.ParentID,
		&p.SortOrder, &languagesJSON, &doNotVisit, &p.DoNotVisitNote,
		&createdAt, &updatedAt, &deletedAt, &restoredFromID)
	if err != nil {
		return p, err
	}
	p.Type = models.PlaceType(typeStr)
	json.Unmarshal([]byte(languagesJSON), &p.Languages)
	if p.Languages == nil {
		p.Languages = []string{}
	}
	p.DoNotVisit = doNotVisit != 0
	p.CreatedAt = parseTime(createdAt)
	p.UpdatedAt = parseTime(updatedAt)
	if deletedAt != "" {
		t := parseTime(deletedAt)
		p.DeletedAt = &t
	}
	if restoredFromID != "" {
		s := restoredFromID
		p.RestoredFromID = &s
	}
	return p, nil
}


// scanPlace uses sql.NullFloat64 if needed, but Place.Coord is not nullable.
var _ = sql.NullFloat64{}

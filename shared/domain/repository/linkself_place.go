package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfPlaceRepo はLinkSelf MyDBを使ったPlaceRepository実装。
type LinkSelfPlaceRepo struct{ *LinkSelfRepository }

func (r *LinkSelfPlaceRepo) ListPlaces(areaID string) ([]models.Place, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, lat, lng, type, label, display_name, parent_id,
		        sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at
		 FROM places WHERE area_id = ? ORDER BY sort_order`, areaID)
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
		`SELECT id, area_id, lat, lng, type, label, display_name, parent_id,
		        sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at
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
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO places
		 (id, area_id, lat, lng, type, label, display_name, parent_id,
		  sort_order, languages, do_not_visit, do_not_visit_note, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		place.ID, place.AreaID, place.Coord.Lat, place.Coord.Lng,
		string(place.Type), place.Label, place.DisplayName, place.ParentID,
		place.SortOrder, marshalJSON(place.Languages),
		boolToInt(place.DoNotVisit), place.DoNotVisitNote,
		formatTime(place.CreatedAt), formatTime(place.UpdatedAt))
	return err
}

func (r *LinkSelfPlaceRepo) DeletePlace(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM places WHERE id = ?`, id)
	return err
}

func scanPlace(row scannable) (models.Place, error) {
	var p models.Place
	var typeStr string
	var languagesJSON string
	var doNotVisit int
	var createdAt, updatedAt string
	err := row.Scan(&p.ID, &p.AreaID, &p.Coord.Lat, &p.Coord.Lng,
		&typeStr, &p.Label, &p.DisplayName, &p.ParentID,
		&p.SortOrder, &languagesJSON, &doNotVisit, &p.DoNotVisitNote,
		&createdAt, &updatedAt)
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
	return p, nil
}

// scanPlace uses sql.NullFloat64 if needed, but Place.Coord is not nullable.
var _ = sql.NullFloat64{}

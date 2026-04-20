package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfActivityRepo はLinkSelf MyDBを使ったActivityRepository実装。
type LinkSelfActivityRepo struct{ *LinkSelfRepository }

// --- Activity ---

func (r *LinkSelfActivityRepo) ListActivities(areaID string) ([]models.Activity, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM activities WHERE area_id = ? ORDER BY created_at DESC`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Activity
	for rows.Next() {
		a, err := scanActivity(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) GetActivity(id string) (*models.Activity, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM activities WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("activity not found: %s", id)
	}
	a, err := scanActivity(rows)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *LinkSelfActivityRepo) GetActiveActivity(areaID string) (*models.Activity, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM activities WHERE area_id = ? AND status IN ('pending', 'active')
		 LIMIT 1`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}
	a, err := scanActivity(rows)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *LinkSelfActivityRepo) SaveActivity(activity *models.Activity) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO activities
		 (id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		  created_at, returned_at, completed_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		activity.ID, activity.AreaID, activity.ScopeID,
		string(activity.CheckoutType), activity.OwnerID, activity.LentByID,
		string(activity.Status), formatTime(activity.CreatedAt),
		formatTimePtr(activity.ReturnedAt), formatTimePtr(activity.CompletedAt),
		formatTime(activity.UpdatedAt))
	return err
}

func (r *LinkSelfActivityRepo) DeleteActivity(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM activities WHERE id = ?`, id)
	return err
}

// --- Team ---

func (r *LinkSelfActivityRepo) ListTeams() ([]models.Team, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, leader_id, members FROM teams ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Team
	for rows.Next() {
		t, err := scanTeam(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) GetTeam(id string) (*models.Team, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, leader_id, members FROM teams WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("team not found: %s", id)
	}
	t, err := scanTeam(rows)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *LinkSelfActivityRepo) SaveTeam(team *models.Team) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO teams (id, name, leader_id, members) VALUES (?, ?, ?, ?)`,
		team.ID, team.Name, team.LeaderID, marshalJSON(team.Members))
	return err
}

func (r *LinkSelfActivityRepo) DeleteTeam(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM teams WHERE id = ?`, id)
	return err
}

// --- ActivityTeamAssignment ---

func (r *LinkSelfActivityRepo) ListAssignments(activityID string) ([]models.ActivityTeamAssignment, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, activity_id, team_id, activity_date, assigned_at
		 FROM activity_assignments WHERE activity_id = ? ORDER BY activity_date`, activityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ActivityTeamAssignment
	for rows.Next() {
		var a models.ActivityTeamAssignment
		var dateStr, assignedStr string
		if err := rows.Scan(&a.ID, &a.ActivityID, &a.TeamID, &dateStr, &assignedStr); err != nil {
			return nil, err
		}
		a.ActivityDate = parseTime(dateStr)
		a.AssignedAt = parseTime(assignedStr)
		result = append(result, a)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) SaveAssignment(a *models.ActivityTeamAssignment) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO activity_assignments (id, activity_id, team_id, activity_date, assigned_at)
		 VALUES (?, ?, ?, ?, ?)`,
		a.ID, a.ActivityID, a.TeamID, formatTime(a.ActivityDate), formatTime(a.AssignedAt))
	return err
}

func (r *LinkSelfActivityRepo) DeleteAssignment(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM activity_assignments WHERE id = ?`, id)
	return err
}

// --- VisitRecord ---

func (r *LinkSelfActivityRepo) ListVisitRecords(areaID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, activity_id,
		        result, applied_request_id, visited_at, created_at, updated_at
		 FROM visit_records WHERE area_id = ? ORDER BY visited_at DESC`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.VisitRecord
	for rows.Next() {
		vr, err := scanVisitRecord(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, vr)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) ListVisitRecordsByPlace(placeID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, activity_id,
		        result, applied_request_id, visited_at, created_at, updated_at
		 FROM visit_records WHERE place_id = ? ORDER BY visited_at DESC`, placeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.VisitRecord
	for rows.Next() {
		vr, err := scanVisitRecord(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, vr)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) ListMyVisitRecordsByPlace(placeID, userID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, activity_id,
		        result, applied_request_id, visited_at, created_at, updated_at
		 FROM visit_records WHERE place_id = ? AND user_id = ? ORDER BY visited_at DESC`,
		placeID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.VisitRecord
	for rows.Next() {
		vr, err := scanVisitRecord(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, vr)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) GetVisitRecord(id string) (*models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, activity_id,
		        result, visited_at, created_at, updated_at
		 FROM visit_records WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("visit record not found: %s", id)
	}
	vr, err := scanVisitRecord(rows)
	if err != nil {
		return nil, err
	}
	return &vr, nil
}

func (r *LinkSelfActivityRepo) SaveVisitRecord(vr *models.VisitRecord) error {
	var lat, lng sql.NullFloat64
	if vr.Coord != nil {
		lat = sql.NullFloat64{Float64: vr.Coord.Lat, Valid: true}
		lng = sql.NullFloat64{Float64: vr.Coord.Lng, Valid: true}
	}
	appliedReqID := ""
	if vr.AppliedRequestID != nil {
		appliedReqID = *vr.AppliedRequestID
	}
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO visit_records
		 (id, user_id, place_id, coord_lat, coord_lng, area_id, activity_id,
		  result, applied_request_id, visited_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		vr.ID, vr.UserID, vr.PlaceID, lat, lng, vr.AreaID, vr.ActivityID,
		string(vr.Result), appliedReqID,
		formatTime(vr.VisitedAt), formatTime(vr.CreatedAt), formatTime(vr.UpdatedAt))
	return err
}

func (r *LinkSelfActivityRepo) DeleteVisitRecord(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM visit_records WHERE id = ?`, id)
	return err
}

// --- VisitRecordEdit ---

func (r *LinkSelfActivityRepo) ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, visit_record_id, editor_id, old_body, new_body, edited_at
		 FROM visit_record_edits WHERE visit_record_id = ? ORDER BY edited_at`, visitRecordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.VisitRecordEdit
	for rows.Next() {
		var e models.VisitRecordEdit
		var editedAtStr string
		if err := rows.Scan(&e.ID, &e.VisitRecordID, &e.EditorID, &e.OldBody, &e.NewBody, &editedAtStr); err != nil {
			return nil, err
		}
		e.EditedAt = parseTime(editedAtStr)
		result = append(result, e)
	}
	return result, nil
}

func (r *LinkSelfActivityRepo) SaveVisitRecordEdit(edit *models.VisitRecordEdit) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO visit_record_edits (id, visit_record_id, editor_id, old_body, new_body, edited_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		edit.ID, edit.VisitRecordID, edit.EditorID, edit.OldBody, edit.NewBody, formatTime(edit.EditedAt))
	return err
}

// --- scan helpers ---

func scanActivity(row scannable) (models.Activity, error) {
	var a models.Activity
	var checkoutType, status string
	var createdAt, updatedAt string
	var returnedAt, completedAt sql.NullString
	err := row.Scan(&a.ID, &a.AreaID, &a.ScopeID, &checkoutType, &a.OwnerID,
		&a.LentByID, &status, &createdAt, &returnedAt, &completedAt, &updatedAt)
	if err != nil {
		return a, err
	}
	a.CheckoutType = models.CheckoutType(checkoutType)
	a.Status = models.ActivityStatus(status)
	a.CreatedAt = parseTime(createdAt)
	a.UpdatedAt = parseTime(updatedAt)
	a.ReturnedAt = parseTimePtr(returnedAt)
	a.CompletedAt = parseTimePtr(completedAt)
	return a, nil
}

func scanTeam(row scannable) (models.Team, error) {
	var t models.Team
	var membersJSON string
	err := row.Scan(&t.ID, &t.Name, &t.LeaderID, &membersJSON)
	if err != nil {
		return t, err
	}
	json.Unmarshal([]byte(membersJSON), &t.Members)
	if t.Members == nil {
		t.Members = []string{}
	}
	return t, nil
}

func scanVisitRecord(row scannable) (models.VisitRecord, error) {
	var vr models.VisitRecord
	var coordLat, coordLng sql.NullFloat64
	var resultStr, appliedReqID string
	var visitedAt, createdAt, updatedAt string
	err := row.Scan(&vr.ID, &vr.UserID, &vr.PlaceID, &coordLat, &coordLng,
		&vr.AreaID, &vr.ActivityID, &resultStr, &appliedReqID,
		&visitedAt, &createdAt, &updatedAt)
	if err != nil {
		return vr, err
	}
	vr.Result = models.VisitResult(resultStr)
	if coordLat.Valid && coordLng.Valid {
		vr.Coord = &models.Coordinate{Lat: coordLat.Float64, Lng: coordLng.Float64}
	}
	if appliedReqID != "" {
		s := appliedReqID
		vr.AppliedRequestID = &s
	}
	vr.VisitedAt = parseTime(visitedAt)
	vr.CreatedAt = parseTime(createdAt)
	vr.UpdatedAt = parseTime(updatedAt)
	return vr, nil
}

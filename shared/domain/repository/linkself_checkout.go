package repository

import (
	"database/sql"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfCheckoutRepo はLinkSelf MyDBを使ったCheckoutRepository実装。
type LinkSelfCheckoutRepo struct{ *LinkSelfRepository }

// --- Checkout ---

func (r *LinkSelfCheckoutRepo) ListCheckouts(areaID string) ([]models.Checkout, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM checkouts WHERE area_id = ? ORDER BY created_at DESC`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Checkout
	for rows.Next() {
		c, err := scanCheckout(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}

func (r *LinkSelfCheckoutRepo) GetCheckout(id string) (*models.Checkout, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM checkouts WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("checkout not found: %s", id)
	}
	c, err := scanCheckout(rows)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *LinkSelfCheckoutRepo) GetActiveCheckout(areaID string) (*models.Checkout, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		        created_at, returned_at, completed_at, updated_at
		 FROM checkouts WHERE area_id = ? AND status IN ('pending', 'active')
		 LIMIT 1`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}
	c, err := scanCheckout(rows)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *LinkSelfCheckoutRepo) SaveCheckout(checkout *models.Checkout) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO checkouts
		 (id, area_id, scope_id, checkout_type, owner_id, lent_by_id, status,
		  created_at, returned_at, completed_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		checkout.ID, checkout.AreaID, checkout.ScopeID,
		string(checkout.CheckoutType), checkout.OwnerID, checkout.LentByID,
		string(checkout.Status), formatTime(checkout.CreatedAt),
		formatTimePtr(checkout.ReturnedAt), formatTimePtr(checkout.CompletedAt),
		formatTime(checkout.UpdatedAt))
	return err
}

func (r *LinkSelfCheckoutRepo) DeleteCheckout(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM checkouts WHERE id = ?`, id)
	return err
}

// --- CheckoutInvitation ---

func (r *LinkSelfCheckoutRepo) GetCheckoutInvitation(id string) (*models.CheckoutInvitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, checkout_id, invitee_id, inviter_id, expires_at, revoked_at, created_at
		 FROM checkout_invitations WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("checkout invitation not found: %s", id)
	}
	inv, err := scanCheckoutInvitation(rows)
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *LinkSelfCheckoutRepo) GetCheckoutInvitationByPair(checkoutID, inviteeID string) (*models.CheckoutInvitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, checkout_id, invitee_id, inviter_id, expires_at, revoked_at, created_at
		 FROM checkout_invitations WHERE checkout_id = ? AND invitee_id = ?
		 LIMIT 1`, checkoutID, inviteeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}
	inv, err := scanCheckoutInvitation(rows)
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *LinkSelfCheckoutRepo) ListCheckoutInvitations(checkoutID string) ([]models.CheckoutInvitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, checkout_id, invitee_id, inviter_id, expires_at, revoked_at, created_at
		 FROM checkout_invitations WHERE checkout_id = ? ORDER BY created_at DESC`, checkoutID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.CheckoutInvitation
	for rows.Next() {
		inv, err := scanCheckoutInvitation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, inv)
	}
	return result, nil
}

func (r *LinkSelfCheckoutRepo) ListActiveCheckoutInvitationsForInvitee(inviteeID string) ([]models.CheckoutInvitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, checkout_id, invitee_id, inviter_id, expires_at, revoked_at, created_at
		 FROM checkout_invitations WHERE invitee_id = ? AND revoked_at IS NULL
		 ORDER BY created_at DESC`, inviteeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.CheckoutInvitation
	for rows.Next() {
		inv, err := scanCheckoutInvitation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, inv)
	}
	return result, nil
}

func (r *LinkSelfCheckoutRepo) SaveCheckoutInvitation(inv *models.CheckoutInvitation) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO checkout_invitations
		 (id, checkout_id, invitee_id, inviter_id, expires_at, revoked_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		inv.ID, inv.CheckoutID, inv.InviteeID, inv.InviterID,
		formatTime(inv.ExpiresAt), formatTimePtr(inv.RevokedAt), formatTime(inv.CreatedAt))
	return err
}

// --- VisitRecord ---

func (r *LinkSelfCheckoutRepo) ListVisitRecords(areaID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, checkout_id,
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

func (r *LinkSelfCheckoutRepo) ListVisitRecordsByPlace(placeID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, checkout_id,
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

func (r *LinkSelfCheckoutRepo) ListMyVisitRecordsByPlace(placeID, userID string) ([]models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, checkout_id,
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

func (r *LinkSelfCheckoutRepo) GetVisitRecord(id string) (*models.VisitRecord, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, user_id, place_id, coord_lat, coord_lng, area_id, checkout_id,
		        result, applied_request_id, visited_at, created_at, updated_at
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

func (r *LinkSelfCheckoutRepo) SaveVisitRecord(vr *models.VisitRecord) error {
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
		 (id, user_id, place_id, coord_lat, coord_lng, area_id, checkout_id,
		  result, applied_request_id, visited_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		vr.ID, vr.UserID, vr.PlaceID, lat, lng, vr.AreaID, vr.CheckoutID,
		string(vr.Result), appliedReqID,
		formatTime(vr.VisitedAt), formatTime(vr.CreatedAt), formatTime(vr.UpdatedAt))
	return err
}

func (r *LinkSelfCheckoutRepo) DeleteVisitRecord(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM visit_records WHERE id = ?`, id)
	return err
}

// --- VisitRecordEdit ---

func (r *LinkSelfCheckoutRepo) ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error) {
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

func (r *LinkSelfCheckoutRepo) SaveVisitRecordEdit(edit *models.VisitRecordEdit) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO visit_record_edits (id, visit_record_id, editor_id, old_body, new_body, edited_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		edit.ID, edit.VisitRecordID, edit.EditorID, edit.OldBody, edit.NewBody, formatTime(edit.EditedAt))
	return err
}

// --- scan helpers ---

func scanCheckoutInvitation(row scannable) (models.CheckoutInvitation, error) {
	var inv models.CheckoutInvitation
	var expiresAt, createdAt string
	var revokedAt sql.NullString
	err := row.Scan(&inv.ID, &inv.CheckoutID, &inv.InviteeID, &inv.InviterID,
		&expiresAt, &revokedAt, &createdAt)
	if err != nil {
		return inv, err
	}
	inv.ExpiresAt = parseTime(expiresAt)
	inv.CreatedAt = parseTime(createdAt)
	inv.RevokedAt = parseTimePtr(revokedAt)
	return inv, nil
}

func scanCheckout(row scannable) (models.Checkout, error) {
	var c models.Checkout
	var checkoutType, status string
	var createdAt, updatedAt string
	var returnedAt, completedAt sql.NullString
	err := row.Scan(&c.ID, &c.AreaID, &c.ScopeID, &checkoutType, &c.OwnerID,
		&c.LentByID, &status, &createdAt, &returnedAt, &completedAt, &updatedAt)
	if err != nil {
		return c, err
	}
	c.CheckoutType = models.CheckoutType(checkoutType)
	c.Status = models.CheckoutStatus(status)
	c.CreatedAt = parseTime(createdAt)
	c.UpdatedAt = parseTime(updatedAt)
	c.ReturnedAt = parseTimePtr(returnedAt)
	c.CompletedAt = parseTimePtr(completedAt)
	return c, nil
}

func scanVisitRecord(row scannable) (models.VisitRecord, error) {
	var vr models.VisitRecord
	var coordLat, coordLng sql.NullFloat64
	var resultStr, appliedReqID string
	var visitedAt, createdAt, updatedAt string
	err := row.Scan(&vr.ID, &vr.UserID, &vr.PlaceID, &coordLat, &coordLng,
		&vr.AreaID, &vr.CheckoutID, &resultStr, &appliedReqID,
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

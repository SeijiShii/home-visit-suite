package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfUserRepo はLinkSelf MyDBを使ったUserRepository実装。
type LinkSelfUserRepo struct{ *LinkSelfRepository }

// --- User ---

func (r *LinkSelfUserRepo) ListUsers() ([]models.User, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, role, tag_ids, joined_at FROM users ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, nil
}

func (r *LinkSelfUserRepo) GetUser(id string) (*models.User, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, role, tag_ids, joined_at FROM users WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("user not found: %s", id)
	}
	u, err := scanUser(rows)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *LinkSelfUserRepo) SaveUser(user *models.User) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO users (id, name, role, tag_ids, joined_at)
		 VALUES (?, ?, ?, ?, ?)`,
		user.ID, user.Name, string(user.Role),
		marshalJSON(user.TagIDs), formatTime(user.JoinedAt))
	return err
}

func (r *LinkSelfUserRepo) DeleteUser(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

// --- Tag ---

func (r *LinkSelfUserRepo) ListTags() ([]models.Tag, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, name, color FROM member_tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Tag
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, nil
}

func (r *LinkSelfUserRepo) SaveTag(tag *models.Tag) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO member_tags (id, name, color) VALUES (?, ?, ?)`,
		tag.ID, tag.Name, tag.Color)
	return err
}

func (r *LinkSelfUserRepo) DeleteTag(id string) error {
	_, err := r.db.Exec(r.ctx, `DELETE FROM member_tags WHERE id = ?`, id)
	return err
}

// --- Invitation ---

func (r *LinkSelfUserRepo) ListInvitations(inviteeID string) ([]models.Invitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, type, status, inviter_id, invitee_id, target_role, description, created_at, resolved_at
		 FROM invitations WHERE invitee_id = ? ORDER BY created_at DESC`, inviteeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, inv)
	}
	return result, nil
}

func (r *LinkSelfUserRepo) GetInvitation(id string) (*models.Invitation, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, type, status, inviter_id, invitee_id, target_role, description, created_at, resolved_at
		 FROM invitations WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("invitation not found: %s", id)
	}
	inv, err := scanInvitation(rows)
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *LinkSelfUserRepo) SaveInvitation(inv *models.Invitation) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO invitations (id, type, status, inviter_id, invitee_id, target_role, description, created_at, resolved_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		inv.ID, string(inv.Type), string(inv.Status), inv.InviterID, inv.InviteeID,
		string(inv.TargetRole), inv.Description, formatTime(inv.CreatedAt), formatTimePtr(inv.ResolvedAt))
	return err
}

// --- scan helpers ---

func scanUser(row scannable) (models.User, error) {
	var u models.User
	var roleStr string
	var tagIDsJSON string
	var joinedAtStr string
	err := row.Scan(&u.ID, &u.Name, &roleStr, &tagIDsJSON, &joinedAtStr)
	if err != nil {
		return u, err
	}
	u.Role = models.Role(roleStr)
	json.Unmarshal([]byte(tagIDsJSON), &u.TagIDs)
	if u.TagIDs == nil {
		u.TagIDs = []string{}
	}
	u.JoinedAt = parseTime(joinedAtStr)
	return u, nil
}

func scanInvitation(row scannable) (models.Invitation, error) {
	var inv models.Invitation
	var typeStr, statusStr, roleStr string
	var createdAtStr string
	var resolvedAt sql.NullString
	err := row.Scan(&inv.ID, &typeStr, &statusStr, &inv.InviterID, &inv.InviteeID,
		&roleStr, &inv.Description, &createdAtStr, &resolvedAt)
	if err != nil {
		return inv, err
	}
	inv.Type = models.InvitationType(typeStr)
	inv.Status = models.InvitationStatus(statusStr)
	inv.TargetRole = models.Role(roleStr)
	inv.CreatedAt = parseTime(createdAtStr)
	inv.ResolvedAt = parseTimePtr(resolvedAt)
	return inv, nil
}

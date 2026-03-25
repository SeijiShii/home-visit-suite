package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestInvitation_Fields(t *testing.T) {
	now := time.Now()
	inv := models.Invitation{
		ID:          "inv-1",
		Type:        models.InvitationTypeGroupJoin,
		Status:      models.InvitationStatusPending,
		InviterID:   "did:key:admin1",
		InviteeID:   "did:key:newmember",
		TargetRole:  models.RoleMember,
		Description: "グループAへの招待",
		CreatedAt:   now,
	}

	if inv.Type != models.InvitationTypeGroupJoin {
		t.Errorf("Type = %q, want group_join", inv.Type)
	}
	if inv.Status != models.InvitationStatusPending {
		t.Errorf("Status = %q, want pending", inv.Status)
	}
	if inv.ResolvedAt != nil {
		t.Error("ResolvedAt should be nil for pending invitation")
	}
}

func TestInvitation_Resolved(t *testing.T) {
	now := time.Now()
	resolved := now.Add(time.Hour)
	inv := models.Invitation{
		ID:         "inv-2",
		Type:       models.InvitationTypeRolePromote,
		Status:     models.InvitationStatusAccepted,
		InviterID:  "did:key:admin1",
		InviteeID:  "did:key:editor1",
		TargetRole: models.RoleEditor,
		CreatedAt:  now,
		ResolvedAt: &resolved,
	}

	if inv.Status != models.InvitationStatusAccepted {
		t.Errorf("Status = %q, want accepted", inv.Status)
	}
	if inv.ResolvedAt == nil || !inv.ResolvedAt.Equal(resolved) {
		t.Errorf("ResolvedAt = %v, want %v", inv.ResolvedAt, resolved)
	}
}

func TestInvitationType_Values(t *testing.T) {
	if string(models.InvitationTypeGroupJoin) != "group_join" {
		t.Errorf("got %q", models.InvitationTypeGroupJoin)
	}
	if string(models.InvitationTypeRolePromote) != "role_promote" {
		t.Errorf("got %q", models.InvitationTypeRolePromote)
	}
}

func TestInvitationStatus_Values(t *testing.T) {
	tests := []struct {
		s    models.InvitationStatus
		want string
	}{
		{models.InvitationStatusPending, "pending"},
		{models.InvitationStatusAccepted, "accepted"},
		{models.InvitationStatusDeclined, "declined"},
	}
	for _, tt := range tests {
		if string(tt.s) != tt.want {
			t.Errorf("InvitationStatus = %q, want %q", tt.s, tt.want)
		}
	}
}

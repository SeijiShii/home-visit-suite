package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestUser_NewFields(t *testing.T) {
	now := time.Now()
	u := models.User{
		ID:         "did:key:z6Mktest123",
		Name:       "田中太郎",
		Role:       models.RoleEditor,
		OrgGroupID: "group-a",
		TagIDs:     []string{"tag-1", "tag-2"},
		JoinedAt:   now,
	}

	if u.OrgGroupID != "group-a" {
		t.Errorf("OrgGroupID = %q, want %q", u.OrgGroupID, "group-a")
	}
	if len(u.TagIDs) != 2 {
		t.Errorf("TagIDs len = %d, want 2", len(u.TagIDs))
	}
	if u.TagIDs[0] != "tag-1" || u.TagIDs[1] != "tag-2" {
		t.Errorf("TagIDs = %v, want [tag-1 tag-2]", u.TagIDs)
	}
	if !u.JoinedAt.Equal(now) {
		t.Errorf("JoinedAt = %v, want %v", u.JoinedAt, now)
	}
}

func TestUser_OrgGroupID_Empty(t *testing.T) {
	u := models.User{
		ID:   "did:key:z6Mktest456",
		Name: "未所属メンバー",
		Role: models.RoleMember,
	}

	if u.OrgGroupID != "" {
		t.Errorf("OrgGroupID = %q, want empty (unassigned)", u.OrgGroupID)
	}
}

func TestUser_TagIDs_Nil(t *testing.T) {
	u := models.User{
		ID:   "did:key:z6Mktest789",
		Name: "タグなしメンバー",
		Role: models.RoleMember,
	}

	if u.TagIDs != nil {
		t.Errorf("TagIDs = %v, want nil", u.TagIDs)
	}
}

func TestRole_Values(t *testing.T) {
	tests := []struct {
		role models.Role
		want string
	}{
		{models.RoleAdmin, "admin"},
		{models.RoleEditor, "editor"},
		{models.RoleMember, "member"},
	}
	for _, tt := range tests {
		if string(tt.role) != tt.want {
			t.Errorf("Role = %q, want %q", tt.role, tt.want)
		}
	}
}

func TestRole_IsAtLeast(t *testing.T) {
	tests := []struct {
		name     string
		role     models.Role
		required models.Role
		want     bool
	}{
		{"admin >= admin", models.RoleAdmin, models.RoleAdmin, true},
		{"admin >= editor", models.RoleAdmin, models.RoleEditor, true},
		{"admin >= member", models.RoleAdmin, models.RoleMember, true},
		{"editor >= editor", models.RoleEditor, models.RoleEditor, true},
		{"editor >= member", models.RoleEditor, models.RoleMember, true},
		{"editor < admin", models.RoleEditor, models.RoleAdmin, false},
		{"member >= member", models.RoleMember, models.RoleMember, true},
		{"member < editor", models.RoleMember, models.RoleEditor, false},
		{"member < admin", models.RoleMember, models.RoleAdmin, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.role.IsAtLeast(tt.required)
			if got != tt.want {
				t.Errorf("%s.IsAtLeast(%s) = %v, want %v", tt.role, tt.required, got, tt.want)
			}
		})
	}
}

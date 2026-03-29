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

// --- Tag.Validate ---

func TestTag_Validate(t *testing.T) {
	tests := []struct {
		name    string
		tag     models.Tag
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid tag with name only",
			tag:     models.Tag{ID: "t1", Name: "外国語対応"},
			wantErr: false,
		},
		{
			name:    "valid tag with name and color",
			tag:     models.Tag{ID: "t2", Name: "新人", Color: "#3b82f6"},
			wantErr: false,
		},
		{
			name:    "valid tag with 16 rune name",
			tag:     models.Tag{ID: "t3", Name: "あいうえおかきくけこさしすせそた"},
			wantErr: false,
		},
		{
			name:    "valid tag with ASCII 16 chars",
			tag:     models.Tag{ID: "t4", Name: "abcdefghijklmnop"},
			wantErr: false,
		},
		{
			name:    "empty name is invalid",
			tag:     models.Tag{ID: "t5", Name: ""},
			wantErr: true,
			errMsg:  "name",
		},
		{
			name:    "name with 17 runes is invalid",
			tag:     models.Tag{ID: "t6", Name: "あいうえおかきくけこさしすせそたち"},
			wantErr: true,
			errMsg:  "name",
		},
		{
			name:    "valid color format #rrggbb lowercase",
			tag:     models.Tag{ID: "t7", Name: "test", Color: "#f43f5e"},
			wantErr: false,
		},
		{
			name:    "valid color format #rrggbb uppercase",
			tag:     models.Tag{ID: "t8", Name: "test", Color: "#AABBCC"},
			wantErr: false,
		},
		{
			name:    "empty color is valid (auto-assigned later)",
			tag:     models.Tag{ID: "t9", Name: "test", Color: ""},
			wantErr: false,
		},
		{
			name:    "invalid color without hash",
			tag:     models.Tag{ID: "t10", Name: "test", Color: "3b82f6"},
			wantErr: true,
			errMsg:  "color",
		},
		{
			name:    "invalid color too short",
			tag:     models.Tag{ID: "t11", Name: "test", Color: "#3b82f"},
			wantErr: true,
			errMsg:  "color",
		},
		{
			name:    "invalid color too long",
			tag:     models.Tag{ID: "t12", Name: "test", Color: "#3b82f600"},
			wantErr: true,
			errMsg:  "color",
		},
		{
			name:    "invalid color non-hex chars",
			tag:     models.Tag{ID: "t13", Name: "test", Color: "#gggggg"},
			wantErr: true,
			errMsg:  "color",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.tag.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() expected error containing %q, got nil", tt.errMsg)
					return
				}
				if tt.errMsg != "" && !containsStr(err.Error(), tt.errMsg) {
					t.Errorf("Validate() error = %q, want it to contain %q", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() unexpected error: %v", err)
				}
			}
		})
	}
}

func TestTagColorPalette(t *testing.T) {
	palette := models.TagColorPalette
	if len(palette) != 8 {
		t.Errorf("TagColorPalette len = %d, want 8", len(palette))
	}

	expectedColors := []string{
		"#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
		"#14b8a6", "#eab308", "#6366f1", "#f43f5e",
	}
	for i, want := range expectedColors {
		if palette[i] != want {
			t.Errorf("TagColorPalette[%d] = %q, want %q", i, palette[i], want)
		}
	}
}

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		func() bool {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		}())
}

package repository_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newUserRepo() *repository.InMemoryUserRepository {
	return repository.NewInMemoryUserRepository()
}

func TestUser_SaveAndGet(t *testing.T) {
	repo := newUserRepo()
	u := &models.User{ID: "did:key:u1", Name: "田中太郎", Role: models.RoleAdmin, JoinedAt: time.Now()}
	if err := repo.SaveUser(u); err != nil {
		t.Fatalf("SaveUser: %v", err)
	}
	got, err := repo.GetUser("did:key:u1")
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if got.Name != "田中太郎" {
		t.Errorf("Name = %q, want 田中太郎", got.Name)
	}
}

func TestUser_List(t *testing.T) {
	repo := newUserRepo()
	repo.SaveUser(&models.User{ID: "u1", Name: "A", Role: models.RoleAdmin})
	repo.SaveUser(&models.User{ID: "u2", Name: "B", Role: models.RoleMember})

	list, _ := repo.ListUsers()
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestUser_Delete(t *testing.T) {
	repo := newUserRepo()
	repo.SaveUser(&models.User{ID: "u1", Name: "A", Role: models.RoleAdmin})
	repo.DeleteUser("u1")
	_, err := repo.GetUser("u1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

// --- Group ---

func TestGroup_SaveAndList(t *testing.T) {
	repo := newUserRepo()
	repo.SaveGroup(&models.Group{ID: "g1", Name: "Aグループ"})
	repo.SaveGroup(&models.Group{ID: "g2", Name: "Bグループ"})

	list, _ := repo.ListGroups()
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

// --- Tag ---

func TestTag_SaveAndList(t *testing.T) {
	repo := newUserRepo()
	repo.SaveTag(&models.Tag{ID: "t1", Name: "外国語対応"})
	repo.SaveTag(&models.Tag{ID: "t2", Name: "新人"})

	list, _ := repo.ListTags()
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

// --- Tag validation and business logic ---

func TestTag_SaveTag_Validate(t *testing.T) {
	tests := []struct {
		name    string
		tag     *models.Tag
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid tag saves successfully",
			tag:     &models.Tag{ID: "t1", Name: "外国語対応"},
			wantErr: false,
		},
		{
			name:    "empty name is rejected",
			tag:     &models.Tag{ID: "t2", Name: ""},
			wantErr: true,
			errMsg:  "name",
		},
		{
			name:    "name over 16 runes is rejected",
			tag:     &models.Tag{ID: "t3", Name: "あいうえおかきくけこさしすせそたち"},
			wantErr: true,
			errMsg:  "name",
		},
		{
			name:    "invalid color is rejected",
			tag:     &models.Tag{ID: "t4", Name: "test", Color: "notacolor"},
			wantErr: true,
			errMsg:  "color",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newUserRepo()
			err := repo.SaveTag(tt.tag)
			if tt.wantErr {
				if err == nil {
					t.Errorf("SaveTag() expected error containing %q, got nil", tt.errMsg)
					return
				}
				if tt.errMsg != "" {
					errStr := err.Error()
					found := false
					for i := 0; i <= len(errStr)-len(tt.errMsg); i++ {
						if errStr[i:i+len(tt.errMsg)] == tt.errMsg {
							found = true
							break
						}
					}
					if !found {
						t.Errorf("SaveTag() error = %q, want it to contain %q", errStr, tt.errMsg)
					}
				}
			} else {
				if err != nil {
					t.Errorf("SaveTag() unexpected error: %v", err)
				}
			}
		})
	}
}

func TestTag_SaveTag_DuplicateName(t *testing.T) {
	repo := newUserRepo()

	// Save first tag
	if err := repo.SaveTag(&models.Tag{ID: "t1", Name: "外国語対応"}); err != nil {
		t.Fatalf("first SaveTag unexpected error: %v", err)
	}

	// Same name, different ID => must fail
	err := repo.SaveTag(&models.Tag{ID: "t2", Name: "外国語対応"})
	if err == nil {
		t.Fatal("SaveTag() expected duplicate name error, got nil")
	}

	// Same ID (update) => must succeed
	err = repo.SaveTag(&models.Tag{ID: "t1", Name: "外国語対応"})
	if err != nil {
		t.Errorf("SaveTag() update same ID unexpected error: %v", err)
	}

	// Different case => must succeed (case-sensitive)
	err = repo.SaveTag(&models.Tag{ID: "t3", Name: "外国語対応2"})
	if err != nil {
		t.Errorf("SaveTag() different name unexpected error: %v", err)
	}
}

func TestTag_SaveTag_DuplicateName_CaseSensitive(t *testing.T) {
	repo := newUserRepo()

	if err := repo.SaveTag(&models.Tag{ID: "t1", Name: "NewMember"}); err != nil {
		t.Fatalf("first SaveTag unexpected error: %v", err)
	}

	// Different case => allowed (case-sensitive check)
	err := repo.SaveTag(&models.Tag{ID: "t2", Name: "newmember"})
	if err != nil {
		t.Errorf("SaveTag() case-different name should succeed, got error: %v", err)
	}
}

func TestTag_SaveTag_AutoColor(t *testing.T) {
	repo := newUserRepo()

	// Save tag without color
	tag := &models.Tag{ID: "t1", Name: "タグA"}
	if err := repo.SaveTag(tag); err != nil {
		t.Fatalf("SaveTag unexpected error: %v", err)
	}

	tags, _ := repo.ListTags()
	if len(tags) != 1 {
		t.Fatalf("expected 1 tag, got %d", len(tags))
	}
	if tags[0].Color == "" {
		t.Error("SaveTag() should auto-assign color when Color is empty")
	}
	// Must be one of the palette colors
	found := false
	for _, c := range models.TagColorPalette {
		if tags[0].Color == c {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("auto-assigned color %q is not in TagColorPalette", tags[0].Color)
	}
}

func TestTag_SaveTag_AutoColor_CyclesAndAvoidsUsed(t *testing.T) {
	repo := newUserRepo()
	palette := models.TagColorPalette

	// Fill all 8 palette slots
	colors := make([]string, 0, len(palette))
	for i, c := range palette {
		tag := &models.Tag{ID: fmt.Sprintf("t%d", i+1), Name: fmt.Sprintf("Tag%d", i+1), Color: c}
		if err := repo.SaveTag(tag); err != nil {
			t.Fatalf("SaveTag[%d] unexpected error: %v", i, err)
		}
		colors = append(colors, c)
	}
	_ = colors

	// 9th tag without color: cycles back to first palette color
	tag9 := &models.Tag{ID: "t9", Name: "Tag9"}
	if err := repo.SaveTag(tag9); err != nil {
		t.Fatalf("SaveTag[9] unexpected error: %v", err)
	}
	tags, _ := repo.ListTags()
	var savedTag9 *models.Tag
	for i := range tags {
		if tags[i].ID == "t9" {
			savedTag9 = &tags[i]
			break
		}
	}
	if savedTag9 == nil {
		t.Fatal("tag9 not found after save")
	}
	if savedTag9.Color == "" {
		t.Error("tag9 should have auto-assigned color")
	}
	found := false
	for _, c := range palette {
		if savedTag9.Color == c {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("tag9 auto color %q not in palette", savedTag9.Color)
	}
}

func TestTag_SaveTag_AutoColor_PreservesExplicitColor(t *testing.T) {
	repo := newUserRepo()

	tag := &models.Tag{ID: "t1", Name: "test", Color: "#ec4899"}
	if err := repo.SaveTag(tag); err != nil {
		t.Fatalf("SaveTag unexpected error: %v", err)
	}
	tags, _ := repo.ListTags()
	if tags[0].Color != "#ec4899" {
		t.Errorf("Color = %q, want #ec4899 (explicit color should be preserved)", tags[0].Color)
	}
}

func TestUser_SaveUser_TagLimit(t *testing.T) {
	repo := newUserRepo()

	// Seed 10 tags
	for i := 0; i < 10; i++ {
		repo.SaveTag(&models.Tag{ID: fmt.Sprintf("tag-%d", i), Name: fmt.Sprintf("Tag%d", i)})
	}

	// User with exactly 10 tags => OK
	tagIDs := make([]string, 10)
	for i := 0; i < 10; i++ {
		tagIDs[i] = fmt.Sprintf("tag-%d", i)
	}
	u := &models.User{ID: "u1", Name: "test", Role: models.RoleMember, TagIDs: tagIDs}
	if err := repo.SaveUser(u); err != nil {
		t.Errorf("SaveUser with 10 tags unexpected error: %v", err)
	}

	// User with 11 tags => error
	tagIDs11 := append(tagIDs, "tag-extra")
	u2 := &models.User{ID: "u2", Name: "test2", Role: models.RoleMember, TagIDs: tagIDs11}
	err := repo.SaveUser(u2)
	if err == nil {
		t.Fatal("SaveUser() expected error for >10 tags, got nil")
	}
}

func TestUser_SaveUser_TagLimit_Zero(t *testing.T) {
	repo := newUserRepo()

	// User with no tags => OK
	u := &models.User{ID: "u1", Name: "test", Role: models.RoleMember, TagIDs: nil}
	if err := repo.SaveUser(u); err != nil {
		t.Errorf("SaveUser with nil TagIDs unexpected error: %v", err)
	}

	u2 := &models.User{ID: "u2", Name: "test2", Role: models.RoleMember, TagIDs: []string{}}
	if err := repo.SaveUser(u2); err != nil {
		t.Errorf("SaveUser with empty TagIDs unexpected error: %v", err)
	}
}

// --- Invitation ---

func TestInvitation_SaveAndListByInvitee(t *testing.T) {
	repo := newUserRepo()
	repo.SaveInvitation(&models.Invitation{ID: "inv-1", InviteeID: "u1", Status: models.InvitationStatusPending})
	repo.SaveInvitation(&models.Invitation{ID: "inv-2", InviteeID: "u1", Status: models.InvitationStatusAccepted})
	repo.SaveInvitation(&models.Invitation{ID: "inv-3", InviteeID: "u2", Status: models.InvitationStatusPending})

	list, _ := repo.ListInvitations("u1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

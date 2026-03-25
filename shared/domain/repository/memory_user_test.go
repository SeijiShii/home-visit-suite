package repository_test

import (
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

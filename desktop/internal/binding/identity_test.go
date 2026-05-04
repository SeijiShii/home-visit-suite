package binding_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func setupIdentityRepo(t *testing.T) *repository.InMemoryUserRepository {
	t.Helper()
	repo := repository.NewInMemoryUserRepository()
	repo.SaveUser(&models.User{ID: "did:real", Name: "自分", Role: models.RoleAdmin})
	repo.SaveUser(&models.User{ID: "did:editor", Name: "編集太郎", Role: models.RoleEditor})
	repo.SaveUser(&models.User{ID: "did:member", Name: "活動花子", Role: models.RoleMember})
	return repo
}

func TestIdentityBinding_DefaultsToRealDID(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), false)
	if got := b.GetCurrentActor(); got != "did:real" {
		t.Errorf("GetCurrentActor = %q, want did:real", got)
	}
	if got := b.GetRealDID(); got != "did:real" {
		t.Errorf("GetRealDID = %q, want did:real", got)
	}
}

func TestIdentityBinding_DevModeFlag(t *testing.T) {
	prod := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), false)
	if prod.IsDevMode() {
		t.Error("prod IsDevMode = true, want false")
	}
	dev := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), true)
	if !dev.IsDevMode() {
		t.Error("dev IsDevMode = false, want true")
	}
}

func TestIdentityBinding_SwitchInDevMode(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), true)

	if err := b.SetCurrentActor("did:editor"); err != nil {
		t.Fatalf("SetCurrentActor: %v", err)
	}
	if got := b.GetCurrentActor(); got != "did:editor" {
		t.Errorf("after switch: GetCurrentActor = %q, want did:editor", got)
	}
	// 切替後も realDID は不変
	if got := b.GetRealDID(); got != "did:real" {
		t.Errorf("realDID changed: %q", got)
	}
}

func TestIdentityBinding_SwitchInProdModeRejected(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), false)

	if err := b.SetCurrentActor("did:editor"); err == nil {
		t.Fatal("SetCurrentActor should error in prod mode")
	}
	// アクターは変わらない
	if got := b.GetCurrentActor(); got != "did:real" {
		t.Errorf("actor should not change in prod, got %q", got)
	}
}

func TestIdentityBinding_SwitchUnknownUser(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), true)

	if err := b.SetCurrentActor("did:nonexistent"); err == nil {
		t.Fatal("SetCurrentActor should error for unknown user")
	}
	if got := b.GetCurrentActor(); got != "did:real" {
		t.Errorf("actor changed to invalid: %q", got)
	}
}

func TestIdentityBinding_ListAvailableInDevMode(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), true)

	users, err := b.ListAvailableIdentities()
	if err != nil {
		t.Fatalf("ListAvailableIdentities: %v", err)
	}
	if len(users) != 3 {
		t.Errorf("got %d users, want 3", len(users))
	}
}

func TestIdentityBinding_ListAvailableInProdRejected(t *testing.T) {
	b := binding.NewIdentityBinding("did:real", setupIdentityRepo(t), false)

	if _, err := b.ListAvailableIdentities(); err == nil {
		t.Fatal("ListAvailableIdentities should error in prod mode")
	}
}

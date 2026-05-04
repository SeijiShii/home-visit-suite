package binding_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// setupCheckoutBinding は CheckoutBinding を関連リポジトリと一緒に構築する。
// editor / owner-member / invitee の 3 ロールユーザーをシードする。
func setupCheckoutBinding(t *testing.T) *binding.CheckoutBinding {
	t.Helper()
	coRepo := repository.NewInMemoryCheckoutRepository()
	userRepo := repository.NewInMemoryUserRepository()
	notifRepo := repository.NewInMemoryNotificationRepository()

	userRepo.SaveUser(&models.User{ID: "ed-1", Name: "編集太郎", Role: models.RoleEditor})
	userRepo.SaveUser(&models.User{ID: "mem-owner", Name: "担当花子", Role: models.RoleMember})
	userRepo.SaveUser(&models.User{ID: "mem-invitee", Name: "招待次郎", Role: models.RoleMember})

	svc := service.NewCheckoutService(coRepo, userRepo, notifRepo)
	return binding.NewCheckoutBinding(coRepo, svc)
}

func TestCheckoutBinding_CheckoutAndGet(t *testing.T) {
	b := setupCheckoutBinding(t)

	co, err := b.Checkout("ed-1", "area-1", "lending", "mem-owner")
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.AreaID != "area-1" || co.OwnerID != "mem-owner" {
		t.Errorf("unexpected checkout: %+v", co)
	}

	got, err := b.GetCheckout(co.ID)
	if err != nil {
		t.Fatalf("GetCheckout: %v", err)
	}
	if got.ID != co.ID {
		t.Errorf("GetCheckout returned wrong record")
	}
}

func TestCheckoutBinding_GetActiveCheckout_NilWhenNoneActive(t *testing.T) {
	b := setupCheckoutBinding(t)

	got, err := b.GetActiveCheckout("area-no-active")
	if err != nil {
		t.Fatalf("GetActiveCheckout should not error: %v", err)
	}
	if got != nil {
		t.Errorf("GetActiveCheckout = %+v, want nil", got)
	}
}

func TestCheckoutBinding_ReturnAndForceReturn(t *testing.T) {
	b := setupCheckoutBinding(t)

	co, _ := b.Checkout("ed-1", "area-r1", "lending", "mem-owner")
	if err := b.Return("mem-owner", co.ID); err != nil {
		t.Fatalf("Return: %v", err)
	}

	co2, _ := b.Checkout("ed-1", "area-r2", "lending", "mem-owner")
	if err := b.ForceReturn("ed-1", co2.ID); err != nil {
		t.Fatalf("ForceReturn: %v", err)
	}
}

func TestCheckoutBinding_ReassignOwner(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-rs", "lending", "mem-owner")

	if err := b.ReassignOwner("ed-1", co.ID, "mem-invitee"); err != nil {
		t.Fatalf("ReassignOwner: %v", err)
	}
	got, _ := b.GetCheckout(co.ID)
	if got.OwnerID != "mem-invitee" {
		t.Errorf("OwnerID = %q, want mem-invitee", got.OwnerID)
	}
}

func TestCheckoutBinding_InviteAndListAndRevoke(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-inv", "lending", "mem-owner")

	// ttlHours=12 で発行
	inv, err := b.Invite("ed-1", co.ID, "mem-invitee", 12)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}
	expectedExpiry := inv.CreatedAt.Add(12 * time.Hour)
	delta := inv.ExpiresAt.Sub(expectedExpiry)
	if delta > time.Second || delta < -time.Second {
		t.Errorf("ExpiresAt = %v, want about %v", inv.ExpiresAt, expectedExpiry)
	}

	list, _ := b.ListInvitations(co.ID)
	if len(list) != 1 {
		t.Fatalf("invitations = %d, want 1", len(list))
	}

	if err := b.RevokeInvite("ed-1", inv.ID); err != nil {
		t.Fatalf("RevokeInvite: %v", err)
	}
	list2, _ := b.ListInvitations(co.ID)
	if list2[0].RevokedAt == nil {
		t.Error("invitation should be revoked")
	}
}

func TestCheckoutBinding_Invite_DefaultTTLWhenZero(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-default-ttl", "lending", "mem-owner")

	inv, err := b.Invite("ed-1", co.ID, "mem-invitee", 0)
	if err != nil {
		t.Fatalf("Invite default ttl: %v", err)
	}
	expectedExpiry := inv.CreatedAt.Add(models.DefaultCheckoutInviteTTL)
	delta := inv.ExpiresAt.Sub(expectedExpiry)
	if delta > time.Second || delta < -time.Second {
		t.Errorf("ExpiresAt = %v, want about %v (24h default)", inv.ExpiresAt, expectedExpiry)
	}
}

func TestCheckoutBinding_AccessModeAndAccessibleAreas(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-access-1", "lending", "mem-owner")
	b.Invite("ed-1", co.ID, "mem-invitee", 0)

	// 担当者は editable
	mode, err := b.AreaAccessMode("mem-owner", "area-access-1")
	if err != nil {
		t.Fatalf("AreaAccessMode owner: %v", err)
	}
	if mode != "editable" {
		t.Errorf("owner mode = %q, want editable", mode)
	}

	// 被招待者も editable
	mode, _ = b.AreaAccessMode("mem-invitee", "area-access-1")
	if mode != "editable" {
		t.Errorf("invitee mode = %q, want editable", mode)
	}

	// PlaceAccessMode は常に editable（Phase 1）
	pmode, _ := b.PlaceAccessMode("mem-invitee", "place-x")
	if pmode != "editable" {
		t.Errorf("place mode = %q, want editable", pmode)
	}

	// ListAccessibleAreas: 被招待者は invitee role で 1 件
	areas, err := b.ListAccessibleAreas("mem-invitee")
	if err != nil {
		t.Fatalf("ListAccessibleAreas: %v", err)
	}
	if len(areas) != 1 {
		t.Fatalf("got %d accessible areas, want 1", len(areas))
	}
	if areas[0].Role != service.AccessibleAreaRoleInvitee {
		t.Errorf("role = %q, want invitee", areas[0].Role)
	}
	if areas[0].InviteExpiresAt == nil {
		t.Error("InviteExpiresAt should be set for invitee")
	}
}

func TestCheckoutBinding_ListCheckouts(t *testing.T) {
	b := setupCheckoutBinding(t)
	areaID := "area-list"
	co1, _ := b.Checkout("ed-1", areaID, "lending", "mem-owner")
	b.Return("mem-owner", co1.ID) // 返却して再貸出可能に
	b.Checkout("ed-1", areaID, "lending", "mem-invitee")

	list, err := b.ListCheckouts(areaID)
	if err != nil {
		t.Fatalf("ListCheckouts: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

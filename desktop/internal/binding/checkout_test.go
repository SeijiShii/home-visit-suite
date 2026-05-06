package binding_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// setupCheckoutBinding は CheckoutBinding を関連リポジトリと一緒に構築する。
// editor / mem-pic / mem-invitee の 3 ロールユーザー、テスト用区域 area-1 / area-2、
// それらをカバーするアクティブ AvailablePeriod をシードする。
func setupCheckoutBinding(t *testing.T) *binding.CheckoutBinding {
	t.Helper()
	coRepo := repository.NewInMemoryCheckoutRepository()
	userRepo := repository.NewInMemoryUserRepository()
	notifRepo := repository.NewInMemoryNotificationRepository()
	regionRepo := repository.NewInMemoryRepository()
	covRepo := repository.NewInMemoryCoverageRepository()

	userRepo.SaveUser(&models.User{ID: "ed-1", Name: "編集太郎", Role: models.RoleEditor})
	userRepo.SaveUser(&models.User{ID: "mem-pic", Name: "担当花子", Role: models.RoleMember})
	userRepo.SaveUser(&models.User{ID: "mem-invitee", Name: "招待次郎", Role: models.RoleMember})

	regionRepo.SaveRegion(&models.Region{ID: "rg-test", Name: "test", Symbol: "TST", Approved: true})
	regionRepo.SaveParentArea(&models.ParentArea{ID: "pa-test", RegionID: "rg-test", Number: "001", Name: "親番"})
	for i, id := range []string{
		"area-1", "area-2", "area-access-1", "area-default-ttl", "area-inv",
		"area-list", "area-no-active", "area-r1", "area-r2", "area-rs",
	} {
		regionRepo.SaveArea(&models.Area{ID: id, ParentAreaID: "pa-test", Number: fmt.Sprintf("%02d", i+1)})
	}

	now := time.Now()
	covRepo.SaveAvailablePeriod(&models.AvailablePeriod{
		ID:            "ap-test",
		Name:          "test active",
		StartDate:     now.AddDate(0, 0, -1),
		EndDate:       now.AddDate(0, 0, 30),
		ParentAreaIDs: []string{"pa-test"},
		CreatedAt:     now,
		UpdatedAt:     now,
	})

	apSvc := service.NewAvailablePeriodService(covRepo, coRepo, userRepo)
	svc := service.NewCheckoutService(coRepo, userRepo, notifRepo, regionRepo, apSvc)
	return binding.NewCheckoutBinding(coRepo, svc)
}

func TestCheckoutBinding_CheckoutAndGet(t *testing.T) {
	b := setupCheckoutBinding(t)

	co, err := b.Checkout("ed-1", "area-1", "mem-pic")
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.AreaID != "area-1" || co.PersonInChargeID != "mem-pic" {
		t.Errorf("unexpected checkout: %+v", co)
	}
	if co.CheckedOutByID != "ed-1" {
		t.Errorf("CheckedOutByID = %q, want ed-1", co.CheckedOutByID)
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

	co, _ := b.Checkout("ed-1", "area-r1", "mem-pic")
	if err := b.Return("mem-pic", co.ID); err != nil {
		t.Fatalf("Return: %v", err)
	}

	co2, _ := b.Checkout("ed-1", "area-r2", "mem-pic")
	if err := b.ForceReturn("ed-1", co2.ID); err != nil {
		t.Fatalf("ForceReturn: %v", err)
	}
}

func TestCheckoutBinding_ReassignPersonInCharge(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-rs", "mem-pic")

	if err := b.ReassignPersonInCharge("ed-1", co.ID, "mem-invitee"); err != nil {
		t.Fatalf("ReassignPersonInCharge: %v", err)
	}
	got, _ := b.GetCheckout(co.ID)
	if got.PersonInChargeID != "mem-invitee" {
		t.Errorf("PersonInChargeID = %q, want mem-invitee", got.PersonInChargeID)
	}
}

func TestCheckoutBinding_InviteAndListAndRevoke(t *testing.T) {
	b := setupCheckoutBinding(t)
	co, _ := b.Checkout("ed-1", "area-inv", "mem-pic")

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
	co, _ := b.Checkout("ed-1", "area-default-ttl", "mem-pic")

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
	co, _ := b.Checkout("ed-1", "area-access-1", "mem-pic")
	b.Invite("ed-1", co.ID, "mem-invitee", 0)

	mode, err := b.AreaAccessMode("mem-pic", "area-access-1")
	if err != nil {
		t.Fatalf("AreaAccessMode person in charge: %v", err)
	}
	if mode != "editable" {
		t.Errorf("PiC mode = %q, want editable", mode)
	}

	mode, _ = b.AreaAccessMode("mem-invitee", "area-access-1")
	if mode != "editable" {
		t.Errorf("invitee mode = %q, want editable", mode)
	}

	pmode, _ := b.PlaceAccessMode("mem-invitee", "place-x")
	if pmode != "editable" {
		t.Errorf("place mode = %q, want editable", pmode)
	}

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
	co1, _ := b.Checkout("ed-1", areaID, "mem-pic")
	b.Return("mem-pic", co1.ID)
	b.Checkout("ed-1", areaID, "mem-invitee")

	list, err := b.ListCheckouts(areaID)
	if err != nil {
		t.Fatalf("ListCheckouts: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

package service_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

func setupAP(t *testing.T) (service.AvailablePeriodService, *repository.InMemoryCoverageRepository, *repository.InMemoryCheckoutRepository, *repository.InMemoryUserRepository) {
	t.Helper()
	covRepo := repository.NewInMemoryCoverageRepository()
	coRepo := repository.NewInMemoryCheckoutRepository()
	userRepo := repository.NewInMemoryUserRepository()

	userRepo.SaveUser(&models.User{ID: "ed-1", Name: "編集太郎", Role: models.RoleEditor})
	userRepo.SaveUser(&models.User{ID: "ad-1", Name: "管理者", Role: models.RoleAdmin})
	userRepo.SaveUser(&models.User{ID: "mem-1", Name: "活動メンバー", Role: models.RoleMember})

	svc := service.NewAvailablePeriodService(covRepo, coRepo, userRepo)
	return svc, covRepo, coRepo, userRepo
}

func ymd(y, m, d int) time.Time {
	return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
}

// --- CreatePeriod ---

func TestCreatePeriod_EditorSuccess(t *testing.T) {
	svc, _, _, _ := setupAP(t)

	p, err := svc.CreatePeriod("ed-1", "春期", ymd(2026, 5, 1), ymd(2026, 5, 31),
		[]string{"pa-1"}, []string{"apt-1"})
	if err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}
	if p.Name != "春期" {
		t.Errorf("Name = %q, want 春期", p.Name)
	}
	if p.ID == "" {
		t.Error("ID should be assigned")
	}
}

func TestCreatePeriod_MemberDenied(t *testing.T) {
	svc, _, _, _ := setupAP(t)

	_, err := svc.CreatePeriod("mem-1", "春期", ymd(2026, 5, 1), ymd(2026, 5, 31), nil, nil)
	if err == nil {
		t.Fatal("expected permission denied for member")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestCreatePeriod_InvalidName(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	_, err := svc.CreatePeriod("ed-1", "", ymd(2026, 5, 1), ymd(2026, 5, 31), nil, nil)
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestCreatePeriod_InvalidDates(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	_, err := svc.CreatePeriod("ed-1", "x", ymd(2026, 5, 31), ymd(2026, 5, 1), nil, nil)
	if err == nil {
		t.Fatal("expected error for end before start")
	}
}

func TestCreatePeriod_OverlapRejected(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	_, err := svc.CreatePeriod("ed-1", "春期", ymd(2026, 5, 1), ymd(2026, 5, 31), nil, nil)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}

	// 重複期間
	_, err = svc.CreatePeriod("ed-1", "夏期", ymd(2026, 5, 15), ymd(2026, 6, 15), nil, nil)
	if err == nil {
		t.Fatal("expected error for overlapping period")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestCreatePeriod_NonOverlapAllowed(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	_, err := svc.CreatePeriod("ed-1", "春期", ymd(2026, 5, 1), ymd(2026, 5, 31), nil, nil)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	// 接さない非重複期間
	_, err = svc.CreatePeriod("ed-1", "夏期", ymd(2026, 6, 1), ymd(2026, 6, 30), nil, nil)
	if err != nil {
		t.Fatalf("non-overlap create: %v", err)
	}
}

// --- UpdatePeriod ---

func TestUpdatePeriod_PendingFullEdit(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	// 開始前期間
	p, _ := svc.CreatePeriod("ed-1", "future", ymd(2099, 5, 1), ymd(2099, 5, 31), nil, nil)

	newName := "renamed"
	newStart := ymd(2099, 6, 1)
	newEnd := ymd(2099, 6, 30)
	updated, err := svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{
		Name: &newName, StartDate: &newStart, EndDate: &newEnd,
	})
	if err != nil {
		t.Fatalf("UpdatePeriod: %v", err)
	}
	if updated.Name != "renamed" {
		t.Errorf("Name = %q, want renamed", updated.Name)
	}
	if !updated.StartDate.Equal(newStart) {
		t.Errorf("StartDate not updated: %v", updated.StartDate)
	}
}

func TestUpdatePeriod_ActiveOnlyExtensionsAllowed(t *testing.T) {
	svc, covRepo, _, _ := setupAP(t)

	// アクティブ期間を直接保存（now を含む）
	now := time.Now()
	p := &models.AvailablePeriod{
		ID:        "ap-active",
		Name:      "active-period",
		StartDate: now.Add(-24 * time.Hour),
		EndDate:   now.Add(24 * time.Hour),
		CreatedAt: now,
		UpdatedAt: now,
	}
	covRepo.SaveAvailablePeriod(p)

	// 終了日延長 → 許容
	extended := p.EndDate.Add(48 * time.Hour)
	_, err := svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{EndDate: &extended})
	if err != nil {
		t.Fatalf("extend EndDate: %v", err)
	}

	// 終了日短縮 → 拒否
	shortened := p.EndDate.Add(-12 * time.Hour)
	_, err = svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{EndDate: &shortened})
	if err == nil {
		t.Fatal("expected error for shortening end date during active phase")
	}

	// 名前変更 → 拒否
	newName := "renamed"
	_, err = svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{Name: &newName})
	if err == nil {
		t.Fatal("expected error for renaming during active phase")
	}
}

func TestUpdatePeriod_ActiveAddParentAreaAllowed(t *testing.T) {
	svc, covRepo, _, _ := setupAP(t)

	now := time.Now()
	p := &models.AvailablePeriod{
		ID:            "ap-active2",
		Name:          "active-period",
		StartDate:     now.Add(-24 * time.Hour),
		EndDate:       now.Add(24 * time.Hour),
		ParentAreaIDs: []string{"pa-1"},
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	covRepo.SaveAvailablePeriod(p)

	// 追加のみ → 許容
	added := []string{"pa-1", "pa-2"}
	_, err := svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{ParentAreaIDs: &added})
	if err != nil {
		t.Fatalf("add parent area: %v", err)
	}

	// 削除（pa-1 を外す）→ 拒否
	removed := []string{"pa-2"}
	_, err = svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{ParentAreaIDs: &removed})
	if err == nil {
		t.Fatal("expected error for removing parent area during active phase")
	}
}

func TestUpdatePeriod_ClosedTagOnly(t *testing.T) {
	svc, covRepo, _, _ := setupAP(t)

	now := time.Now()
	p := &models.AvailablePeriod{
		ID:            "ap-closed",
		Name:          "past",
		StartDate:     now.Add(-72 * time.Hour),
		EndDate:       now.Add(-24 * time.Hour),
		ParentAreaIDs: []string{"pa-1"},
		TagIDs:        []string{"apt-1"},
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	covRepo.SaveAvailablePeriod(p)

	// タグ変更 → 許容
	newTags := []string{"apt-1", "apt-2"}
	_, err := svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{TagIDs: &newTags})
	if err != nil {
		t.Fatalf("update tags on closed period: %v", err)
	}

	// 名前変更 → 拒否
	newName := "renamed"
	_, err = svc.UpdatePeriod("ed-1", p.ID, service.PeriodUpdate{Name: &newName})
	if err == nil {
		t.Fatal("expected error for renaming closed period")
	}
}

func TestUpdatePeriod_MemberDenied(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	p, _ := svc.CreatePeriod("ed-1", "春期", ymd(2099, 5, 1), ymd(2099, 5, 31), nil, nil)

	newName := "x"
	_, err := svc.UpdatePeriod("mem-1", p.ID, service.PeriodUpdate{Name: &newName})
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- DeletePeriod ---

func TestDeletePeriod_PendingSuccess(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	p, _ := svc.CreatePeriod("ed-1", "future", ymd(2099, 5, 1), ymd(2099, 5, 31), nil, nil)

	if err := svc.DeletePeriod("ed-1", p.ID); err != nil {
		t.Fatalf("DeletePeriod: %v", err)
	}
	if _, err := svc.GetPeriod(p.ID); err == nil {
		t.Error("period should be deleted")
	}
}

func TestDeletePeriod_ActiveDenied(t *testing.T) {
	svc, covRepo, _, _ := setupAP(t)

	now := time.Now()
	p := &models.AvailablePeriod{
		ID:        "ap-active-del",
		Name:      "active",
		StartDate: now.Add(-24 * time.Hour),
		EndDate:   now.Add(24 * time.Hour),
		CreatedAt: now,
		UpdatedAt: now,
	}
	covRepo.SaveAvailablePeriod(p)

	err := svc.DeletePeriod("ed-1", p.ID)
	if err == nil {
		t.Fatal("expected error for deleting active period")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestDeletePeriod_MemberDenied(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	p, _ := svc.CreatePeriod("ed-1", "x", ymd(2099, 5, 1), ymd(2099, 5, 31), nil, nil)

	err := svc.DeletePeriod("mem-1", p.ID)
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- GetActivePeriod ---

func TestGetActivePeriod_None(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	got, err := svc.GetActivePeriod(time.Now())
	if err != nil {
		t.Fatalf("GetActivePeriod: %v", err)
	}
	if got != nil {
		t.Errorf("GetActivePeriod = %v, want nil for no periods", got)
	}
}

func TestGetActivePeriod_PicksMatching(t *testing.T) {
	svc, covRepo, _, _ := setupAP(t)

	// 過去 / 現在 / 未来の3期間
	now := time.Now()
	covRepo.SaveAvailablePeriod(&models.AvailablePeriod{
		ID: "p-past", Name: "past",
		StartDate: now.Add(-72 * time.Hour), EndDate: now.Add(-48 * time.Hour),
	})
	covRepo.SaveAvailablePeriod(&models.AvailablePeriod{
		ID: "p-now", Name: "now",
		StartDate: now.Add(-24 * time.Hour), EndDate: now.Add(24 * time.Hour),
	})
	covRepo.SaveAvailablePeriod(&models.AvailablePeriod{
		ID: "p-future", Name: "future",
		StartDate: now.Add(48 * time.Hour), EndDate: now.Add(72 * time.Hour),
	})

	got, err := svc.GetActivePeriod(now)
	if err != nil {
		t.Fatalf("GetActivePeriod: %v", err)
	}
	if got == nil || got.ID != "p-now" {
		t.Errorf("got %v, want p-now", got)
	}
}

// --- ForceCloseExpiredCheckouts ---

func TestForceCloseExpiredCheckouts(t *testing.T) {
	svc, covRepo, coRepo, _ := setupAP(t)

	now := time.Now()
	expired := &models.AvailablePeriod{
		ID:        "ap-expired",
		Name:      "expired",
		StartDate: now.Add(-72 * time.Hour),
		EndDate:   now.Add(-1 * time.Hour),
	}
	active := &models.AvailablePeriod{
		ID:        "ap-active",
		Name:      "active",
		StartDate: now.Add(-1 * time.Hour),
		EndDate:   now.Add(24 * time.Hour),
	}
	covRepo.SaveAvailablePeriod(expired)
	covRepo.SaveAvailablePeriod(active)

	// 期限切れ期間配下のチェックアウト
	coRepo.SaveCheckout(&models.Checkout{
		ID: "co-expired-1", AreaID: "a1", AvailablePeriodID: expired.ID,
		PersonInChargeID: "mem-1", Status: models.CheckoutStatusActive,
		CreatedAt: now.Add(-48 * time.Hour), UpdatedAt: now.Add(-48 * time.Hour),
	})
	coRepo.SaveCheckout(&models.Checkout{
		ID: "co-expired-2", AreaID: "a2", AvailablePeriodID: expired.ID,
		PersonInChargeID: "mem-1", Status: models.CheckoutStatusPending,
		CreatedAt: now.Add(-48 * time.Hour), UpdatedAt: now.Add(-48 * time.Hour),
	})
	// 既に返却済み（強制クローズ対象外）
	returned := now.Add(-30 * time.Hour)
	coRepo.SaveCheckout(&models.Checkout{
		ID: "co-expired-3", AreaID: "a3", AvailablePeriodID: expired.ID,
		PersonInChargeID: "mem-1", Status: models.CheckoutStatusReturned,
		ReturnedAt: &returned,
		CreatedAt:  now.Add(-48 * time.Hour), UpdatedAt: now.Add(-30 * time.Hour),
	})
	// アクティブ期間配下（クローズ対象外）
	coRepo.SaveCheckout(&models.Checkout{
		ID: "co-active-1", AreaID: "a4", AvailablePeriodID: active.ID,
		PersonInChargeID: "mem-1", Status: models.CheckoutStatusActive,
		CreatedAt: now, UpdatedAt: now,
	})

	// 関連招待（強制クローズ時に連動失効）
	coRepo.SaveCheckoutInvitation(&models.CheckoutInvitation{
		ID:         "inv-1",
		CheckoutID: "co-expired-1",
		InviteeID:  "mem-2",
		InviterID:  "ed-1",
		ExpiresAt:  now.Add(24 * time.Hour),
		CreatedAt:  now.Add(-12 * time.Hour),
	})

	closed, err := svc.ForceCloseExpiredCheckouts(now)
	if err != nil {
		t.Fatalf("ForceCloseExpiredCheckouts: %v", err)
	}
	if closed != 2 {
		t.Errorf("closed count = %d, want 2 (active+pending in expired period)", closed)
	}

	// 強制クローズ対象の確認
	c1, _ := coRepo.GetCheckout("co-expired-1")
	if c1.Status != models.CheckoutStatusForceClosed {
		t.Errorf("co-expired-1 status = %q, want force_closed", c1.Status)
	}
	if c1.ForceClosedAt == nil {
		t.Error("co-expired-1 ForceClosedAt should be set")
	}
	c2, _ := coRepo.GetCheckout("co-expired-2")
	if c2.Status != models.CheckoutStatusForceClosed {
		t.Errorf("co-expired-2 status = %q, want force_closed", c2.Status)
	}

	// 既に返却済みは変わらない
	c3, _ := coRepo.GetCheckout("co-expired-3")
	if c3.Status != models.CheckoutStatusReturned {
		t.Errorf("co-expired-3 status = %q, want returned (unchanged)", c3.Status)
	}

	// アクティブ期間の co は影響なし
	c4, _ := coRepo.GetCheckout("co-active-1")
	if c4.Status != models.CheckoutStatusActive {
		t.Errorf("co-active-1 status = %q, want active (untouched)", c4.Status)
	}

	// 招待が連動失効
	inv, _ := coRepo.GetCheckoutInvitation("inv-1")
	if inv.RevokedAt == nil {
		t.Error("inv-1 should be revoked alongside force close")
	}
}

// --- Tag CRUD ---

func TestCreateTag_Success(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	tag, err := svc.CreateTag("ed-1", "春期", "#3b82f6")
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if tag.Name != "春期" {
		t.Errorf("Name = %q, want 春期", tag.Name)
	}
}

func TestCreateTag_MemberDenied(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	_, err := svc.CreateTag("mem-1", "x", "")
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestCreateTag_DuplicateName(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	if _, err := svc.CreateTag("ed-1", "春期", ""); err != nil {
		t.Fatalf("first: %v", err)
	}
	_, err := svc.CreateTag("ed-1", "春期", "")
	if err == nil {
		t.Fatal("expected error for duplicate tag name")
	}
}

func TestUpdateAndDeleteTag(t *testing.T) {
	svc, _, _, _ := setupAP(t)
	tag, _ := svc.CreateTag("ed-1", "春期", "")
	updated, err := svc.UpdateTag("ed-1", tag.ID, "春期キャンペーン", "#3b82f6")
	if err != nil {
		t.Fatalf("UpdateTag: %v", err)
	}
	if updated.Name != "春期キャンペーン" {
		t.Errorf("Name = %q, want 春期キャンペーン", updated.Name)
	}

	if err := svc.DeleteTag("ed-1", tag.ID); err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
	tags, _ := svc.ListTags()
	for _, tg := range tags {
		if tg.ID == tag.ID {
			t.Error("tag should be deleted")
		}
	}
}

package service_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
	"github.com/SeijiShii/home-visit-suite/shared/testdata"
)

func setupCheckout() (service.CheckoutService, *testdata.Repos) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)
	apSvc := service.NewAvailablePeriodService(repos.Coverage, repos.Checkout, repos.User)
	svc := service.NewCheckoutService(repos.Checkout, repos.User, repos.Notification, repos.Region, apSvc)
	return svc, repos
}

// --- Checkout ---

func TestCheckout_EditorAssignsOther_Success(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-001-01"
	editorDID := "did:key:z6Mk0003"
	personInCharge := "did:key:z6Mk0010"

	co, err := svc.Checkout(editorDID, areaID, personInCharge)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.AreaID != areaID {
		t.Errorf("AreaID = %q, want %q", co.AreaID, areaID)
	}
	if co.CheckedOutByID != editorDID {
		t.Errorf("CheckedOutByID = %q, want %q", co.CheckedOutByID, editorDID)
	}
	if co.PersonInChargeID != personInCharge {
		t.Errorf("PersonInChargeID = %q, want %q", co.PersonInChargeID, personInCharge)
	}
	if co.Status != models.CheckoutStatusActive {
		t.Errorf("Status = %q, want active", co.Status)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got == nil {
		t.Fatal("checkout not found in repository")
	}
}

func TestCheckout_MemberSelfTake_Success(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-002-01"
	memberDID := "did:key:z6Mk0010"

	co, err := svc.Checkout(memberDID, areaID, memberDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.PersonInChargeID != memberDID {
		t.Errorf("PersonInChargeID = %q, want %q", co.PersonInChargeID, memberDID)
	}
	if co.CheckedOutByID != memberDID {
		t.Errorf("CheckedOutByID = %q, want %q (self-take)", co.CheckedOutByID, memberDID)
	}
}

func TestCheckout_MemberAssignOther_Denied(t *testing.T) {
	svc, _ := setupCheckout()

	memberDID := "did:key:z6Mk0010"
	_, err := svc.Checkout(memberDID, "pa-tms-004-01", "did:key:z6Mk0011")
	if err == nil {
		t.Fatal("expected permission denied for member assigning other person in charge")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestCheckout_ExclusiveCheckout_Error(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-003-01"
	editorDID := "did:key:z6Mk0003"
	_, err := svc.Checkout(editorDID, areaID, "did:key:z6Mk0010")
	if err != nil {
		t.Fatalf("first checkout: %v", err)
	}

	_, err = svc.Checkout(editorDID, areaID, "did:key:z6Mk0011")
	if err == nil {
		t.Fatal("expected exclusive checkout error")
	}
	if !service.IsCode(err, service.ErrExclusiveCheckout) {
		t.Errorf("error code = %v, want exclusive_checkout", err)
	}
}

// --- AvailablePeriod 制約 ---

func TestCheckout_AvailablePeriodID_Set(t *testing.T) {
	svc, _ := setupCheckout()

	co, err := svc.Checkout("did:key:z6Mk0003", "pa-tms-001-04", "did:key:z6Mk0010")
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.AvailablePeriodID != testdata.SeedTestActivePeriodID {
		t.Errorf("AvailablePeriodID = %q, want %q", co.AvailablePeriodID, testdata.SeedTestActivePeriodID)
	}
}

func TestCheckout_NoActivePeriod_Error(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	if err := testdata.SeedAll(repos); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// アクティブな AvailablePeriod を全削除
	periods, _ := repos.Coverage.ListAvailablePeriods()
	for _, p := range periods {
		_ = repos.Coverage.DeleteAvailablePeriod(p.ID)
	}
	apSvc := service.NewAvailablePeriodService(repos.Coverage, repos.Checkout, repos.User)
	svc := service.NewCheckoutService(repos.Checkout, repos.User, repos.Notification, repos.Region, apSvc)

	_, err := svc.Checkout("did:key:z6Mk0003", "pa-tms-001-05", "did:key:z6Mk0010")
	if err == nil {
		t.Fatal("expected error when no active period")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestCheckout_AreaParentNotInPeriod_Error(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	if err := testdata.SeedAll(repos); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Period を pa-tms-001 のみ対象に書き換え
	p, _ := repos.Coverage.GetAvailablePeriod(testdata.SeedTestActivePeriodID)
	p.ParentAreaIDs = []string{"pa-tms-001"}
	_ = repos.Coverage.SaveAvailablePeriod(p)

	apSvc := service.NewAvailablePeriodService(repos.Coverage, repos.Checkout, repos.User)
	svc := service.NewCheckoutService(repos.Checkout, repos.User, repos.Notification, repos.Region, apSvc)

	_, err := svc.Checkout("did:key:z6Mk0003", "pa-tms-002-01", "did:key:z6Mk0010")
	if err == nil {
		t.Fatal("expected error for area outside period scope")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- Return ---

func TestReturn_Success(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-001-02"
	editorDID := "did:key:z6Mk0003"
	personInCharge := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, personInCharge)

	err := svc.Return(personInCharge, co.ID)
	if err != nil {
		t.Fatalf("Return: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.Status != models.CheckoutStatusReturned {
		t.Errorf("Status = %q, want returned", got.Status)
	}
	if got.ReturnedAt == nil {
		t.Error("ReturnedAt should be set")
	}
}

func TestReturn_NotActive_Error(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-001-03"
	editorDID := "did:key:z6Mk0003"
	co, _ := svc.Checkout(editorDID, areaID, "did:key:z6Mk0010")
	svc.Return("did:key:z6Mk0010", co.ID)

	err := svc.Return("did:key:z6Mk0010", co.ID)
	if err == nil {
		t.Fatal("expected invalid state error for returning non-active checkout")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

// --- ForceReturn ---

func TestForceReturn_EditorSuccess(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-002-02"
	editorDID := "did:key:z6Mk0003"
	co, _ := svc.Checkout(editorDID, areaID, "did:key:z6Mk0010")

	err := svc.ForceReturn(editorDID, co.ID)
	if err != nil {
		t.Fatalf("ForceReturn: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.Status != models.CheckoutStatusReturned {
		t.Errorf("Status = %q, want returned", got.Status)
	}
}

func TestForceReturn_MemberDenied(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-002-03"
	editorDID := "did:key:z6Mk0003"
	co, _ := svc.Checkout(editorDID, areaID, "did:key:z6Mk0010")

	err := svc.ForceReturn("did:key:z6Mk0010", co.ID)
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- RecordVisit ---

func TestRecordVisit_Success(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-003-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)

	vr, err := svc.RecordVisit(memberDID, co.ID, "place-0001", models.VisitResultMet, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.CheckoutID != co.ID {
		t.Errorf("CheckoutID = %q, want %q", vr.CheckoutID, co.ID)
	}
	if vr.Result != models.VisitResultMet {
		t.Errorf("Result = %q, want met", vr.Result)
	}

	records, _ := repos.Checkout.ListVisitRecords(areaID)
	found := false
	for _, r := range records {
		if r.ID == vr.ID {
			found = true
		}
	}
	if !found {
		t.Error("visit record not found in repository")
	}
}

func TestRecordVisit_NotActive_Error(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-003-03"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)
	svc.Return(memberDID, co.ID)

	_, err := svc.RecordVisit(memberDID, co.ID, "place-0001", models.VisitResultMet, time.Now(), "")
	if err == nil {
		t.Fatal("expected error for recording visit on non-active checkout")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestRecordVisit_Refused_CreatesRequest(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-002-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)

	text := "玄関先で『今後一切来ないでほしい』との明確な意思表示あり"
	vr, err := svc.RecordVisit(memberDID, co.ID, "place-0001", models.VisitResultRefused, time.Now(), text)
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.AppliedRequestID == nil {
		t.Fatal("AppliedRequestID = nil, want non-nil for refused")
	}

	req, err := repos.Notification.GetRequest(*vr.AppliedRequestID)
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.Type != models.RequestTypeDoNotVisit {
		t.Errorf("Request.Type = %q, want do_not_visit", req.Type)
	}
	if req.PlaceID != "place-0001" {
		t.Errorf("Request.PlaceID = %q, want place-0001", req.PlaceID)
	}
	if req.SubmitterID != memberDID {
		t.Errorf("Request.SubmitterID = %q, want %q", req.SubmitterID, memberDID)
	}
	if req.Description != text {
		t.Errorf("Request.Description = %q, want %q", req.Description, text)
	}
	if req.AreaID != co.AreaID {
		t.Errorf("Request.AreaID = %q, want %q", req.AreaID, co.AreaID)
	}
	if req.Status != models.RequestStatusPending {
		t.Errorf("Request.Status = %q, want pending", req.Status)
	}
}

func TestRecordVisit_VacantAbandoned_CreatesMapUpdateRequest(t *testing.T) {
	svc, repos := setupCheckout()

	areaID := "pa-tms-002-03"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)

	text := "完全に廃屋。屋根が崩落している"
	vr, err := svc.RecordVisit(memberDID, co.ID, "place-0002", models.VisitResultVacantAbandoned, time.Now(), text)
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.AppliedRequestID == nil {
		t.Fatal("AppliedRequestID = nil, want non-nil for vacant_abandoned")
	}

	req, _ := repos.Notification.GetRequest(*vr.AppliedRequestID)
	if req.Type != models.RequestTypeMapUpdate {
		t.Errorf("Request.Type = %q, want map_update", req.Type)
	}
}

func TestRecordVisit_Refused_EmptyText_Error(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-003-04"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)

	_, err := svc.RecordVisit(memberDID, co.ID, "place-0001", models.VisitResultRefused, time.Now(), "")
	if err == nil {
		t.Fatal("expected error for empty applicationText with refused status")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestRecordVisit_VacantPossible_NoApplication(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-004-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, memberDID)

	vr, err := svc.RecordVisit(memberDID, co.ID, "place-0003", models.VisitResultVacantPossible, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.AppliedRequestID != nil {
		t.Errorf("AppliedRequestID = %v, want nil for vacant_possible", vr.AppliedRequestID)
	}
}

// --- Invite / RevokeInvite / ListInvitations ---

const (
	inviteEditorDID = "did:key:z6Mk0003"
	inviteOtherEdit = "did:key:z6Mk0004"
	invitePiCDID    = "did:key:z6Mk0010" // 担当者となる活動メンバー
	inviteeAlpha    = "did:key:z6Mk0011"
	inviteeBeta     = "did:key:z6Mk0012"
)

func activeCheckoutForInvite(t *testing.T, svc service.CheckoutService, areaID string) *models.Checkout {
	t.Helper()
	co, err := svc.Checkout(inviteEditorDID, areaID, invitePiCDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	return co
}

func TestInvite_EditorSuccess(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-01")

	inv, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}
	if inv.CheckoutID != co.ID {
		t.Errorf("CheckoutID = %q, want %q", inv.CheckoutID, co.ID)
	}
	if inv.InviteeID != inviteeAlpha {
		t.Errorf("InviteeID = %q, want %q", inv.InviteeID, inviteeAlpha)
	}
	if inv.InviterID != inviteEditorDID {
		t.Errorf("InviterID = %q, want %q", inv.InviterID, inviteEditorDID)
	}
	expectedExpiry := inv.CreatedAt.Add(models.DefaultCheckoutInviteTTL)
	delta := inv.ExpiresAt.Sub(expectedExpiry)
	if delta > time.Second || delta < -time.Second {
		t.Errorf("ExpiresAt = %v, want about %v", inv.ExpiresAt, expectedExpiry)
	}
	if !inv.IsActive(time.Now()) {
		t.Error("invitation should be active immediately after creation")
	}

	notifs, _ := repos.Notification.ListNotifications(inviteeAlpha)
	found := false
	for _, n := range notifs {
		if n.Type == models.NotificationTypeAreaInvite && n.ReferenceID == inv.ID {
			found = true
		}
	}
	if !found {
		t.Error("expected NotificationTypeAreaInvite for invitee")
	}
}

func TestInvite_PersonInChargeCanInvite(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-02")

	_, err := svc.Invite(invitePiCDID, co.ID, inviteeAlpha, 0)
	if err != nil {
		t.Fatalf("person in charge invite: %v", err)
	}
}

func TestInvite_NonPiCMemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-03")

	_, err := svc.Invite(inviteeAlpha, co.ID, inviteeBeta, 0)
	if err == nil {
		t.Fatal("expected permission denied for non-PiC non-editor")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestInvite_NonActiveCheckoutError(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-04")
	if err := svc.Return(invitePiCDID, co.ID); err != nil {
		t.Fatalf("Return: %v", err)
	}

	_, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	if err == nil {
		t.Fatal("expected error for invite on non-active checkout")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestInvite_PiCHimselfRejected(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-05")

	_, err := svc.Invite(inviteEditorDID, co.ID, invitePiCDID, 0)
	if err == nil {
		t.Fatal("expected error for inviting person in charge themselves")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestInvite_EditorAsInviteeRejected(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-06")

	_, err := svc.Invite(inviteEditorDID, co.ID, inviteOtherEdit, 0)
	if err == nil {
		t.Fatal("expected error for inviting editor as invitee")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestInvite_NegativeTTLRejected(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-07")

	_, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, -1*time.Hour)
	if err == nil {
		t.Fatal("expected error for negative ttl")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestInvite_DuplicateInviteOverwritesExpiresAt(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-08")

	first, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 6*time.Hour)
	second, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 48*time.Hour)
	if err != nil {
		t.Fatalf("re-invite: %v", err)
	}
	if second.ID != first.ID {
		t.Errorf("re-invite created new record (id=%q), want same as first (id=%q)", second.ID, first.ID)
	}
	if !second.ExpiresAt.After(first.ExpiresAt) {
		t.Errorf("ExpiresAt not extended: first=%v second=%v", first.ExpiresAt, second.ExpiresAt)
	}
	all, _ := svc.ListInvitations(co.ID)
	count := 0
	for _, inv := range all {
		if inv.InviteeID == inviteeAlpha {
			count++
		}
	}
	if count != 1 {
		t.Errorf("invitations for invitee = %d, want 1 (overwrite)", count)
	}
}

func TestRevokeInvite_InviterCanRevoke(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-09")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	if err := svc.RevokeInvite(inviteEditorDID, inv.ID); err != nil {
		t.Fatalf("RevokeInvite: %v", err)
	}
	all, _ := svc.ListInvitations(co.ID)
	if len(all) != 1 || all[0].RevokedAt == nil {
		t.Errorf("invitation should be revoked: %+v", all)
	}
	if all[0].IsActive(time.Now()) {
		t.Error("revoked invitation should not be active")
	}
}

func TestRevokeInvite_PiCCanRevoke(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-10")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	if err := svc.RevokeInvite(invitePiCDID, inv.ID); err != nil {
		t.Fatalf("PiC revoke: %v", err)
	}
}

func TestRevokeInvite_OtherMemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-11")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	err := svc.RevokeInvite(inviteeBeta, inv.ID)
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestRevokeInvite_AlreadyRevokedError(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-12")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	svc.RevokeInvite(inviteEditorDID, inv.ID)

	err := svc.RevokeInvite(inviteEditorDID, inv.ID)
	if err == nil {
		t.Fatal("expected error for double revoke")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestReturn_CascadeRevokesInvitations(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-13")
	svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	svc.Invite(inviteEditorDID, co.ID, inviteeBeta, 0)

	if err := svc.Return(invitePiCDID, co.ID); err != nil {
		t.Fatalf("Return: %v", err)
	}
	all, _ := svc.ListInvitations(co.ID)
	if len(all) != 2 {
		t.Fatalf("invitation count = %d, want 2", len(all))
	}
	for _, inv := range all {
		if inv.RevokedAt == nil {
			t.Errorf("invitation %s not revoked after Return", inv.ID)
		}
	}
}

func TestForceReturn_CascadeRevokesInvitations(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-14")
	svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	if err := svc.ForceReturn(inviteEditorDID, co.ID); err != nil {
		t.Fatalf("ForceReturn: %v", err)
	}
	all, _ := svc.ListInvitations(co.ID)
	if len(all) != 1 || all[0].RevokedAt == nil {
		t.Errorf("invitation should be revoked after ForceReturn: %+v", all)
	}
}

// --- ReassignPersonInCharge ---

func TestReassignPersonInCharge_EditorSuccess(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-01")

	newPiC := inviteeAlpha
	if err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, newPiC); err != nil {
		t.Fatalf("ReassignPersonInCharge: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.PersonInChargeID != newPiC {
		t.Errorf("PersonInChargeID = %q, want %q", got.PersonInChargeID, newPiC)
	}
	if got.CheckedOutByID != inviteEditorDID {
		t.Errorf("CheckedOutByID = %q, want %q (history preserved)", got.CheckedOutByID, inviteEditorDID)
	}
}

func TestReassignPersonInCharge_MemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-02")

	err := svc.ReassignPersonInCharge(invitePiCDID, co.ID, inviteeAlpha)
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestReassignPersonInCharge_NonActiveCheckoutError(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-03")
	svc.Return(invitePiCDID, co.ID)

	err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, inviteeAlpha)
	if err == nil {
		t.Fatal("expected error for reassign on non-active")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestReassignPersonInCharge_NotFoundCheckout(t *testing.T) {
	svc, _ := setupCheckout()
	err := svc.ReassignPersonInCharge(inviteEditorDID, "co-nonexistent", inviteeAlpha)
	if err == nil {
		t.Fatal("expected not found")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

func TestReassignPersonInCharge_NotFoundNewPiC(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-04")

	err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, "did:key:nonexistent")
	if err == nil {
		t.Fatal("expected not found for unknown new person in charge")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

func TestReassignPersonInCharge_SamePiCNoOp(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-05")

	if err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, invitePiCDID); err != nil {
		t.Fatalf("same-PiC reassign should succeed (no-op): %v", err)
	}
	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.PersonInChargeID != invitePiCDID {
		t.Errorf("PersonInChargeID changed to %q (want unchanged %q)", got.PersonInChargeID, invitePiCDID)
	}
}

func TestReassignPersonInCharge_KeepsInvitations(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-06")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	if err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, inviteeBeta); err != nil {
		t.Fatalf("ReassignPersonInCharge: %v", err)
	}

	all, _ := svc.ListInvitations(co.ID)
	if len(all) != 1 {
		t.Fatalf("invitation count = %d, want 1 (preserved)", len(all))
	}
	if all[0].ID != inv.ID || all[0].RevokedAt != nil {
		t.Errorf("invitation modified: %+v (want preserved & active)", all[0])
	}
	if all[0].InviterID != inviteEditorDID {
		t.Errorf("InviterID = %q, want %q (preserved)", all[0].InviterID, inviteEditorDID)
	}
}

// --- 編集メンバーが自分自身を担当者にチェックアウト ---

func TestCheckout_EditorSelfAssign(t *testing.T) {
	svc, _ := setupCheckout()

	co, err := svc.Checkout(inviteEditorDID, "pa-tms-006-07", inviteEditorDID)
	if err != nil {
		t.Fatalf("editor self-assign: %v", err)
	}
	if co.PersonInChargeID != inviteEditorDID {
		t.Errorf("PersonInChargeID = %q, want %q", co.PersonInChargeID, inviteEditorDID)
	}
	if co.CheckedOutByID != inviteEditorDID {
		t.Errorf("CheckedOutByID = %q, want %q", co.CheckedOutByID, inviteEditorDID)
	}
}

// --- AreaAccessMode / PlaceAccessMode / ListAccessibleAreas ---

func TestAreaAccessMode_PiC_Editable(t *testing.T) {
	svc, _ := setupCheckout()
	areaID := "pa-tms-007-01"
	svc.Checkout(inviteEditorDID, areaID, invitePiCDID)

	mode, err := svc.AreaAccessMode(invitePiCDID, areaID)
	if err != nil {
		t.Fatalf("AreaAccessMode: %v", err)
	}
	if mode != models.AccessModeEditable {
		t.Errorf("mode = %q, want editable", mode)
	}
}

func TestAreaAccessMode_Invitee_Editable(t *testing.T) {
	svc, _ := setupCheckout()
	areaID := "pa-tms-007-02"
	co, _ := svc.Checkout(inviteEditorDID, areaID, invitePiCDID)
	svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	mode, err := svc.AreaAccessMode(inviteeAlpha, areaID)
	if err != nil {
		t.Fatalf("AreaAccessMode: %v", err)
	}
	if mode != models.AccessModeEditable {
		t.Errorf("mode = %q, want editable", mode)
	}
}

func TestAreaAccessMode_NonPiCNonInvitee_ReadOnly(t *testing.T) {
	svc, _ := setupCheckout()
	areaID := "pa-tms-007-03"
	svc.Checkout(inviteEditorDID, areaID, invitePiCDID)

	mode, err := svc.AreaAccessMode(inviteeAlpha, areaID)
	if err != nil {
		t.Fatalf("AreaAccessMode: %v", err)
	}
	if mode != models.AccessModeReadOnly {
		t.Errorf("mode = %q, want read_only", mode)
	}
}

func TestAreaAccessMode_NoCheckout_ReadOnly(t *testing.T) {
	svc, _ := setupCheckout()
	mode, err := svc.AreaAccessMode(inviteEditorDID, "pa-tms-007-04")
	if err != nil {
		t.Fatalf("AreaAccessMode: %v", err)
	}
	if mode != models.AccessModeReadOnly {
		t.Errorf("mode = %q, want read_only (no active checkout)", mode)
	}
}

func TestAreaAccessMode_RevokedInvitation_ReadOnly(t *testing.T) {
	svc, _ := setupCheckout()
	areaID := "pa-tms-007-05"
	co, _ := svc.Checkout(inviteEditorDID, areaID, invitePiCDID)
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	svc.RevokeInvite(inviteEditorDID, inv.ID)

	mode, _ := svc.AreaAccessMode(inviteeAlpha, areaID)
	if mode != models.AccessModeReadOnly {
		t.Errorf("mode = %q, want read_only after revoke", mode)
	}
}

func TestAreaAccessMode_AfterReturn_ReadOnly(t *testing.T) {
	svc, _ := setupCheckout()
	areaID := "pa-tms-007-06"
	co, _ := svc.Checkout(inviteEditorDID, areaID, invitePiCDID)
	svc.Return(invitePiCDID, co.ID)

	mode, _ := svc.AreaAccessMode(invitePiCDID, areaID)
	if mode != models.AccessModeReadOnly {
		t.Errorf("mode = %q, want read_only after return", mode)
	}
}

func TestPlaceAccessMode_AlwaysEditable_Phase1(t *testing.T) {
	svc, _ := setupCheckout()
	mode, err := svc.PlaceAccessMode(invitePiCDID, "place-x")
	if err != nil {
		t.Fatalf("PlaceAccessMode: %v", err)
	}
	if mode != models.AccessModeEditable {
		t.Errorf("mode = %q, want editable (place layer placeholder)", mode)
	}
}

func TestListAccessibleAreas_PiCOnly(t *testing.T) {
	svc, _ := setupCheckout()
	co1, _ := svc.Checkout(inviteEditorDID, "pa-tms-007-10", invitePiCDID)
	svc.Checkout(inviteEditorDID, "pa-tms-007-11", invitePiCDID)

	areas, err := svc.ListAccessibleAreas(invitePiCDID)
	if err != nil {
		t.Fatalf("ListAccessibleAreas: %v", err)
	}
	if len(areas) != 2 {
		t.Fatalf("got %d, want 2", len(areas))
	}
	for _, a := range areas {
		if a.Role != service.AccessibleAreaRolePersonInCharge {
			t.Errorf("area %s: role = %q, want person_in_charge", a.AreaID, a.Role)
		}
		if a.InviteExpiresAt != nil {
			t.Errorf("area %s: InviteExpiresAt should be nil for PiC role", a.AreaID)
		}
	}
	_ = co1
}

func TestListAccessibleAreas_InviteeOnly(t *testing.T) {
	svc, _ := setupCheckout()
	co, _ := svc.Checkout(inviteEditorDID, "pa-tms-007-12", invitePiCDID)
	svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	areas, err := svc.ListAccessibleAreas(inviteeAlpha)
	if err != nil {
		t.Fatalf("ListAccessibleAreas: %v", err)
	}
	if len(areas) != 1 {
		t.Fatalf("got %d, want 1", len(areas))
	}
	if areas[0].Role != service.AccessibleAreaRoleInvitee {
		t.Errorf("role = %q, want invitee", areas[0].Role)
	}
	if areas[0].InviteExpiresAt == nil {
		t.Error("InviteExpiresAt should be set for invitee role")
	}
}

func TestListAccessibleAreas_PiCAndInvitee_NoDuplicate(t *testing.T) {
	svc, _ := setupCheckout()
	svc.Checkout(inviteEditorDID, "pa-tms-007-13", invitePiCDID)
	co2, _ := svc.Checkout(inviteEditorDID, "pa-tms-007-14", inviteeAlpha)
	svc.Invite(inviteEditorDID, co2.ID, invitePiCDID, 0)

	areas, err := svc.ListAccessibleAreas(invitePiCDID)
	if err != nil {
		t.Fatalf("ListAccessibleAreas: %v", err)
	}
	if len(areas) != 2 {
		t.Fatalf("got %d, want 2 (PiC+invitee on different checkouts)", len(areas))
	}
	roles := map[service.AccessibleAreaRole]int{}
	for _, a := range areas {
		roles[a.Role]++
	}
	if roles[service.AccessibleAreaRolePersonInCharge] != 1 || roles[service.AccessibleAreaRoleInvitee] != 1 {
		t.Errorf("role counts = %v, want one of each", roles)
	}
}

func TestListAccessibleAreas_ExcludesReturned(t *testing.T) {
	svc, _ := setupCheckout()
	co, _ := svc.Checkout(inviteEditorDID, "pa-tms-007-15", invitePiCDID)
	svc.Return(invitePiCDID, co.ID)

	areas, _ := svc.ListAccessibleAreas(invitePiCDID)
	if len(areas) != 0 {
		t.Errorf("got %d, want 0 (returned checkout excluded)", len(areas))
	}
}

func TestListAccessibleAreas_ExcludesRevokedInvitation(t *testing.T) {
	svc, _ := setupCheckout()
	co, _ := svc.Checkout(inviteEditorDID, "pa-tms-007-16", invitePiCDID)
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	svc.RevokeInvite(inviteEditorDID, inv.ID)

	areas, _ := svc.ListAccessibleAreas(inviteeAlpha)
	if len(areas) != 0 {
		t.Errorf("got %d, want 0 (revoked invitation excluded)", len(areas))
	}
}

// --- 編集メンバー → 活動メンバー 担当者移譲 ---

func TestReassignPersonInCharge_EditorSelfToMemberHandover(t *testing.T) {
	svc, repos := setupCheckout()
	areaID := "pa-tms-006-08"

	co, err := svc.Checkout(inviteEditorDID, areaID, inviteEditorDID)
	if err != nil {
		t.Fatalf("editor self-assign: %v", err)
	}

	_, err = svc.RecordVisit(inviteEditorDID, co.ID, "place-x", models.VisitResultMet, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}

	if err := svc.ReassignPersonInCharge(inviteEditorDID, co.ID, invitePiCDID); err != nil {
		t.Fatalf("ReassignPersonInCharge: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.PersonInChargeID != invitePiCDID {
		t.Errorf("PersonInChargeID = %q, want %q", got.PersonInChargeID, invitePiCDID)
	}
	if got.CheckedOutByID != inviteEditorDID {
		t.Errorf("CheckedOutByID = %q, want %q (history preserved)", got.CheckedOutByID, inviteEditorDID)
	}
	if got.Status != models.CheckoutStatusActive {
		t.Errorf("Status = %q, want active (handover preserves checkout)", got.Status)
	}
	records, _ := repos.Checkout.ListVisitRecords(areaID)
	if len(records) == 0 {
		t.Error("editor's visit record should remain attached to the same checkout")
	}
}

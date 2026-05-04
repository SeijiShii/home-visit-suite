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
	svc := service.NewCheckoutService(repos.Checkout, repos.User, repos.Notification)
	return svc, repos
}

// --- Checkout ---

func TestCheckout_Lending_Success(t *testing.T) {
	svc, repos := setupCheckout()

	// 未チェックアウトの区域を使う（富里市の区域）
	areaID := "pa-tms-001-01"
	editorDID := "did:key:z6Mk0003" // editor
	ownerDID := "did:key:z6Mk0010"  // member

	co, err := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, ownerDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.AreaID != areaID {
		t.Errorf("AreaID = %q, want %q", co.AreaID, areaID)
	}
	if co.CheckoutType != models.CheckoutTypeLending {
		t.Errorf("CheckoutType = %q, want lending", co.CheckoutType)
	}
	if co.LentByID != editorDID {
		t.Errorf("LentByID = %q, want %q", co.LentByID, editorDID)
	}
	if co.OwnerID != ownerDID {
		t.Errorf("OwnerID = %q, want %q", co.OwnerID, ownerDID)
	}
	if co.Status != models.CheckoutStatusActive {
		t.Errorf("Status = %q, want active", co.Status)
	}

	// リポジトリに保存されていることを確認
	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got == nil {
		t.Fatal("checkout not found in repository")
	}
}

func TestCheckout_SelfTake_Success(t *testing.T) {
	svc, _ := setupCheckout()

	areaID := "pa-tms-002-01"
	memberDID := "did:key:z6Mk0010"

	co, err := svc.Checkout(memberDID, areaID, models.CheckoutTypeSelfTake, memberDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if co.CheckoutType != models.CheckoutTypeSelfTake {
		t.Errorf("CheckoutType = %q, want self_take", co.CheckoutType)
	}
	if co.LentByID != "" {
		t.Errorf("LentByID = %q, want empty for self_take", co.LentByID)
	}
	if co.OwnerID != memberDID {
		t.Errorf("OwnerID = %q, want %q", co.OwnerID, memberDID)
	}
}

func TestCheckout_ExclusiveLending_Error(t *testing.T) {
	svc, _ := setupCheckout()

	// 最初のチェックアウト
	areaID := "pa-tms-003-01"
	editorDID := "did:key:z6Mk0003"
	_, err := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")
	if err != nil {
		t.Fatalf("first checkout: %v", err)
	}

	// 同じ区域を再チェックアウト → エラー
	_, err = svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0011")
	if err == nil {
		t.Fatal("expected exclusive checkout error")
	}
	if !service.IsCode(err, service.ErrExclusiveCheckout) {
		t.Errorf("error code = %v, want exclusive_checkout", err)
	}
}

func TestCheckout_Lending_MemberDenied(t *testing.T) {
	svc, _ := setupCheckout()

	memberDID := "did:key:z6Mk0010" // member
	_, err := svc.Checkout(memberDID, "pa-tms-004-01", models.CheckoutTypeLending, "did:key:z6Mk0011")
	if err == nil {
		t.Fatal("expected permission denied for member doing lending")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- Return ---

func TestReturn_Success(t *testing.T) {
	svc, repos := setupCheckout()

	// チェックアウト
	areaID := "pa-tms-001-02"
	editorDID := "did:key:z6Mk0003"
	ownerDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, ownerDID)

	// 担当者が返却
	err := svc.Return(ownerDID, co.ID)
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

	// チェックアウト→返却→再返却
	areaID := "pa-tms-001-03"
	editorDID := "did:key:z6Mk0003"
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")
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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")

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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")

	err := svc.ForceReturn("did:key:z6Mk0010", co.ID) // member
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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)
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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

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
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	_, err := svc.RecordVisit(memberDID, co.ID, "place-0001", models.VisitResultRefused, time.Now(), "")
	if err == nil {
		t.Fatal("expected error for empty applicationText with refused status")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestRecordVisit_VacantPossible_NoApplication(t *testing.T) {
	// vacant_possible は申請を伴わないステータス。テキスト指定不要、Request も作成されない
	svc, _ := setupCheckout()

	areaID := "pa-tms-004-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	co, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

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
	inviteEditorDID = "did:key:z6Mk0003" // editor (シードデータ参照)
	inviteOtherEdit = "did:key:z6Mk0004" // 別の editor
	inviteOwnerDID  = "did:key:z6Mk0010" // チェックアウト担当者となる活動メンバー
	inviteeAlpha    = "did:key:z6Mk0011" // 被招待者 A（活動メンバー）
	inviteeBeta     = "did:key:z6Mk0012" // 被招待者 B（活動メンバー）
)

// activeCheckoutForInvite は招待テスト用にアクティブなチェックアウトを生成する。
func activeCheckoutForInvite(t *testing.T, svc service.CheckoutService, areaID string) *models.Checkout {
	t.Helper()
	co, err := svc.Checkout(inviteEditorDID, areaID, models.CheckoutTypeLending, inviteOwnerDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	return co
}

func TestInvite_EditorSuccess(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-01")

	inv, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0) // ttl=0 → デフォルト 24h
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

	// 通知が発行されたか
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

func TestInvite_OwnerCanInvite(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-02")

	// 担当者本人（活動メンバー）が招待発行できる
	_, err := svc.Invite(inviteOwnerDID, co.ID, inviteeAlpha, 0)
	if err != nil {
		t.Fatalf("owner invite: %v", err)
	}
}

func TestInvite_NonOwnerMemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-03")

	// 担当者でも編集メンバーでもない活動メンバーは発行不可
	_, err := svc.Invite(inviteeAlpha, co.ID, inviteeBeta, 0)
	if err == nil {
		t.Fatal("expected permission denied for non-owner non-editor")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestInvite_NonActiveCheckoutError(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-04")
	if err := svc.Return(inviteOwnerDID, co.ID); err != nil {
		t.Fatalf("Return: %v", err)
	}

	// 返却済みチェックアウトに招待はできない
	_, err := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)
	if err == nil {
		t.Fatal("expected error for invite on non-active checkout")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestInvite_OwnerHimselfRejected(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-05")

	_, err := svc.Invite(inviteEditorDID, co.ID, inviteOwnerDID, 0)
	if err == nil {
		t.Fatal("expected error for inviting owner themselves")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestInvite_EditorAsInviteeRejected(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-06")

	// 編集メンバーは元々全区域アクセス可なので被招待者にできない
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
	// 同一被招待者へ再発行 → 既存レコードの ExpiresAt が上書き、新規レコードは作らない
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

func TestRevokeInvite_OwnerCanRevoke(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-10")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	// 担当者（招待者ではない）が取消できる
	if err := svc.RevokeInvite(inviteOwnerDID, inv.ID); err != nil {
		t.Fatalf("owner revoke: %v", err)
	}
}

func TestRevokeInvite_OtherMemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-005-11")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	// 招待者でも担当者でも編集メンバーでもない活動メンバーは取消不可
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

	if err := svc.Return(inviteOwnerDID, co.ID); err != nil {
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

// --- ReassignOwner ---

func TestReassignOwner_EditorSuccess(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-01")

	newOwner := inviteeAlpha
	if err := svc.ReassignOwner(inviteEditorDID, co.ID, newOwner); err != nil {
		t.Fatalf("ReassignOwner: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.OwnerID != newOwner {
		t.Errorf("OwnerID = %q, want %q", got.OwnerID, newOwner)
	}
	// LentByID は維持（履歴）
	if got.LentByID != inviteEditorDID {
		t.Errorf("LentByID = %q, want %q (history preserved)", got.LentByID, inviteEditorDID)
	}
	if !got.UpdatedAt.After(co.UpdatedAt) && !got.UpdatedAt.Equal(co.UpdatedAt) {
		t.Error("UpdatedAt should be advanced")
	}
}

func TestReassignOwner_MemberDenied(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-02")

	// 担当者本人（活動メンバー）でも担当者変更は editor+ 専用なので不可
	err := svc.ReassignOwner(inviteOwnerDID, co.ID, inviteeAlpha)
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

func TestReassignOwner_NonActiveCheckoutError(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-03")
	svc.Return(inviteOwnerDID, co.ID)

	err := svc.ReassignOwner(inviteEditorDID, co.ID, inviteeAlpha)
	if err == nil {
		t.Fatal("expected error for reassign on non-active")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestReassignOwner_NotFoundCheckout(t *testing.T) {
	svc, _ := setupCheckout()
	err := svc.ReassignOwner(inviteEditorDID, "co-nonexistent", inviteeAlpha)
	if err == nil {
		t.Fatal("expected not found")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

func TestReassignOwner_NotFoundNewOwner(t *testing.T) {
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-04")

	err := svc.ReassignOwner(inviteEditorDID, co.ID, "did:key:nonexistent")
	if err == nil {
		t.Fatal("expected not found for unknown new owner")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

func TestReassignOwner_SameOwnerNoOp(t *testing.T) {
	svc, repos := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-05")

	// 同一担当者への再任命は冪等な成功
	if err := svc.ReassignOwner(inviteEditorDID, co.ID, inviteOwnerDID); err != nil {
		t.Fatalf("same-owner reassign should succeed (no-op): %v", err)
	}
	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.OwnerID != inviteOwnerDID {
		t.Errorf("OwnerID changed to %q (want unchanged %q)", got.OwnerID, inviteOwnerDID)
	}
}

func TestReassignOwner_KeepsInvitations(t *testing.T) {
	// 担当者変更後も既存招待は維持される（仕様 Q2）
	svc, _ := setupCheckout()
	co := activeCheckoutForInvite(t, svc, "pa-tms-006-06")
	inv, _ := svc.Invite(inviteEditorDID, co.ID, inviteeAlpha, 0)

	if err := svc.ReassignOwner(inviteEditorDID, co.ID, inviteeBeta); err != nil {
		t.Fatalf("ReassignOwner: %v", err)
	}

	all, _ := svc.ListInvitations(co.ID)
	if len(all) != 1 {
		t.Fatalf("invitation count = %d, want 1 (preserved)", len(all))
	}
	if all[0].ID != inv.ID || all[0].RevokedAt != nil {
		t.Errorf("invitation modified: %+v (want preserved & active)", all[0])
	}
	// InviterID も変えない（仕様 Q2）
	if all[0].InviterID != inviteEditorDID {
		t.Errorf("InviterID = %q, want %q (preserved)", all[0].InviterID, inviteEditorDID)
	}
}

// --- 編集メンバーの自己貸出（自分自身への lending） ---

func TestCheckout_EditorSelfLending(t *testing.T) {
	// editor+ が ownerID == actorID で lending する → OwnerID == LentByID で成立
	// 仕様 docs/wants/05_チェックアウト.md「可用性制約のバイパス」
	// 「訪問記録画面で active チェックアウトを持たない区域に入った編集メンバーが
	//  CTA からその場でチェックアウトを作る」動線で利用される
	svc, _ := setupCheckout()

	co, err := svc.Checkout(inviteEditorDID, "pa-tms-006-07", models.CheckoutTypeLending, inviteEditorDID)
	if err != nil {
		t.Fatalf("self-lending: %v", err)
	}
	if co.OwnerID != inviteEditorDID {
		t.Errorf("OwnerID = %q, want %q", co.OwnerID, inviteEditorDID)
	}
	if co.LentByID != inviteEditorDID {
		t.Errorf("LentByID = %q, want %q (self-lending)", co.LentByID, inviteEditorDID)
	}
	if co.OwnerID != co.LentByID {
		t.Error("self-lending should yield OwnerID == LentByID")
	}
}

// --- ReassignOwner で編集メンバー → 活動メンバーへ移譲（仕様 Q11） ---

func TestReassignOwner_EditorSelfToMemberHandover(t *testing.T) {
	// 編集メンバーが自分でチェックアウト→記録→活動メンバーへ担当者を移譲
	// 仕様 docs/wants/05_チェックアウト.md「編集メンバーから活動メンバーへの担当者移譲」
	svc, repos := setupCheckout()
	areaID := "pa-tms-006-08"

	co, err := svc.Checkout(inviteEditorDID, areaID, models.CheckoutTypeLending, inviteEditorDID)
	if err != nil {
		t.Fatalf("self-lending: %v", err)
	}

	// 編集メンバーが訪問記録を作成
	_, err = svc.RecordVisit(inviteEditorDID, co.ID, "place-x", models.VisitResultMet, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}

	// 活動メンバーへ移譲
	if err := svc.ReassignOwner(inviteEditorDID, co.ID, inviteOwnerDID); err != nil {
		t.Fatalf("ReassignOwner: %v", err)
	}

	got, _ := repos.Checkout.GetCheckout(co.ID)
	if got.OwnerID != inviteOwnerDID {
		t.Errorf("OwnerID = %q, want %q", got.OwnerID, inviteOwnerDID)
	}
	// LentByID は元編集メンバーのまま（履歴）
	if got.LentByID != inviteEditorDID {
		t.Errorf("LentByID = %q, want %q (history preserved)", got.LentByID, inviteEditorDID)
	}
	// チェックアウトは継続（訪問記録は単一チェックアウトで紐付き続ける）
	if got.Status != models.CheckoutStatusActive {
		t.Errorf("Status = %q, want active (handover preserves checkout)", got.Status)
	}
	records, _ := repos.Checkout.ListVisitRecords(areaID)
	if len(records) == 0 {
		t.Error("editor's visit record should remain attached to the same checkout")
	}
}

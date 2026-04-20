package service_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
	"github.com/SeijiShii/home-visit-suite/shared/testdata"
)

func setupActivity() (service.ActivityService, *testdata.Repos) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)
	svc := service.NewActivityService(repos.Activity, repos.User, repos.Notification)
	return svc, repos
}

// --- Checkout ---

func TestCheckout_Lending_Success(t *testing.T) {
	svc, repos := setupActivity()

	// 未チェックアウトの区域を使う（富里市の区域）
	areaID := "pa-tms-001-01"
	editorDID := "did:key:z6Mk0003" // editor
	ownerDID := "did:key:z6Mk0010"  // member

	act, err := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, ownerDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if act.AreaID != areaID {
		t.Errorf("AreaID = %q, want %q", act.AreaID, areaID)
	}
	if act.CheckoutType != models.CheckoutTypeLending {
		t.Errorf("CheckoutType = %q, want lending", act.CheckoutType)
	}
	if act.LentByID != editorDID {
		t.Errorf("LentByID = %q, want %q", act.LentByID, editorDID)
	}
	if act.OwnerID != ownerDID {
		t.Errorf("OwnerID = %q, want %q", act.OwnerID, ownerDID)
	}
	if act.Status != models.ActivityStatusActive {
		t.Errorf("Status = %q, want active", act.Status)
	}

	// リポジトリに保存されていることを確認
	got, _ := repos.Activity.GetActivity(act.ID)
	if got == nil {
		t.Fatal("activity not found in repository")
	}
}

func TestCheckout_SelfTake_Success(t *testing.T) {
	svc, _ := setupActivity()

	areaID := "pa-tms-002-01"
	memberDID := "did:key:z6Mk0010"

	act, err := svc.Checkout(memberDID, areaID, models.CheckoutTypeSelfTake, memberDID)
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if act.CheckoutType != models.CheckoutTypeSelfTake {
		t.Errorf("CheckoutType = %q, want self_take", act.CheckoutType)
	}
	if act.LentByID != "" {
		t.Errorf("LentByID = %q, want empty for self_take", act.LentByID)
	}
	if act.OwnerID != memberDID {
		t.Errorf("OwnerID = %q, want %q", act.OwnerID, memberDID)
	}
}

func TestCheckout_ExclusiveLending_Error(t *testing.T) {
	svc, _ := setupActivity()

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
	svc, _ := setupActivity()

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
	svc, repos := setupActivity()

	// チェックアウト
	areaID := "pa-tms-001-02"
	editorDID := "did:key:z6Mk0003"
	ownerDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, ownerDID)

	// 担当者が返却
	err := svc.Return(ownerDID, act.ID)
	if err != nil {
		t.Fatalf("Return: %v", err)
	}

	got, _ := repos.Activity.GetActivity(act.ID)
	if got.Status != models.ActivityStatusReturned {
		t.Errorf("Status = %q, want returned", got.Status)
	}
	if got.ReturnedAt == nil {
		t.Error("ReturnedAt should be set")
	}
}

func TestReturn_NotActive_Error(t *testing.T) {
	svc, _ := setupActivity()

	// チェックアウト→返却→再返却
	areaID := "pa-tms-001-03"
	editorDID := "did:key:z6Mk0003"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")
	svc.Return("did:key:z6Mk0010", act.ID)

	err := svc.Return("did:key:z6Mk0010", act.ID)
	if err == nil {
		t.Fatal("expected invalid state error for returning non-active activity")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

// --- ForceReturn ---

func TestForceReturn_EditorSuccess(t *testing.T) {
	svc, repos := setupActivity()

	areaID := "pa-tms-002-02"
	editorDID := "did:key:z6Mk0003"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")

	err := svc.ForceReturn(editorDID, act.ID)
	if err != nil {
		t.Fatalf("ForceReturn: %v", err)
	}

	got, _ := repos.Activity.GetActivity(act.ID)
	if got.Status != models.ActivityStatusReturned {
		t.Errorf("Status = %q, want returned", got.Status)
	}
}

func TestForceReturn_MemberDenied(t *testing.T) {
	svc, _ := setupActivity()

	areaID := "pa-tms-002-03"
	editorDID := "did:key:z6Mk0003"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")

	err := svc.ForceReturn("did:key:z6Mk0010", act.ID) // member
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}
}

// --- RecordVisit ---

func TestRecordVisit_Success(t *testing.T) {
	svc, repos := setupActivity()

	areaID := "pa-tms-003-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	vr, err := svc.RecordVisit(memberDID, act.ID, "place-0001", models.VisitResultMet, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.ActivityID != act.ID {
		t.Errorf("ActivityID = %q, want %q", vr.ActivityID, act.ID)
	}
	if vr.Result != models.VisitResultMet {
		t.Errorf("Result = %q, want met", vr.Result)
	}

	records, _ := repos.Activity.ListVisitRecords(areaID)
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
	svc, _ := setupActivity()

	areaID := "pa-tms-003-03"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)
	svc.Return(memberDID, act.ID)

	_, err := svc.RecordVisit(memberDID, act.ID, "place-0001", models.VisitResultMet, time.Now(), "")
	if err == nil {
		t.Fatal("expected error for recording visit on non-active activity")
	}
	if !service.IsCode(err, service.ErrInvalidState) {
		t.Errorf("error code = %v, want invalid_state", err)
	}
}

func TestRecordVisit_Refused_CreatesRequest(t *testing.T) {
	svc, repos := setupActivity()

	areaID := "pa-tms-002-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	text := "玄関先で『今後一切来ないでほしい』との明確な意思表示あり"
	vr, err := svc.RecordVisit(memberDID, act.ID, "place-0001", models.VisitResultRefused, time.Now(), text)
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
	if req.AreaID != act.AreaID {
		t.Errorf("Request.AreaID = %q, want %q", req.AreaID, act.AreaID)
	}
	if req.Status != models.RequestStatusPending {
		t.Errorf("Request.Status = %q, want pending", req.Status)
	}
}

func TestRecordVisit_VacantAbandoned_CreatesMapUpdateRequest(t *testing.T) {
	svc, repos := setupActivity()

	areaID := "pa-tms-002-03"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	text := "完全に廃屋。屋根が崩落している"
	vr, err := svc.RecordVisit(memberDID, act.ID, "place-0002", models.VisitResultVacantAbandoned, time.Now(), text)
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
	svc, _ := setupActivity()

	areaID := "pa-tms-003-04"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	_, err := svc.RecordVisit(memberDID, act.ID, "place-0001", models.VisitResultRefused, time.Now(), "")
	if err == nil {
		t.Fatal("expected error for empty applicationText with refused status")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

func TestRecordVisit_VacantPossible_NoApplication(t *testing.T) {
	// vacant_possible は申請を伴わないステータス。テキスト指定不要、Request も作成されない
	svc, _ := setupActivity()

	areaID := "pa-tms-004-02"
	editorDID := "did:key:z6Mk0003"
	memberDID := "did:key:z6Mk0010"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, memberDID)

	vr, err := svc.RecordVisit(memberDID, act.ID, "place-0003", models.VisitResultVacantPossible, time.Now(), "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.AppliedRequestID != nil {
		t.Errorf("AppliedRequestID = %v, want nil for vacant_possible", vr.AppliedRequestID)
	}
}

// --- AssignTeam ---

func TestAssignTeam_Success(t *testing.T) {
	svc, repos := setupActivity()

	areaID := "pa-tms-004-01"
	editorDID := "did:key:z6Mk0003"
	act, _ := svc.Checkout(editorDID, areaID, models.CheckoutTypeLending, "did:key:z6Mk0010")

	date := time.Date(2026, 3, 25, 0, 0, 0, 0, time.UTC)
	err := svc.AssignTeam(editorDID, act.ID, "team-01", date)
	if err != nil {
		t.Fatalf("AssignTeam: %v", err)
	}

	assigns, _ := repos.Activity.ListAssignments(act.ID)
	if len(assigns) == 0 {
		t.Error("expected assignment")
	}
}

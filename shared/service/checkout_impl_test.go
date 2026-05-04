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

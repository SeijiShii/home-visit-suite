package service_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// --- helpers ---

type schedFixture struct {
	svc       service.SchedulePeriodService
	covRepo   *repository.InMemoryCoverageRepository
	userRepo  *repository.InMemoryUserRepository
	notifRepo *repository.InMemoryNotificationRepository
}

func newSchedFixture(t *testing.T) *schedFixture {
	t.Helper()
	cov := repository.NewInMemoryCoverageRepository()
	u := repository.NewInMemoryUserRepository()
	n := repository.NewInMemoryNotificationRepository()
	svc := service.NewSchedulePeriodService(cov, u, n, nil)
	return &schedFixture{svc: svc, covRepo: cov, userRepo: u, notifRepo: n}
}

func (f *schedFixture) saveUser(t *testing.T, id string, role models.Role) {
	t.Helper()
	if err := f.userRepo.SaveUser(&models.User{ID: id, Name: id, Role: role, JoinedAt: time.Now()}); err != nil {
		t.Fatalf("save user: %v", err)
	}
}

func (f *schedFixture) saveGroup(t *testing.T, id, name string) {
	t.Helper()
	if err := f.userRepo.SaveGroup(&models.Group{ID: id, Name: name}); err != nil {
		t.Fatalf("save group: %v", err)
	}
}

// =============================================================================
// ApproveSchedulePeriod
// =============================================================================

func TestApproveSchedulePeriod_AdminSucceeds(t *testing.T) {
	f := newSchedFixture(t)
	f.saveUser(t, "admin-1", models.RoleAdmin)

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 3, 31))
	if err := f.svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if err := f.svc.ApproveSchedulePeriod("admin-1", "sp-1"); err != nil {
		t.Fatalf("ApproveSchedulePeriod: %v", err)
	}

	got, _ := f.svc.GetSchedulePeriod("sp-1")
	if !got.Approved {
		t.Errorf("Approved = false, want true")
	}

	logs, _ := f.notifRepo.ListAuditLogs("")
	if len(logs) != 1 {
		t.Fatalf("audit log count = %d, want 1", len(logs))
	}
	if logs[0].Action != models.AuditActionApproval {
		t.Errorf("audit action = %v, want approval", logs[0].Action)
	}
	if logs[0].TargetID != "sp-1" {
		t.Errorf("audit targetID = %q, want sp-1", logs[0].TargetID)
	}
}

func TestApproveSchedulePeriod_NonAdminDenied(t *testing.T) {
	f := newSchedFixture(t)
	f.saveUser(t, "editor-1", models.RoleEditor)

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 3, 31))
	_ = f.svc.CreateSchedulePeriod(sp)

	err := f.svc.ApproveSchedulePeriod("editor-1", "sp-1")
	if err == nil {
		t.Fatal("expected permission denied")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error code = %v, want permission_denied", err)
	}

	got, _ := f.svc.GetSchedulePeriod("sp-1")
	if got.Approved {
		t.Errorf("Approved should remain false on denied approval")
	}
}

func TestApproveSchedulePeriod_NotFound(t *testing.T) {
	f := newSchedFixture(t)
	f.saveUser(t, "admin-1", models.RoleAdmin)

	err := f.svc.ApproveSchedulePeriod("admin-1", "sp-missing")
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error = %v, want not_found", err)
	}
}

func TestRevokeSchedulePeriodApproval_AdminSucceeds(t *testing.T) {
	f := newSchedFixture(t)
	f.saveUser(t, "admin-1", models.RoleAdmin)

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 3, 31))
	_ = f.svc.CreateSchedulePeriod(sp)
	_ = f.svc.ApproveSchedulePeriod("admin-1", "sp-1")

	if err := f.svc.RevokeSchedulePeriodApproval("admin-1", "sp-1"); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	got, _ := f.svc.GetSchedulePeriod("sp-1")
	if got.Approved {
		t.Errorf("Approved = true, want false after revoke")
	}
}

// =============================================================================
// CreateScopesFromGroups
// =============================================================================

func TestCreateScopesFromGroups_Success(t *testing.T) {
	f := newSchedFixture(t)
	f.saveGroup(t, "g-1", "Group A")
	f.saveGroup(t, "g-2", "Group B")

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	_ = f.svc.CreateSchedulePeriod(sp)

	created, err := f.svc.CreateScopesFromGroups("sp-1", []string{"g-1", "g-2"})
	if err != nil {
		t.Fatalf("CreateScopesFromGroups: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("created count = %d, want 2", len(created))
	}

	names := map[string]bool{}
	for _, sc := range created {
		if sc.GroupID == "" {
			t.Errorf("scope %q missing GroupID", sc.ID)
		}
		names[sc.Name] = true
	}
	if !names["Group A"] || !names["Group B"] {
		t.Errorf("scope names = %v, want both group names", names)
	}
}

func TestCreateScopesFromGroups_GroupNotFound(t *testing.T) {
	f := newSchedFixture(t)
	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	_ = f.svc.CreateSchedulePeriod(sp)

	_, err := f.svc.CreateScopesFromGroups("sp-1", []string{"g-missing"})
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error = %v, want not_found", err)
	}
}

func TestCreateScopesFromGroups_DuplicateGroupInPeriod(t *testing.T) {
	f := newSchedFixture(t)
	f.saveGroup(t, "g-1", "Group A")

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	_ = f.svc.CreateSchedulePeriod(sp)

	if _, err := f.svc.CreateScopesFromGroups("sp-1", []string{"g-1"}); err != nil {
		t.Fatalf("first call: %v", err)
	}
	_, err := f.svc.CreateScopesFromGroups("sp-1", []string{"g-1"})
	if !service.IsCode(err, service.ErrAlreadyExists) {
		t.Errorf("error = %v, want already_exists", err)
	}
}

func TestCreateScopesFromGroups_PeriodNotFound(t *testing.T) {
	f := newSchedFixture(t)
	f.saveGroup(t, "g-1", "Group A")

	_, err := f.svc.CreateScopesFromGroups("sp-missing", []string{"g-1"})
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error = %v, want not_found", err)
	}
}

// =============================================================================
// AreaAvailability
// =============================================================================

func setupScopeWithPeriod(t *testing.T, f *schedFixture) {
	t.Helper()
	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := f.svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup period: %v", err)
	}
	sc := newScope("scope-1", "sp-1", []string{"pa-001"})
	if err := f.svc.CreateScope(sc); err != nil {
		t.Fatalf("setup scope: %v", err)
	}
}

func makeAvailability(id, scopeID, areaID string, typ models.AvailabilityType, start, end time.Time) *models.AreaAvailability {
	return &models.AreaAvailability{
		ID:        id,
		ScopeID:   scopeID,
		AreaID:    areaID,
		Type:      typ,
		StartDate: start,
		EndDate:   end,
	}
}

func TestCreateAreaAvailability_LendableSuccess(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	aa := makeAvailability("aa-1", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	if err := f.svc.CreateAreaAvailability(aa); err != nil {
		t.Fatalf("CreateAreaAvailability: %v", err)
	}

	list, _ := f.svc.ListAreaAvailabilities("scope-1")
	if len(list) != 1 {
		t.Errorf("list len = %d, want 1", len(list))
	}
}

func TestCreateAreaAvailability_InvalidType(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	aa := makeAvailability("aa-1", "scope-1", "area-1",
		models.AvailabilityType("bogus"), makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	err := f.svc.CreateAreaAvailability(aa)
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error = %v, want invalid_input", err)
	}
}

func TestCreateAreaAvailability_PeriodOutsideSchedule(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	// schedule period is 2026-01-01 .. 2026-06-30
	aa := makeAvailability("aa-1", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2025, 12, 1), makeDate(2026, 2, 1))
	err := f.svc.CreateAreaAvailability(aa)
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error = %v, want invalid_input (out of range)", err)
	}
}

func TestCreateAreaAvailability_InvalidDates(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	aa := makeAvailability("aa-1", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2026, 3, 1), makeDate(2026, 2, 1))
	err := f.svc.CreateAreaAvailability(aa)
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error = %v, want invalid_input", err)
	}
}

func TestCreateAreaAvailability_ScopeNotFound(t *testing.T) {
	f := newSchedFixture(t)
	aa := makeAvailability("aa-1", "scope-missing", "area-1",
		models.AvailabilityLendable, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	err := f.svc.CreateAreaAvailability(aa)
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error = %v, want not_found", err)
	}
}

func TestCreateAreaAvailability_SelfTakeRequiresLendable(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	st := makeAvailability("aa-st", "scope-1", "area-1",
		models.AvailabilitySelfTake, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	err := f.svc.CreateAreaAvailability(st)
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error = %v, want invalid_input (no lendable)", err)
	}
}

func TestCreateAreaAvailability_SelfTakeWithCoveringLendable(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	lend := makeAvailability("aa-lend", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2026, 1, 15), makeDate(2026, 4, 1))
	if err := f.svc.CreateAreaAvailability(lend); err != nil {
		t.Fatalf("setup lendable: %v", err)
	}

	st := makeAvailability("aa-st", "scope-1", "area-1",
		models.AvailabilitySelfTake, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	if err := f.svc.CreateAreaAvailability(st); err != nil {
		t.Errorf("self_take with covering lendable should succeed: %v", err)
	}
}

func TestCreateAreaAvailability_SelfTakeExceedsLendable(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	lend := makeAvailability("aa-lend", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	_ = f.svc.CreateAreaAvailability(lend)

	// self_take extends beyond lendable end
	st := makeAvailability("aa-st", "scope-1", "area-1",
		models.AvailabilitySelfTake, makeDate(2026, 2, 1), makeDate(2026, 4, 1))
	err := f.svc.CreateAreaAvailability(st)
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error = %v, want invalid_input (self_take exceeds lendable)", err)
	}
}

func TestDeleteAreaAvailability(t *testing.T) {
	f := newSchedFixture(t)
	setupScopeWithPeriod(t, f)

	aa := makeAvailability("aa-1", "scope-1", "area-1",
		models.AvailabilityLendable, makeDate(2026, 2, 1), makeDate(2026, 3, 1))
	_ = f.svc.CreateAreaAvailability(aa)

	if err := f.svc.DeleteAreaAvailability("aa-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	list, _ := f.svc.ListAreaAvailabilities("scope-1")
	if len(list) != 0 {
		t.Errorf("list len = %d, want 0 after delete", len(list))
	}
}

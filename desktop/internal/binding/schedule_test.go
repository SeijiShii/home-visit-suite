package binding_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

func setupScheduleBinding(t *testing.T) (*binding.ScheduleBinding, *repository.InMemoryUserRepository) {
	t.Helper()
	cov := repository.NewInMemoryCoverageRepository()
	user := repository.NewInMemoryUserRepository()
	notif := repository.NewInMemoryNotificationRepository()
	svc := service.NewSchedulePeriodService(cov, user, notif, nil)
	return binding.NewScheduleBinding(svc), user
}

func dt(y, m, d int) time.Time {
	return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
}

func TestScheduleBinding_CRUDPeriod(t *testing.T) {
	b, _ := setupScheduleBinding(t)

	sp := &models.SchedulePeriod{
		ID: "sp-1", Name: "Q1", StartDate: dt(2026, 1, 1), EndDate: dt(2026, 3, 31),
	}
	if err := b.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("CreateSchedulePeriod: %v", err)
	}

	list, err := b.ListSchedulePeriods()
	if err != nil || len(list) != 1 {
		t.Fatalf("ListSchedulePeriods len=%d err=%v", len(list), err)
	}

	got, err := b.GetSchedulePeriod("sp-1")
	if err != nil || got.Name != "Q1" {
		t.Fatalf("GetSchedulePeriod: %v %+v", err, got)
	}

	got.Name = "Q1-renamed"
	if err := b.UpdateSchedulePeriod(got); err != nil {
		t.Fatalf("UpdateSchedulePeriod: %v", err)
	}

	if err := b.DeleteSchedulePeriod("sp-1"); err != nil {
		t.Fatalf("DeleteSchedulePeriod: %v", err)
	}
}

func TestScheduleBinding_Approve(t *testing.T) {
	b, userRepo := setupScheduleBinding(t)
	_ = userRepo.SaveUser(&models.User{ID: "admin-1", Role: models.RoleAdmin, JoinedAt: time.Now()})

	sp := &models.SchedulePeriod{ID: "sp-1", Name: "Q1", StartDate: dt(2026, 1, 1), EndDate: dt(2026, 3, 31)}
	_ = b.CreateSchedulePeriod(sp)

	if err := b.ApproveSchedulePeriod("admin-1", "sp-1"); err != nil {
		t.Fatalf("ApproveSchedulePeriod: %v", err)
	}
	got, _ := b.GetSchedulePeriod("sp-1")
	if !got.Approved {
		t.Errorf("Approved = false, want true")
	}

	if err := b.RevokeSchedulePeriodApproval("admin-1", "sp-1"); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
}

func TestScheduleBinding_ScopeAndAvailability(t *testing.T) {
	b, _ := setupScheduleBinding(t)

	sp := &models.SchedulePeriod{ID: "sp-1", Name: "Q1", StartDate: dt(2026, 1, 1), EndDate: dt(2026, 6, 30)}
	_ = b.CreateSchedulePeriod(sp)

	sc := &models.Scope{ID: "scope-1", SchedulePeriodID: "sp-1", Name: "scope-1", ParentAreaIDs: []string{"pa-1"}}
	if err := b.CreateScope(sc); err != nil {
		t.Fatalf("CreateScope: %v", err)
	}

	scopes, _ := b.ListScopes("sp-1")
	if len(scopes) != 1 {
		t.Errorf("scopes len = %d, want 1", len(scopes))
	}

	aa := &models.AreaAvailability{
		ID: "aa-1", ScopeID: "scope-1", AreaID: "area-1",
		Type: models.AvailabilityLendable, StartDate: dt(2026, 2, 1), EndDate: dt(2026, 3, 1),
	}
	if err := b.CreateAreaAvailability(aa); err != nil {
		t.Fatalf("CreateAreaAvailability: %v", err)
	}

	list, _ := b.ListAreaAvailabilities("scope-1")
	if len(list) != 1 {
		t.Errorf("availabilities len = %d, want 1", len(list))
	}

	if err := b.DeleteAreaAvailability("aa-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := b.DeleteScope("scope-1"); err != nil {
		t.Fatalf("DeleteScope: %v", err)
	}
}

func TestScheduleBinding_CreateScopesFromGroups(t *testing.T) {
	b, userRepo := setupScheduleBinding(t)
	_ = userRepo.SaveGroup(&models.Group{ID: "g-1", Name: "Group A"})

	sp := &models.SchedulePeriod{ID: "sp-1", Name: "Q1", StartDate: dt(2026, 1, 1), EndDate: dt(2026, 6, 30)}
	_ = b.CreateSchedulePeriod(sp)

	created, err := b.CreateScopesFromGroups("sp-1", []string{"g-1"})
	if err != nil {
		t.Fatalf("CreateScopesFromGroups: %v", err)
	}
	if len(created) != 1 || created[0].Name != "Group A" {
		t.Errorf("created = %+v", created)
	}
}

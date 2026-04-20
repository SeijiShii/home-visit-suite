package repository_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newNotificationRepo() *repository.InMemoryNotificationRepository {
	return repository.NewInMemoryNotificationRepository()
}

func TestNotification_SaveAndList(t *testing.T) {
	repo := newNotificationRepo()
	repo.SaveNotification(&models.Notification{ID: "n1", TargetID: "u1", Type: models.NotificationTypeLending})
	repo.SaveNotification(&models.Notification{ID: "n2", TargetID: "u1", Type: models.NotificationTypeReturn})
	repo.SaveNotification(&models.Notification{ID: "n3", TargetID: "u2", Type: models.NotificationTypeLending})

	list, _ := repo.ListNotifications("u1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestNotification_MarkRead(t *testing.T) {
	repo := newNotificationRepo()
	repo.SaveNotification(&models.Notification{ID: "n1", TargetID: "u1", Read: false})

	if err := repo.MarkNotificationRead("n1"); err != nil {
		t.Fatalf("MarkNotificationRead: %v", err)
	}

	list, _ := repo.ListNotifications("u1")
	if !list[0].Read {
		t.Error("notification should be marked as read")
	}
}

func TestRequest_SaveAndList(t *testing.T) {
	repo := newNotificationRepo()
	repo.SaveRequest(&models.Request{ID: "req-1", AreaID: "a1", Type: models.RequestTypePlaceAdd, Status: models.RequestStatusPending})
	repo.SaveRequest(&models.Request{ID: "req-2", AreaID: "a1", Type: models.RequestTypeDoNotVisit, Status: models.RequestStatusResolved})
	repo.SaveRequest(&models.Request{ID: "req-3", AreaID: "a2", Type: models.RequestTypePlaceAdd, Status: models.RequestStatusPending})

	list, _ := repo.ListRequests("a1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestRequest_PlaceID_RoundTrip(t *testing.T) {
	repo := newNotificationRepo()
	repo.SaveRequest(&models.Request{
		ID:          "req-pim",
		AreaID:      "a1",
		Type:        models.RequestTypePlaceInfoModify,
		Status:      models.RequestStatusPending,
		PlaceID:     "place-99",
		Description: "部屋番号修正",
	})

	got, err := repo.GetRequest("req-pim")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if got.PlaceID != "place-99" {
		t.Errorf("PlaceID = %q, want %q", got.PlaceID, "place-99")
	}
}

func TestAuditLog_SaveAndList(t *testing.T) {
	repo := newNotificationRepo()
	repo.SaveAuditLog(&models.AuditLog{ID: "al-1", RegionID: "r1", Action: models.AuditActionRoleChange, Timestamp: time.Now()})
	repo.SaveAuditLog(&models.AuditLog{ID: "al-2", RegionID: "r1", Action: models.AuditActionAreaEdit, Timestamp: time.Now()})
	repo.SaveAuditLog(&models.AuditLog{ID: "al-3", RegionID: "r2", Action: models.AuditActionApproval, Timestamp: time.Now()})

	list, _ := repo.ListAuditLogs("r1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

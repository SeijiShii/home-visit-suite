package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestNotification_Fields(t *testing.T) {
	now := time.Now()
	expires := now.Add(30 * 24 * time.Hour)
	n := models.Notification{
		ID:          "notif-1",
		Type:        models.NotificationTypeLending,
		TargetID:    "did:key:member1",
		ReferenceID: "act-1",
		Message:     "区域NRT-001-05が貸し出されました",
		Read:        false,
		CreatedAt:   now,
		ExpiresAt:   &expires,
	}

	if n.Type != models.NotificationTypeLending {
		t.Errorf("Type = %q, want lending", n.Type)
	}
	if n.Read {
		t.Error("Read should be false initially")
	}
	if n.ExpiresAt == nil || !n.ExpiresAt.Equal(expires) {
		t.Errorf("ExpiresAt = %v, want %v", n.ExpiresAt, expires)
	}
}

func TestNotification_NoExpiry(t *testing.T) {
	n := models.Notification{
		ID:       "notif-2",
		Type:     models.NotificationTypeInvitation,
		TargetID: "did:key:member1",
	}

	if n.ExpiresAt != nil {
		t.Errorf("ExpiresAt = %v, want nil (no expiry)", n.ExpiresAt)
	}
}

func TestNotificationType_Values(t *testing.T) {
	tests := []struct {
		nt   models.NotificationType
		want string
	}{
		{models.NotificationTypeInvitation, "invitation"},
		{models.NotificationTypeLending, "lending"},
		{models.NotificationTypeReturn, "return"},
		{models.NotificationTypeForceReturn, "force_return"},
		{models.NotificationTypeRequestResult, "request_result"},
	}
	for _, tt := range tests {
		if string(tt.nt) != tt.want {
			t.Errorf("NotificationType = %q, want %q", tt.nt, tt.want)
		}
	}
}

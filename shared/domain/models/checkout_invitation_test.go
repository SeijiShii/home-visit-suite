package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestCheckoutInvitation_IsActive_NotRevokedNotExpired(t *testing.T) {
	now := time.Now()
	inv := models.CheckoutInvitation{
		ID:        "inv-1",
		ExpiresAt: now.Add(1 * time.Hour),
	}
	if !inv.IsActive(now) {
		t.Error("IsActive = false, want true (not revoked, not expired)")
	}
}

func TestCheckoutInvitation_IsActive_Expired(t *testing.T) {
	now := time.Now()
	inv := models.CheckoutInvitation{
		ID:        "inv-2",
		ExpiresAt: now.Add(-1 * time.Hour), // 1時間前に期限切れ
	}
	if inv.IsActive(now) {
		t.Error("IsActive = true, want false (expired)")
	}
}

func TestCheckoutInvitation_IsActive_Revoked(t *testing.T) {
	now := time.Now()
	revoked := now.Add(-30 * time.Minute)
	inv := models.CheckoutInvitation{
		ID:        "inv-3",
		ExpiresAt: now.Add(1 * time.Hour),
		RevokedAt: &revoked,
	}
	if inv.IsActive(now) {
		t.Error("IsActive = true, want false (revoked)")
	}
}

func TestCheckoutInvitation_IsActive_AtBoundary(t *testing.T) {
	// ExpiresAt と now が同時刻 → IsActive == false（仕様: now.Before(ExpiresAt)）
	now := time.Now()
	inv := models.CheckoutInvitation{
		ID:        "inv-4",
		ExpiresAt: now,
	}
	if inv.IsActive(now) {
		t.Error("IsActive = true at boundary, want false (now == ExpiresAt is not before)")
	}
}

func TestDefaultCheckoutInviteTTL(t *testing.T) {
	if models.DefaultCheckoutInviteTTL != 24*time.Hour {
		t.Errorf("DefaultCheckoutInviteTTL = %v, want 24h", models.DefaultCheckoutInviteTTL)
	}
}

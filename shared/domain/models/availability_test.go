package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestAreaAvailability_Fields(t *testing.T) {
	now := time.Now()

	aa := models.AreaAvailability{
		ID:           "aa-1",
		ScopeID:      "sc-1",
		AreaID:       "area-1",
		Type:         models.AvailabilityLendable,
		ScopeGroupID: "group-a",
		SetByID:      "did:key:editor1",
		CreatedAt:    now,
	}

	if aa.Type != models.AvailabilityLendable {
		t.Errorf("Type = %q, want lendable", aa.Type)
	}
	if aa.ScopeGroupID != "group-a" {
		t.Errorf("ScopeGroupID = %q, want group-a", aa.ScopeGroupID)
	}
	if aa.SetByID != "did:key:editor1" {
		t.Errorf("SetByID = %q, want did:key:editor1", aa.SetByID)
	}
}

func TestAreaAvailability_AllMembers(t *testing.T) {
	aa := models.AreaAvailability{
		ID:           "aa-2",
		AreaID:       "area-1",
		Type:         models.AvailabilitySelfTake,
		ScopeGroupID: "", // 全メンバー対象
	}

	if aa.ScopeGroupID != "" {
		t.Errorf("ScopeGroupID = %q, want empty (all members)", aa.ScopeGroupID)
	}
}

func TestAvailabilityType_Values(t *testing.T) {
	if string(models.AvailabilityLendable) != "lendable" {
		t.Errorf("AvailabilityLendable = %q, want lendable", models.AvailabilityLendable)
	}
	if string(models.AvailabilitySelfTake) != "self_take" {
		t.Errorf("AvailabilitySelfTake = %q, want self_take", models.AvailabilitySelfTake)
	}
}

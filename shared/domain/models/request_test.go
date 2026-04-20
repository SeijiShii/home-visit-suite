package models_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestRequestType_Values(t *testing.T) {
	tests := []struct {
		rt   models.RequestType
		want string
	}{
		{models.RequestTypePlaceAdd, "place_add"},
		{models.RequestTypePlaceInfoModify, "place_info_modify"},
		{models.RequestTypeMapUpdate, "map_update"},
		{models.RequestTypeDoNotVisit, "do_not_visit"},
	}
	for _, tt := range tests {
		if string(tt.rt) != tt.want {
			t.Errorf("RequestType = %q, want %q", tt.rt, tt.want)
		}
	}
}

func TestRequestStatus_Values(t *testing.T) {
	tests := []struct {
		rs   models.RequestStatus
		want string
	}{
		{models.RequestStatusPending, "pending"},
		{models.RequestStatusOnHold, "on_hold"},
		{models.RequestStatusResolved, "resolved"},
	}
	for _, tt := range tests {
		if string(tt.rs) != tt.want {
			t.Errorf("RequestStatus = %q, want %q", tt.rs, tt.want)
		}
	}
}

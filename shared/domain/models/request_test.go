package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestRequest_PlaceID_PlaceInfoModify(t *testing.T) {
	// place_info_modify は対象 PlaceID が必須
	r := models.Request{
		ID:          "req-1",
		Type:        models.RequestTypePlaceInfoModify,
		Status:      models.RequestStatusPending,
		SubmitterID: "did:key:member",
		AreaID:      "area-1",
		PlaceID:     "place-42",
		Description: "部屋番号が 101 ではなく 1F-A です",
		CreatedAt:   time.Now(),
	}
	if r.PlaceID != "place-42" {
		t.Errorf("PlaceID = %q, want %q", r.PlaceID, "place-42")
	}
}

func TestRequest_PlaceID_PlaceDelete(t *testing.T) {
	// place_delete は対象 PlaceID が必須（削除理由は任意）
	r := models.Request{
		ID:          "req-2",
		Type:        models.RequestTypePlaceDelete,
		Status:      models.RequestStatusPending,
		SubmitterID: "did:key:member",
		AreaID:      "area-1",
		PlaceID:     "place-42",
		Description: "建物が取り壊されている",
		CreatedAt:   time.Now(),
	}
	if r.PlaceID != "place-42" {
		t.Errorf("PlaceID = %q, want %q for place_delete", r.PlaceID, "place-42")
	}
}

func TestRequestType_Values(t *testing.T) {
	tests := []struct {
		rt   models.RequestType
		want string
	}{
		{models.RequestTypePlaceDelete, "place_delete"},
		{models.RequestTypePlaceMove, "place_move"},
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

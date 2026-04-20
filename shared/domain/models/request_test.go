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

func TestRequest_PlaceID_PlaceAddEmpty(t *testing.T) {
	// place_add は PlaceID 空、Coord 必須
	coord := &models.Coordinate{Lat: 35.7, Lng: 140.3}
	r := models.Request{
		ID:          "req-2",
		Type:        models.RequestTypePlaceAdd,
		Status:      models.RequestStatusPending,
		SubmitterID: "did:key:member",
		AreaID:      "area-1",
		Coord:       coord,
		Description: "新築の集合住宅",
		CreatedAt:   time.Now(),
	}
	if r.PlaceID != "" {
		t.Errorf("PlaceID = %q, want empty for place_add", r.PlaceID)
	}
	if r.Coord == nil {
		t.Errorf("Coord = nil, want non-nil for place_add")
	}
}

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

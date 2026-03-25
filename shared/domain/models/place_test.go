package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestPlace_NewFields(t *testing.T) {
	now := time.Now()
	p := models.Place{
		ID:             "place-1",
		AreaID:         "area-1",
		Coord:          models.Coordinate{Lat: 35.7, Lng: 140.3},
		Type:           models.PlaceTypeRoom,
		Label:          "田中",
		DisplayName:    "301",
		ParentID:       "building-1",
		SortOrder:      3,
		Languages:      []string{"en", "zh"},
		DoNotVisit:     true,
		DoNotVisitNote: "表札なし・応答なし",
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if p.DisplayName != "301" {
		t.Errorf("DisplayName = %q, want %q", p.DisplayName, "301")
	}
	if p.SortOrder != 3 {
		t.Errorf("SortOrder = %d, want 3", p.SortOrder)
	}
	if len(p.Languages) != 2 || p.Languages[0] != "en" || p.Languages[1] != "zh" {
		t.Errorf("Languages = %v, want [en zh]", p.Languages)
	}
	if p.DoNotVisitNote != "表札なし・応答なし" {
		t.Errorf("DoNotVisitNote = %q, want 表札なし・応答なし", p.DoNotVisitNote)
	}
	if !p.CreatedAt.Equal(now) {
		t.Errorf("CreatedAt = %v, want %v", p.CreatedAt, now)
	}
	if !p.UpdatedAt.Equal(now) {
		t.Errorf("UpdatedAt = %v, want %v", p.UpdatedAt, now)
	}
}

func TestPlace_Defaults(t *testing.T) {
	p := models.Place{
		ID:     "place-2",
		AreaID: "area-1",
		Type:   models.PlaceTypeHouse,
	}

	if p.DisplayName != "" {
		t.Errorf("DisplayName = %q, want empty", p.DisplayName)
	}
	if p.SortOrder != 0 {
		t.Errorf("SortOrder = %d, want 0", p.SortOrder)
	}
	if p.Languages != nil {
		t.Errorf("Languages = %v, want nil", p.Languages)
	}
	if p.DoNotVisitNote != "" {
		t.Errorf("DoNotVisitNote = %q, want empty", p.DoNotVisitNote)
	}
}

func TestPlace_MaisonetteOrdering(t *testing.T) {
	// メゾネット式: 物理配置順に並べ替え可能であることを検証
	rooms := []models.Place{
		{ID: "r1", DisplayName: "101", SortOrder: 1, ParentID: "b1", Type: models.PlaceTypeRoom},
		{ID: "r2", DisplayName: "201", SortOrder: 2, ParentID: "b1", Type: models.PlaceTypeRoom},
		{ID: "r3", DisplayName: "202", SortOrder: 3, ParentID: "b1", Type: models.PlaceTypeRoom},
		{ID: "r4", DisplayName: "102", SortOrder: 4, ParentID: "b1", Type: models.PlaceTypeRoom},
	}

	// SortOrder順に並んでいることを確認
	for i := 1; i < len(rooms); i++ {
		if rooms[i].SortOrder <= rooms[i-1].SortOrder {
			t.Errorf("rooms[%d].SortOrder (%d) <= rooms[%d].SortOrder (%d)",
				i, rooms[i].SortOrder, i-1, rooms[i-1].SortOrder)
		}
	}

	// DisplayNameは辞書順でないことを確認（メゾネットの特徴）
	if rooms[1].DisplayName < rooms[0].DisplayName && rooms[3].DisplayName < rooms[2].DisplayName {
		t.Error("DisplayName should not be in lexicographic order for maisonette")
	}
}

func TestPlaceType_Values(t *testing.T) {
	tests := []struct {
		pt   models.PlaceType
		want string
	}{
		{models.PlaceTypeHouse, "house"},
		{models.PlaceTypeBuilding, "building"},
		{models.PlaceTypeRoom, "room"},
	}
	for _, tt := range tests {
		if string(tt.pt) != tt.want {
			t.Errorf("PlaceType = %q, want %q", tt.pt, tt.want)
		}
	}
}

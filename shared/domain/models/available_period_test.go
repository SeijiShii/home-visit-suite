package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestAvailablePeriod_Validate_OK(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	p := models.AvailablePeriod{
		ID:            "ap-1",
		Name:          "2026春期キャンペーン",
		StartDate:     now,
		EndDate:       now.AddDate(0, 1, 0),
		ParentAreaIDs: []string{"pa-1", "pa-2"},
		TagIDs:        []string{"apt-1"},
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := p.Validate(); err != nil {
		t.Fatalf("Validate() error = %v, want nil", err)
	}
}

func TestAvailablePeriod_Validate_EmptyName(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	p := models.AvailablePeriod{
		ID:        "ap-1",
		Name:      "",
		StartDate: now,
		EndDate:   now.AddDate(0, 1, 0),
	}
	if err := p.Validate(); err == nil {
		t.Error("Validate() = nil, want error for empty name")
	}
}

func TestAvailablePeriod_Validate_NameTooLong(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	longName := ""
	for i := 0; i < 101; i++ {
		longName += "あ"
	}
	p := models.AvailablePeriod{
		ID:        "ap-1",
		Name:      longName,
		StartDate: now,
		EndDate:   now.AddDate(0, 1, 0),
	}
	if err := p.Validate(); err == nil {
		t.Errorf("Validate() = nil, want error for name length %d", 101)
	}
}

func TestAvailablePeriod_Validate_EndBeforeStart(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	p := models.AvailablePeriod{
		ID:        "ap-1",
		Name:      "test",
		StartDate: now.AddDate(0, 1, 0),
		EndDate:   now,
	}
	if err := p.Validate(); err == nil {
		t.Error("Validate() = nil, want error for end before start")
	}
}

func TestAvailablePeriod_Validate_StartEqualsEnd(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	p := models.AvailablePeriod{
		ID:        "ap-1",
		Name:      "single-day",
		StartDate: now,
		EndDate:   now,
	}
	if err := p.Validate(); err != nil {
		t.Errorf("Validate() = %v, want nil for start==end (single-day allowed)", err)
	}
}

func TestAvailablePeriod_IsActive(t *testing.T) {
	start := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 5, 31, 23, 59, 59, 0, time.UTC)
	p := models.AvailablePeriod{
		StartDate: start,
		EndDate:   end,
	}

	tests := []struct {
		name string
		now  time.Time
		want bool
	}{
		{"before start", start.AddDate(0, 0, -1), false},
		{"at start", start, true},
		{"middle", start.AddDate(0, 0, 15), true},
		{"at end", end, true},
		{"after end", end.AddDate(0, 0, 1), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := p.IsActive(tt.now); got != tt.want {
				t.Errorf("IsActive(%v) = %v, want %v", tt.now, got, tt.want)
			}
		})
	}
}

func TestAvailablePeriod_Phase(t *testing.T) {
	start := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 5, 31, 23, 59, 59, 0, time.UTC)
	p := models.AvailablePeriod{
		StartDate: start,
		EndDate:   end,
	}

	tests := []struct {
		name string
		now  time.Time
		want models.AvailablePeriodPhase
	}{
		{"before start", start.AddDate(0, 0, -1), models.AvailablePeriodPhasePending},
		{"at start", start, models.AvailablePeriodPhaseActive},
		{"middle", start.AddDate(0, 0, 15), models.AvailablePeriodPhaseActive},
		{"at end", end, models.AvailablePeriodPhaseActive},
		{"after end", end.AddDate(0, 0, 1), models.AvailablePeriodPhaseClosed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := p.Phase(tt.now); got != tt.want {
				t.Errorf("Phase(%v) = %v, want %v", tt.now, got, tt.want)
			}
		})
	}
}

func TestAvailablePeriod_Overlaps(t *testing.T) {
	mk := func(s, e string) models.AvailablePeriod {
		st, _ := time.Parse("2006-01-02", s)
		en, _ := time.Parse("2006-01-02", e)
		return models.AvailablePeriod{StartDate: st, EndDate: en}
	}
	a := mk("2026-05-01", "2026-05-31")

	tests := []struct {
		name string
		b    models.AvailablePeriod
		want bool
	}{
		{"non-overlap before", mk("2026-04-01", "2026-04-30"), false},
		{"non-overlap after", mk("2026-06-01", "2026-06-30"), false},
		{"adjacent before (touching end)", mk("2026-04-01", "2026-05-01"), true},
		{"adjacent after (touching start)", mk("2026-05-31", "2026-06-30"), true},
		{"contains", mk("2026-05-10", "2026-05-20"), true},
		{"contained", mk("2026-04-01", "2026-06-30"), true},
		{"identical", mk("2026-05-01", "2026-05-31"), true},
		{"partial overlap left", mk("2026-04-15", "2026-05-15"), true},
		{"partial overlap right", mk("2026-05-15", "2026-06-15"), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := a.Overlaps(tt.b); got != tt.want {
				t.Errorf("Overlaps() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAvailablePeriodTag_Validate_OK(t *testing.T) {
	tag := models.AvailablePeriodTag{
		ID:    "apt-1",
		Name:  "春期",
		Color: "#3b82f6",
	}
	if err := tag.Validate(); err != nil {
		t.Errorf("Validate() = %v, want nil", err)
	}
}

func TestAvailablePeriodTag_Validate_EmptyName(t *testing.T) {
	tag := models.AvailablePeriodTag{ID: "apt-1", Name: ""}
	if err := tag.Validate(); err == nil {
		t.Error("Validate() = nil, want error for empty name")
	}
}

func TestAvailablePeriodTag_Validate_NameTooLong(t *testing.T) {
	long := ""
	for i := 0; i < 17; i++ {
		long += "あ"
	}
	tag := models.AvailablePeriodTag{ID: "apt-1", Name: long}
	if err := tag.Validate(); err == nil {
		t.Errorf("Validate() = nil, want error for name length %d", 17)
	}
}

func TestAvailablePeriodTag_Validate_InvalidColor(t *testing.T) {
	tag := models.AvailablePeriodTag{ID: "apt-1", Name: "春期", Color: "red"}
	if err := tag.Validate(); err == nil {
		t.Error("Validate() = nil, want error for invalid color")
	}
}

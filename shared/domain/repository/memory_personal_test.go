package repository_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newPersonalRepo() *repository.InMemoryPersonalRepository {
	return repository.NewInMemoryPersonalRepository()
}

func TestPersonalNote_SaveAndGet(t *testing.T) {
	repo := newPersonalRepo()
	note := &models.PersonalNote{ID: "pn-1", VisitRecordID: "vr-1", Note: "テスト", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	repo.SavePersonalNote(note)

	got, err := repo.GetPersonalNote("vr-1")
	if err != nil {
		t.Fatalf("GetPersonalNote: %v", err)
	}
	if got.Note != "テスト" {
		t.Errorf("Note = %q, want テスト", got.Note)
	}
}

func TestPersonalNote_NotFound(t *testing.T) {
	repo := newPersonalRepo()
	_, err := repo.GetPersonalNote("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestPersonalTag_SaveAndList(t *testing.T) {
	repo := newPersonalRepo()
	repo.SavePersonalTag(&models.PersonalTag{ID: "pt-1", Name: "要再訪問"})
	repo.SavePersonalTag(&models.PersonalTag{ID: "pt-2", Name: "外国語"})

	list, _ := repo.ListPersonalTags()
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestPersonalTagAssignment_SaveAndList(t *testing.T) {
	repo := newPersonalRepo()
	repo.SavePersonalTagAssignment(&models.PersonalTagAssignment{ID: "pta-1", TagID: "pt-1", VisitRecordID: "vr-1"})
	repo.SavePersonalTagAssignment(&models.PersonalTagAssignment{ID: "pta-2", TagID: "pt-2", VisitRecordID: "vr-1"})
	repo.SavePersonalTagAssignment(&models.PersonalTagAssignment{ID: "pta-3", TagID: "pt-1", VisitRecordID: "vr-2"})

	list, _ := repo.ListPersonalTagAssignments("vr-1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

// --- AppSettings: HiddenTipKeys ---

func TestHiddenTipKeys_EmptyByDefault(t *testing.T) {
	repo := newPersonalRepo()
	got, err := repo.GetHiddenTipKeys()
	if err != nil {
		t.Fatalf("GetHiddenTipKeys: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("want empty, got %v", got)
	}
}

func TestHiddenTipKeys_AddAndGet(t *testing.T) {
	repo := newPersonalRepo()
	if err := repo.AddHiddenTipKey("tips.map.polygon.startDraw"); err != nil {
		t.Fatalf("AddHiddenTipKey: %v", err)
	}
	if err := repo.AddHiddenTipKey("tips.map.polygon.moveVertex"); err != nil {
		t.Fatalf("AddHiddenTipKey: %v", err)
	}
	got, _ := repo.GetHiddenTipKeys()
	if len(got) != 2 {
		t.Fatalf("got %d, want 2: %v", len(got), got)
	}
	set := map[string]bool{got[0]: true, got[1]: true}
	if !set["tips.map.polygon.startDraw"] || !set["tips.map.polygon.moveVertex"] {
		t.Errorf("missing expected keys: %v", got)
	}
}

func TestHiddenTipKeys_AddDuplicate(t *testing.T) {
	repo := newPersonalRepo()
	_ = repo.AddHiddenTipKey("tips.map.polygon.startDraw")
	_ = repo.AddHiddenTipKey("tips.map.polygon.startDraw")
	got, _ := repo.GetHiddenTipKeys()
	if len(got) != 1 {
		t.Errorf("duplicate should be ignored, got %v", got)
	}
}

func TestHiddenTipKeys_Clear(t *testing.T) {
	repo := newPersonalRepo()
	_ = repo.AddHiddenTipKey("tips.map.polygon.startDraw")
	_ = repo.AddHiddenTipKey("tips.map.polygon.moveVertex")
	if err := repo.ClearHiddenTipKeys(); err != nil {
		t.Fatalf("ClearHiddenTipKeys: %v", err)
	}
	got, _ := repo.GetHiddenTipKeys()
	if len(got) != 0 {
		t.Errorf("after clear, want empty, got %v", got)
	}
}

// --- AppSettings: Locale ---

func TestLocale_EmptyByDefault(t *testing.T) {
	repo := newPersonalRepo()
	got, err := repo.GetLocale()
	if err != nil {
		t.Fatalf("GetLocale: %v", err)
	}
	if got != "" {
		t.Errorf("want empty string, got %q", got)
	}
}

func TestLocale_SetAndGet(t *testing.T) {
	repo := newPersonalRepo()
	if err := repo.SetLocale("en"); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}
	got, _ := repo.GetLocale()
	if got != "en" {
		t.Errorf("got %q, want en", got)
	}
	// overwrite
	_ = repo.SetLocale("ja")
	got, _ = repo.GetLocale()
	if got != "ja" {
		t.Errorf("after overwrite, got %q, want ja", got)
	}
}

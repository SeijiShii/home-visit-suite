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

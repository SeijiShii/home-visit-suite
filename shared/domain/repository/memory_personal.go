package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryPersonalRepository struct {
	mu          sync.RWMutex
	notes       map[string]*models.PersonalNote          // key: visitRecordID
	tags        map[string]*models.PersonalTag           // key: tag ID
	assignments map[string]*models.PersonalTagAssignment // key: assignment ID
	hiddenTips  map[string]bool                          // key: tip i18n key
	locale      string
}

func NewInMemoryPersonalRepository() *InMemoryPersonalRepository {
	return &InMemoryPersonalRepository{
		notes:       make(map[string]*models.PersonalNote),
		tags:        make(map[string]*models.PersonalTag),
		assignments: make(map[string]*models.PersonalTagAssignment),
		hiddenTips:  make(map[string]bool),
	}
}

// --- AppSettings: HiddenTipKeys ---

func (r *InMemoryPersonalRepository) GetHiddenTipKeys() ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]string, 0, len(r.hiddenTips))
	for k := range r.hiddenTips {
		result = append(result, k)
	}
	return result, nil
}

func (r *InMemoryPersonalRepository) AddHiddenTipKey(key string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.hiddenTips[key] = true
	return nil
}

func (r *InMemoryPersonalRepository) ClearHiddenTipKeys() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.hiddenTips = make(map[string]bool)
	return nil
}

// --- AppSettings: Locale ---

func (r *InMemoryPersonalRepository) GetLocale() (string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.locale, nil
}

func (r *InMemoryPersonalRepository) SetLocale(locale string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.locale = locale
	return nil
}

// --- PersonalNote ---

func (r *InMemoryPersonalRepository) GetPersonalNote(visitRecordID string) (*models.PersonalNote, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.notes[visitRecordID]
	if !ok {
		return nil, fmt.Errorf("personal note not found for visit record: %s", visitRecordID)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryPersonalRepository) SavePersonalNote(note *models.PersonalNote) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *note
	r.notes[note.VisitRecordID] = &copy
	return nil
}

func (r *InMemoryPersonalRepository) DeletePersonalNote(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for k, v := range r.notes {
		if v.ID == id {
			delete(r.notes, k)
			return nil
		}
	}
	return fmt.Errorf("personal note not found: %s", id)
}

// --- PersonalTag ---

func (r *InMemoryPersonalRepository) ListPersonalTags() ([]models.PersonalTag, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.PersonalTag, 0, len(r.tags))
	for _, v := range r.tags {
		result = append(result, *v)
	}
	return result, nil
}

func (r *InMemoryPersonalRepository) SavePersonalTag(tag *models.PersonalTag) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *tag
	r.tags[tag.ID] = &copy
	return nil
}

func (r *InMemoryPersonalRepository) DeletePersonalTag(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.tags[id]; !ok {
		return fmt.Errorf("personal tag not found: %s", id)
	}
	delete(r.tags, id)
	return nil
}

// --- PersonalTagAssignment ---

func (r *InMemoryPersonalRepository) ListPersonalTagAssignments(visitRecordID string) ([]models.PersonalTagAssignment, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.PersonalTagAssignment
	for _, v := range r.assignments {
		if v.VisitRecordID == visitRecordID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryPersonalRepository) SavePersonalTagAssignment(a *models.PersonalTagAssignment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *a
	r.assignments[a.ID] = &copy
	return nil
}

func (r *InMemoryPersonalRepository) DeletePersonalTagAssignment(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.assignments[id]; !ok {
		return fmt.Errorf("personal tag assignment not found: %s", id)
	}
	delete(r.assignments, id)
	return nil
}

package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryActivityRepository struct {
	mu          sync.RWMutex
	activities  map[string]*models.Activity
	teams       map[string]*models.Team
	assignments map[string]*models.ActivityTeamAssignment
	records     map[string]*models.VisitRecord
	edits       map[string]*models.VisitRecordEdit
}

func NewInMemoryActivityRepository() *InMemoryActivityRepository {
	return &InMemoryActivityRepository{
		activities:  make(map[string]*models.Activity),
		teams:       make(map[string]*models.Team),
		assignments: make(map[string]*models.ActivityTeamAssignment),
		records:     make(map[string]*models.VisitRecord),
		edits:       make(map[string]*models.VisitRecordEdit),
	}
}

// --- Activity ---

func (r *InMemoryActivityRepository) ListActivities(areaID string) ([]models.Activity, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Activity
	for _, v := range r.activities {
		if v.AreaID == areaID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) GetActivity(id string) (*models.Activity, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.activities[id]
	if !ok {
		return nil, fmt.Errorf("activity not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryActivityRepository) GetActiveActivity(areaID string) (*models.Activity, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, v := range r.activities {
		if v.AreaID == areaID && v.Status == models.ActivityStatusActive {
			copy := *v
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("no active activity for area: %s", areaID)
}

func (r *InMemoryActivityRepository) SaveActivity(a *models.Activity) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *a
	r.activities[a.ID] = &copy
	return nil
}

func (r *InMemoryActivityRepository) DeleteActivity(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.activities[id]; !ok {
		return fmt.Errorf("activity not found: %s", id)
	}
	delete(r.activities, id)
	return nil
}

// --- Team ---

func (r *InMemoryActivityRepository) ListTeams() ([]models.Team, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.Team, 0, len(r.teams))
	for _, v := range r.teams {
		result = append(result, *v)
	}
	return result, nil
}

func (r *InMemoryActivityRepository) GetTeam(id string) (*models.Team, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.teams[id]
	if !ok {
		return nil, fmt.Errorf("team not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryActivityRepository) SaveTeam(team *models.Team) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *team
	r.teams[team.ID] = &copy
	return nil
}

func (r *InMemoryActivityRepository) DeleteTeam(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.teams[id]; !ok {
		return fmt.Errorf("team not found: %s", id)
	}
	delete(r.teams, id)
	return nil
}

// --- ActivityTeamAssignment ---

func (r *InMemoryActivityRepository) ListAssignments(activityID string) ([]models.ActivityTeamAssignment, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.ActivityTeamAssignment
	for _, v := range r.assignments {
		if v.ActivityID == activityID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) SaveAssignment(a *models.ActivityTeamAssignment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *a
	r.assignments[a.ID] = &copy
	return nil
}

func (r *InMemoryActivityRepository) DeleteAssignment(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.assignments[id]; !ok {
		return fmt.Errorf("assignment not found: %s", id)
	}
	delete(r.assignments, id)
	return nil
}

// --- VisitRecord ---

func (r *InMemoryActivityRepository) ListVisitRecords(areaID string) ([]models.VisitRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.VisitRecord
	for _, v := range r.records {
		if v.AreaID == areaID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) ListVisitRecordsByPlace(placeID string) ([]models.VisitRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.VisitRecord
	for _, v := range r.records {
		if v.PlaceID == placeID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) ListMyVisitRecordsByPlace(placeID, userID string) ([]models.VisitRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.VisitRecord
	for _, v := range r.records {
		if v.PlaceID == placeID && v.UserID == userID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) GetVisitRecord(id string) (*models.VisitRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.records[id]
	if !ok {
		return nil, fmt.Errorf("visit record not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryActivityRepository) SaveVisitRecord(vr *models.VisitRecord) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *vr
	r.records[vr.ID] = &copy
	return nil
}

func (r *InMemoryActivityRepository) DeleteVisitRecord(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.records[id]; !ok {
		return fmt.Errorf("visit record not found: %s", id)
	}
	delete(r.records, id)
	return nil
}

// --- VisitRecordEdit ---

func (r *InMemoryActivityRepository) ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.VisitRecordEdit
	for _, v := range r.edits {
		if v.VisitRecordID == visitRecordID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryActivityRepository) SaveVisitRecordEdit(edit *models.VisitRecordEdit) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *edit
	r.edits[edit.ID] = &copy
	return nil
}

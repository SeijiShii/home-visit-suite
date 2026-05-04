package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryCheckoutRepository struct {
	mu          sync.RWMutex
	checkouts   map[string]*models.Checkout
	invitations map[string]*models.CheckoutInvitation
	records     map[string]*models.VisitRecord
	edits       map[string]*models.VisitRecordEdit
}

func NewInMemoryCheckoutRepository() *InMemoryCheckoutRepository {
	return &InMemoryCheckoutRepository{
		checkouts:   make(map[string]*models.Checkout),
		invitations: make(map[string]*models.CheckoutInvitation),
		records:     make(map[string]*models.VisitRecord),
		edits:       make(map[string]*models.VisitRecordEdit),
	}
}

// --- Checkout ---

func (r *InMemoryCheckoutRepository) ListCheckouts(areaID string) ([]models.Checkout, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Checkout
	for _, v := range r.checkouts {
		if v.AreaID == areaID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCheckoutRepository) GetCheckout(id string) (*models.Checkout, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.checkouts[id]
	if !ok {
		return nil, fmt.Errorf("checkout not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCheckoutRepository) GetActiveCheckout(areaID string) (*models.Checkout, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, v := range r.checkouts {
		if v.AreaID == areaID && v.Status == models.CheckoutStatusActive {
			copy := *v
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("no active checkout for area: %s", areaID)
}

func (r *InMemoryCheckoutRepository) ListActiveCheckoutsForOwner(ownerID string) ([]models.Checkout, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Checkout
	for _, v := range r.checkouts {
		if v.OwnerID == ownerID && v.Status == models.CheckoutStatusActive {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCheckoutRepository) SaveCheckout(c *models.Checkout) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *c
	r.checkouts[c.ID] = &copy
	return nil
}

func (r *InMemoryCheckoutRepository) DeleteCheckout(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.checkouts[id]; !ok {
		return fmt.Errorf("checkout not found: %s", id)
	}
	delete(r.checkouts, id)
	return nil
}

// --- CheckoutInvitation ---

func (r *InMemoryCheckoutRepository) GetCheckoutInvitation(id string) (*models.CheckoutInvitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.invitations[id]
	if !ok {
		return nil, fmt.Errorf("checkout invitation not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCheckoutRepository) GetCheckoutInvitationByPair(checkoutID, inviteeID string) (*models.CheckoutInvitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, v := range r.invitations {
		if v.CheckoutID == checkoutID && v.InviteeID == inviteeID {
			copy := *v
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *InMemoryCheckoutRepository) ListCheckoutInvitations(checkoutID string) ([]models.CheckoutInvitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.CheckoutInvitation
	for _, v := range r.invitations {
		if v.CheckoutID == checkoutID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCheckoutRepository) ListActiveCheckoutInvitationsForInvitee(inviteeID string) ([]models.CheckoutInvitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.CheckoutInvitation
	for _, v := range r.invitations {
		if v.InviteeID == inviteeID && v.RevokedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCheckoutRepository) SaveCheckoutInvitation(inv *models.CheckoutInvitation) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *inv
	r.invitations[inv.ID] = &copy
	return nil
}

// --- VisitRecord ---

func (r *InMemoryCheckoutRepository) ListVisitRecords(areaID string) ([]models.VisitRecord, error) {
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

func (r *InMemoryCheckoutRepository) ListVisitRecordsByPlace(placeID string) ([]models.VisitRecord, error) {
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

func (r *InMemoryCheckoutRepository) ListMyVisitRecordsByPlace(placeID, userID string) ([]models.VisitRecord, error) {
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

func (r *InMemoryCheckoutRepository) GetVisitRecord(id string) (*models.VisitRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.records[id]
	if !ok {
		return nil, fmt.Errorf("visit record not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCheckoutRepository) SaveVisitRecord(vr *models.VisitRecord) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *vr
	r.records[vr.ID] = &copy
	return nil
}

func (r *InMemoryCheckoutRepository) DeleteVisitRecord(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.records[id]; !ok {
		return fmt.Errorf("visit record not found: %s", id)
	}
	delete(r.records, id)
	return nil
}

// --- VisitRecordEdit ---

func (r *InMemoryCheckoutRepository) ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error) {
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

func (r *InMemoryCheckoutRepository) SaveVisitRecordEdit(edit *models.VisitRecordEdit) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *edit
	r.edits[edit.ID] = &copy
	return nil
}

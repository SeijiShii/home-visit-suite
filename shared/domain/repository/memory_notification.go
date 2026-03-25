package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryNotificationRepository struct {
	mu            sync.RWMutex
	notifications map[string]*models.Notification
	requests      map[string]*models.Request
	auditLogs     map[string]*models.AuditLog
}

func NewInMemoryNotificationRepository() *InMemoryNotificationRepository {
	return &InMemoryNotificationRepository{
		notifications: make(map[string]*models.Notification),
		requests:      make(map[string]*models.Request),
		auditLogs:     make(map[string]*models.AuditLog),
	}
}

// --- Notification ---

func (r *InMemoryNotificationRepository) ListNotifications(targetID string) ([]models.Notification, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Notification
	for _, v := range r.notifications {
		if v.TargetID == targetID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryNotificationRepository) SaveNotification(n *models.Notification) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *n
	r.notifications[n.ID] = &copy
	return nil
}

func (r *InMemoryNotificationRepository) MarkNotificationRead(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.notifications[id]
	if !ok {
		return fmt.Errorf("notification not found: %s", id)
	}
	v.Read = true
	return nil
}

// --- Request ---

func (r *InMemoryNotificationRepository) ListRequests(areaID string) ([]models.Request, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Request
	for _, v := range r.requests {
		if v.AreaID == areaID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryNotificationRepository) GetRequest(id string) (*models.Request, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.requests[id]
	if !ok {
		return nil, fmt.Errorf("request not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryNotificationRepository) SaveRequest(req *models.Request) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *req
	r.requests[req.ID] = &copy
	return nil
}

// --- AuditLog ---

func (r *InMemoryNotificationRepository) ListAuditLogs(regionID string) ([]models.AuditLog, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.AuditLog
	for _, v := range r.auditLogs {
		if v.RegionID == regionID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryNotificationRepository) SaveAuditLog(log *models.AuditLog) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *log
	r.auditLogs[log.ID] = &copy
	return nil
}

package binding

import (
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// ScheduleBinding は予定期間・スコープ・区域可用性のフロントエンド向けAPI。
type ScheduleBinding struct {
	svc    service.SchedulePeriodService
	selfID string
}

func NewScheduleBinding(svc service.SchedulePeriodService, selfID string) *ScheduleBinding {
	return &ScheduleBinding{svc: svc, selfID: selfID}
}

// GetSelfID は LinkSelf が発行した自デバイスの DID を返す。
// 承認操作で actor として利用される。
func (b *ScheduleBinding) GetSelfID() string {
	return b.selfID
}

// --- SchedulePeriod ---

func (b *ScheduleBinding) ListSchedulePeriods() ([]models.SchedulePeriod, error) {
	return b.svc.ListSchedulePeriods()
}

func (b *ScheduleBinding) GetSchedulePeriod(id string) (*models.SchedulePeriod, error) {
	return b.svc.GetSchedulePeriod(id)
}

func (b *ScheduleBinding) CreateSchedulePeriod(sp *models.SchedulePeriod) error {
	return b.svc.CreateSchedulePeriod(sp)
}

func (b *ScheduleBinding) UpdateSchedulePeriod(sp *models.SchedulePeriod) error {
	return b.svc.UpdateSchedulePeriod(sp)
}

func (b *ScheduleBinding) DeleteSchedulePeriod(id string) error {
	return b.svc.DeleteSchedulePeriod(id)
}

func (b *ScheduleBinding) ApproveSchedulePeriod(actorID, id string) error {
	return b.svc.ApproveSchedulePeriod(actorID, id)
}

func (b *ScheduleBinding) RevokeSchedulePeriodApproval(actorID, id string) error {
	return b.svc.RevokeSchedulePeriodApproval(actorID, id)
}

// --- Scope ---

func (b *ScheduleBinding) ListScopes(schedulePeriodID string) ([]models.Scope, error) {
	return b.svc.ListScopes(schedulePeriodID)
}

func (b *ScheduleBinding) GetScope(id string) (*models.Scope, error) {
	return b.svc.GetScope(id)
}

func (b *ScheduleBinding) CreateScope(sc *models.Scope) error {
	return b.svc.CreateScope(sc)
}

func (b *ScheduleBinding) UpdateScope(sc *models.Scope) error {
	return b.svc.UpdateScope(sc)
}

func (b *ScheduleBinding) DeleteScope(id string) error {
	return b.svc.DeleteScope(id)
}

func (b *ScheduleBinding) CreateScopesFromGroups(schedulePeriodID string, groupIDs []string) ([]models.Scope, error) {
	return b.svc.CreateScopesFromGroups(schedulePeriodID, groupIDs)
}

// --- AreaAvailability ---

func (b *ScheduleBinding) ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error) {
	return b.svc.ListAreaAvailabilities(scopeID)
}

func (b *ScheduleBinding) CreateAreaAvailability(aa *models.AreaAvailability) error {
	return b.svc.CreateAreaAvailability(aa)
}

func (b *ScheduleBinding) UpdateAreaAvailability(aa *models.AreaAvailability) error {
	return b.svc.UpdateAreaAvailability(aa)
}

func (b *ScheduleBinding) DeleteAreaAvailability(id string) error {
	return b.svc.DeleteAreaAvailability(id)
}

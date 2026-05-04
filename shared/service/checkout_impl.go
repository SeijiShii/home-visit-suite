package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type checkoutService struct {
	coRepo    domain.CheckoutRepository
	userRepo  domain.UserRepository
	notifRepo domain.NotificationRepository
}

// NewCheckoutService はCheckoutServiceの実装を生成する。
// notifRepo は申請を伴う訪問ステータス（vacant_abandoned / refused）から
// Request を作成する際に使用する。
func NewCheckoutService(coRepo domain.CheckoutRepository, userRepo domain.UserRepository, notifRepo domain.NotificationRepository) CheckoutService {
	return &checkoutService{coRepo: coRepo, userRepo: userRepo, notifRepo: notifRepo}
}

func (s *checkoutService) getActorRole(actorID string) (models.Role, error) {
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return "", Errorf(ErrNotFound, "user not found: %s", actorID)
	}
	return user.Role, nil
}

func (s *checkoutService) Checkout(actorID string, areaID string, checkoutType models.CheckoutType, ownerID string) (*models.Checkout, error) {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return nil, err
	}

	// 権限チェック: lending は editor+ のみ
	if checkoutType == models.CheckoutTypeLending && !role.IsAtLeast(models.RoleEditor) {
		return nil, NewError(ErrPermissionDenied, "lending checkout requires editor or above")
	}

	// 排他的チェックアウト: アクティブなチェックアウトがあればエラー
	existing, _ := s.coRepo.GetActiveCheckout(areaID)
	if existing != nil {
		return nil, Errorf(ErrExclusiveCheckout, "area %s already has active checkout: %s", areaID, existing.ID)
	}

	now := time.Now()
	c := &models.Checkout{
		ID:           fmt.Sprintf("co-%d", now.UnixNano()),
		AreaID:       areaID,
		CheckoutType: checkoutType,
		OwnerID:      ownerID,
		Status:       models.CheckoutStatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if checkoutType == models.CheckoutTypeLending {
		c.LentByID = actorID
	}

	if err := s.coRepo.SaveCheckout(c); err != nil {
		return nil, fmt.Errorf("save checkout: %w", err)
	}
	return c, nil
}

func (s *checkoutService) Return(actorID string, checkoutID string) error {
	c, err := s.coRepo.GetCheckout(checkoutID)
	if err != nil {
		return Errorf(ErrNotFound, "checkout not found: %s", checkoutID)
	}

	if c.Status != models.CheckoutStatusActive {
		return Errorf(ErrInvalidState, "checkout %s is not active (status: %s)", checkoutID, c.Status)
	}

	now := time.Now()
	c.Status = models.CheckoutStatusReturned
	c.ReturnedAt = &now
	c.UpdatedAt = now

	return s.coRepo.SaveCheckout(c)
}

func (s *checkoutService) ForceReturn(actorID string, checkoutID string) error {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return err
	}
	if !role.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "force return requires editor or above")
	}

	return s.Return(actorID, checkoutID)
}

func (s *checkoutService) RecordVisit(actorID string, checkoutID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error) {
	c, err := s.coRepo.GetCheckout(checkoutID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "checkout not found: %s", checkoutID)
	}

	if c.Status != models.CheckoutStatusActive {
		return nil, Errorf(ErrInvalidState, "checkout %s is not active", checkoutID)
	}

	if result.RequiresApplication() && applicationText == "" {
		return nil, Errorf(ErrInvalidInput, "applicationText is required for visit result %q", result)
	}

	now := time.Now()
	vr := &models.VisitRecord{
		ID:         fmt.Sprintf("vr-%d", now.UnixNano()),
		UserID:     actorID,
		PlaceID:    placeID,
		AreaID:     c.AreaID,
		CheckoutID: checkoutID,
		Result:     result,
		VisitedAt:  visitedAt,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if result.RequiresApplication() {
		req := &models.Request{
			ID:          fmt.Sprintf("req-%d", now.UnixNano()),
			Type:        requestTypeForVisitResult(result),
			Status:      models.RequestStatusPending,
			SubmitterID: actorID,
			AreaID:      c.AreaID,
			PlaceID:     placeID,
			Description: applicationText,
			CreatedAt:   now,
		}
		if err := s.notifRepo.SaveRequest(req); err != nil {
			return nil, fmt.Errorf("save request: %w", err)
		}
		reqID := req.ID
		vr.AppliedRequestID = &reqID
	}

	if err := s.coRepo.SaveVisitRecord(vr); err != nil {
		return nil, fmt.Errorf("save visit record: %w", err)
	}
	return vr, nil
}

// RecordVisitAdHoc は Phase 1 暫定: チェックアウト不要で訪問記録を保存する。
// 詳細は CheckoutService インタフェースの doc コメント参照。
func (s *checkoutService) RecordVisitAdHoc(actorID string, areaID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error) {
	if areaID == "" {
		return nil, NewError(ErrInvalidInput, "areaID is required for ad-hoc visit recording")
	}

	if result.RequiresApplication() && applicationText == "" {
		return nil, Errorf(ErrInvalidInput, "applicationText is required for visit result %q", result)
	}

	now := time.Now()
	vr := &models.VisitRecord{
		ID:        fmt.Sprintf("vr-%d", now.UnixNano()),
		UserID:    actorID,
		PlaceID:   placeID,
		AreaID:    areaID,
		Result:    result,
		VisitedAt: visitedAt,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if result.RequiresApplication() {
		req := &models.Request{
			ID:          fmt.Sprintf("req-%d", now.UnixNano()),
			Type:        requestTypeForVisitResult(result),
			Status:      models.RequestStatusPending,
			SubmitterID: actorID,
			AreaID:      areaID,
			PlaceID:     placeID,
			Description: applicationText,
			CreatedAt:   now,
		}
		if err := s.notifRepo.SaveRequest(req); err != nil {
			return nil, fmt.Errorf("save request: %w", err)
		}
		reqID := req.ID
		vr.AppliedRequestID = &reqID
	}

	if err := s.coRepo.SaveVisitRecord(vr); err != nil {
		return nil, fmt.Errorf("save visit record: %w", err)
	}
	return vr, nil
}

// requestTypeForVisitResult は申請を伴う訪問ステータスから対応する RequestType を返す。
func requestTypeForVisitResult(result models.VisitResult) models.RequestType {
	switch result {
	case models.VisitResultVacantAbandoned:
		return models.RequestTypeMapUpdate
	case models.VisitResultRefused:
		return models.RequestTypeDoNotVisit
	default:
		return ""
	}
}

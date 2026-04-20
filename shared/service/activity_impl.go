package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type activityService struct {
	actRepo   domain.ActivityRepository
	userRepo  domain.UserRepository
	notifRepo domain.NotificationRepository
}

// NewActivityService はActivityServiceの実装を生成する。
// notifRepo は申請を伴う訪問ステータス（vacant_abandoned / refused）から
// Request を作成する際に使用する。
func NewActivityService(actRepo domain.ActivityRepository, userRepo domain.UserRepository, notifRepo domain.NotificationRepository) ActivityService {
	return &activityService{actRepo: actRepo, userRepo: userRepo, notifRepo: notifRepo}
}

func (s *activityService) getActorRole(actorID string) (models.Role, error) {
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return "", Errorf(ErrNotFound, "user not found: %s", actorID)
	}
	return user.Role, nil
}

func (s *activityService) Checkout(actorID string, areaID string, checkoutType models.CheckoutType, ownerID string) (*models.Activity, error) {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return nil, err
	}

	// 権限チェック: lending は editor+ のみ
	if checkoutType == models.CheckoutTypeLending && !role.IsAtLeast(models.RoleEditor) {
		return nil, NewError(ErrPermissionDenied, "lending checkout requires editor or above")
	}

	// 排他的チェックアウト: アクティブなActivityがあればエラー
	existing, _ := s.actRepo.GetActiveActivity(areaID)
	if existing != nil {
		return nil, Errorf(ErrExclusiveCheckout, "area %s already has active activity: %s", areaID, existing.ID)
	}

	now := time.Now()
	act := &models.Activity{
		ID:           fmt.Sprintf("act-%d", now.UnixNano()),
		AreaID:       areaID,
		CheckoutType: checkoutType,
		OwnerID:      ownerID,
		Status:       models.ActivityStatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if checkoutType == models.CheckoutTypeLending {
		act.LentByID = actorID
	}

	if err := s.actRepo.SaveActivity(act); err != nil {
		return nil, fmt.Errorf("save activity: %w", err)
	}
	return act, nil
}

func (s *activityService) Return(actorID string, activityID string) error {
	act, err := s.actRepo.GetActivity(activityID)
	if err != nil {
		return Errorf(ErrNotFound, "activity not found: %s", activityID)
	}

	if act.Status != models.ActivityStatusActive {
		return Errorf(ErrInvalidState, "activity %s is not active (status: %s)", activityID, act.Status)
	}

	now := time.Now()
	act.Status = models.ActivityStatusReturned
	act.ReturnedAt = &now
	act.UpdatedAt = now

	return s.actRepo.SaveActivity(act)
}

func (s *activityService) ForceReturn(actorID string, activityID string) error {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return err
	}
	if !role.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "force return requires editor or above")
	}

	return s.Return(actorID, activityID)
}

func (s *activityService) RecordVisit(actorID string, activityID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error) {
	act, err := s.actRepo.GetActivity(activityID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "activity not found: %s", activityID)
	}

	if act.Status != models.ActivityStatusActive {
		return nil, Errorf(ErrInvalidState, "activity %s is not active", activityID)
	}

	if result.RequiresApplication() && applicationText == "" {
		return nil, Errorf(ErrInvalidInput, "applicationText is required for visit result %q", result)
	}

	now := time.Now()
	vr := &models.VisitRecord{
		ID:         fmt.Sprintf("vr-%d", now.UnixNano()),
		UserID:     actorID,
		PlaceID:    placeID,
		AreaID:     act.AreaID,
		ActivityID: activityID,
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
			AreaID:      act.AreaID,
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

	if err := s.actRepo.SaveVisitRecord(vr); err != nil {
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

func (s *activityService) AssignTeam(actorID string, activityID, teamID string, activityDate time.Time) error {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return err
	}
	if !role.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "assign team requires editor or above")
	}

	_, err = s.actRepo.GetActivity(activityID)
	if err != nil {
		return Errorf(ErrNotFound, "activity not found: %s", activityID)
	}

	now := time.Now()
	assign := &models.ActivityTeamAssignment{
		ID:           fmt.Sprintf("ata-%d", now.UnixNano()),
		ActivityID:   activityID,
		TeamID:       teamID,
		ActivityDate: activityDate,
		AssignedAt:   now,
	}

	return s.actRepo.SaveAssignment(assign)
}

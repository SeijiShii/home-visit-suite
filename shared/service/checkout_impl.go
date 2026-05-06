package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type checkoutService struct {
	coRepo     domain.CheckoutRepository
	userRepo   domain.UserRepository
	notifRepo  domain.NotificationRepository
	regionRepo domain.RegionRepository
	apSvc      AvailablePeriodService
}

// NewCheckoutService はCheckoutServiceの実装を生成する。
// notifRepo は申請を伴う訪問ステータス（vacant_abandoned / refused）から
// Request を作成する際に使用する。
// regionRepo / apSvc はチェックアウト発行時の AvailablePeriod 制約バリデーションに使用する。
func NewCheckoutService(
	coRepo domain.CheckoutRepository,
	userRepo domain.UserRepository,
	notifRepo domain.NotificationRepository,
	regionRepo domain.RegionRepository,
	apSvc AvailablePeriodService,
) CheckoutService {
	return &checkoutService{
		coRepo:     coRepo,
		userRepo:   userRepo,
		notifRepo:  notifRepo,
		regionRepo: regionRepo,
		apSvc:      apSvc,
	}
}

func (s *checkoutService) getActorRole(actorID string) (models.Role, error) {
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return "", Errorf(ErrNotFound, "user not found: %s", actorID)
	}
	return user.Role, nil
}

func (s *checkoutService) Checkout(actorID string, areaID string, personInChargeID string) (*models.Checkout, error) {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return nil, err
	}

	if personInChargeID == "" {
		personInChargeID = actorID
	}

	// 権限チェック: 活動メンバーは自分自身を担当者にする場合のみ発行可能
	if !role.IsAtLeast(models.RoleEditor) && personInChargeID != actorID {
		return nil, NewError(ErrPermissionDenied, "members can only checkout for themselves")
	}

	now := time.Now()

	// AvailablePeriod 制約: アクティブな期間が存在し、対象区域の親番が含まれていること
	// 編集メンバーもバイパス不可（仕様 docs/wants/06_網羅管理.md / 09 継続的検討事項）
	period, err := s.apSvc.GetActivePeriod(now)
	if err != nil {
		return nil, fmt.Errorf("get active period: %w", err)
	}
	if period == nil {
		return nil, NewError(ErrInvalidState, "no active AvailablePeriod (cooldown)")
	}

	area, err := s.regionRepo.GetArea(areaID)
	if err != nil || area == nil {
		return nil, Errorf(ErrNotFound, "area not found: %s", areaID)
	}
	if !containsString(period.ParentAreaIDs, area.ParentAreaID) {
		return nil, NewError(ErrPermissionDenied, "area's parent area is not in the active period's targets")
	}

	// 排他的チェックアウト: アクティブなチェックアウトがあればエラー
	existing, _ := s.coRepo.GetActiveCheckout(areaID)
	if existing != nil {
		return nil, Errorf(ErrExclusiveCheckout, "area %s already has active checkout: %s", areaID, existing.ID)
	}

	c := &models.Checkout{
		ID:                fmt.Sprintf("co-%d", now.UnixNano()),
		AreaID:            areaID,
		AvailablePeriodID: period.ID,
		PersonInChargeID:  personInChargeID,
		CheckedOutByID:    actorID,
		Status:            models.CheckoutStatusActive,
		CreatedAt:         now,
		UpdatedAt:         now,
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

	if err := s.coRepo.SaveCheckout(c); err != nil {
		return err
	}

	// 紐づく未失効の招待を一括失効
	// 仕様 docs/wants/05_チェックアウト.md「区域招待 > 失効・取り消し」
	return s.cascadeRevokeInvitations(checkoutID, now)
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

func (s *checkoutService) ReassignPersonInCharge(actorID string, checkoutID string, newPersonInChargeID string) error {
	role, err := s.getActorRole(actorID)
	if err != nil {
		return err
	}
	if !role.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "reassign person in charge requires editor or above")
	}

	c, err := s.coRepo.GetCheckout(checkoutID)
	if err != nil {
		return Errorf(ErrNotFound, "checkout not found: %s", checkoutID)
	}
	if c.Status != models.CheckoutStatusActive {
		return Errorf(ErrInvalidState, "reassign requires active checkout (status: %s)", c.Status)
	}

	if newPersonInChargeID == c.PersonInChargeID {
		return nil // 冪等: 同じ担当者への再任命は no-op で成功
	}

	if _, err := s.userRepo.GetUser(newPersonInChargeID); err != nil {
		return Errorf(ErrNotFound, "new person in charge not found: %s", newPersonInChargeID)
	}

	now := time.Now()
	c.PersonInChargeID = newPersonInChargeID
	c.UpdatedAt = now
	// CheckedOutByID は変更しない（操作履歴として保持）
	// 紐づく招待も維持（仕様: 担当者変更で招待は剥奪されない）
	return s.coRepo.SaveCheckout(c)
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

// --- Invite / RevokeInvite / ListInvitations ---

func (s *checkoutService) Invite(actorID string, checkoutID string, inviteeID string, ttl time.Duration) (*models.CheckoutInvitation, error) {
	if ttl < 0 {
		return nil, NewError(ErrInvalidInput, "ttl must be non-negative")
	}
	if ttl == 0 {
		ttl = models.DefaultCheckoutInviteTTL
	}

	c, err := s.coRepo.GetCheckout(checkoutID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "checkout not found: %s", checkoutID)
	}
	if c.Status != models.CheckoutStatusActive {
		return nil, Errorf(ErrInvalidState, "invite requires active checkout (status: %s)", c.Status)
	}

	// 招待者の権限チェック: editor+ または当該チェックアウトの現担当者
	actorRole, err := s.getActorRole(actorID)
	if err != nil {
		return nil, err
	}
	if !actorRole.IsAtLeast(models.RoleEditor) && actorID != c.PersonInChargeID {
		return nil, NewError(ErrPermissionDenied, "invite requires editor or current checkout person in charge")
	}

	// 被招待者の検証
	if inviteeID == c.PersonInChargeID {
		return nil, NewError(ErrInvalidInput, "cannot invite the person in charge themselves")
	}
	invitee, err := s.userRepo.GetUser(inviteeID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "invitee not found: %s", inviteeID)
	}
	if invitee.Role != models.RoleMember {
		return nil, NewError(ErrInvalidInput, "invitee must be a member (editors/admins already have full access)")
	}

	now := time.Now()
	newExpiresAt := now.Add(ttl)

	// 既存の有効な招待があれば期限延長（上書き）
	existing, _ := s.coRepo.GetCheckoutInvitationByPair(checkoutID, inviteeID)
	if existing != nil && existing.IsActive(now) {
		existing.ExpiresAt = newExpiresAt
		if err := s.coRepo.SaveCheckoutInvitation(existing); err != nil {
			return nil, fmt.Errorf("save invitation: %w", err)
		}
		s.notifyAreaInvite(existing)
		return existing, nil
	}

	inv := &models.CheckoutInvitation{
		ID:         fmt.Sprintf("inv-%d", now.UnixNano()),
		CheckoutID: checkoutID,
		InviteeID:  inviteeID,
		InviterID:  actorID,
		ExpiresAt:  newExpiresAt,
		CreatedAt:  now,
	}
	if err := s.coRepo.SaveCheckoutInvitation(inv); err != nil {
		return nil, fmt.Errorf("save invitation: %w", err)
	}
	s.notifyAreaInvite(inv)
	return inv, nil
}

func (s *checkoutService) RevokeInvite(actorID string, invitationID string) error {
	inv, err := s.coRepo.GetCheckoutInvitation(invitationID)
	if err != nil {
		return Errorf(ErrNotFound, "invitation not found: %s", invitationID)
	}
	if inv.RevokedAt != nil {
		return Errorf(ErrInvalidState, "invitation %s is already revoked", invitationID)
	}

	c, err := s.coRepo.GetCheckout(inv.CheckoutID)
	if err != nil {
		return Errorf(ErrNotFound, "checkout not found: %s", inv.CheckoutID)
	}

	actorRole, err := s.getActorRole(actorID)
	if err != nil {
		return err
	}
	// 取消可能: 招待者本人 / 現担当者 / editor+
	if actorID != inv.InviterID && actorID != c.PersonInChargeID && !actorRole.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "revoke requires inviter, current person in charge, or editor")
	}

	now := time.Now()
	inv.RevokedAt = &now
	return s.coRepo.SaveCheckoutInvitation(inv)
}

func (s *checkoutService) ListInvitations(checkoutID string) ([]models.CheckoutInvitation, error) {
	return s.coRepo.ListCheckoutInvitations(checkoutID)
}

// cascadeRevokeInvitations は当該チェックアウトに紐づく未失効の招待をすべて失効させる。
// Return / ForceReturn から呼び出す。
func (s *checkoutService) cascadeRevokeInvitations(checkoutID string, at time.Time) error {
	invs, err := s.coRepo.ListCheckoutInvitations(checkoutID)
	if err != nil {
		return fmt.Errorf("list invitations for cascade: %w", err)
	}
	for i := range invs {
		inv := &invs[i]
		if inv.RevokedAt != nil {
			continue // 既に取消済み
		}
		inv.RevokedAt = &at
		if err := s.coRepo.SaveCheckoutInvitation(inv); err != nil {
			return fmt.Errorf("cascade revoke %s: %w", inv.ID, err)
		}
	}
	return nil
}

// notifyAreaInvite は被招待者へ区域招待通知を発行する（発行時のみ通知）。
// 仕様 docs/wants/07_通知と申請.md「区域招待: 発行時のみ被招待者のマイページに通知」
func (s *checkoutService) notifyAreaInvite(inv *models.CheckoutInvitation) {
	expires := inv.ExpiresAt
	n := &models.Notification{
		ID:          fmt.Sprintf("ntf-%d", time.Now().UnixNano()),
		Type:        models.NotificationTypeAreaInvite,
		TargetID:    inv.InviteeID,
		ReferenceID: inv.ID,
		CreatedAt:   inv.CreatedAt,
		ExpiresAt:   &expires,
	}
	// 通知の保存失敗はログのみで握りつぶす（招待自体は成立しているため）
	_ = s.notifRepo.SaveNotification(n)
}

// --- アクセスモード判定 ---

func (s *checkoutService) AreaAccessMode(userID string, areaID string) (models.AccessMode, error) {
	// 1. 自分が担当者として active チェックアウトを持っているか
	active, _ := s.coRepo.GetActiveCheckout(areaID)
	if active != nil && active.PersonInChargeID == userID && active.Status == models.CheckoutStatusActive {
		return models.AccessModeEditable, nil
	}

	// 2. 有効な招待を保有しているか（同区域に対するもの）
	invs, err := s.coRepo.ListActiveCheckoutInvitationsForInvitee(userID)
	if err != nil {
		return "", fmt.Errorf("list invitations: %w", err)
	}
	now := time.Now()
	for i := range invs {
		inv := &invs[i]
		if !inv.IsActive(now) {
			continue
		}
		c, err := s.coRepo.GetCheckout(inv.CheckoutID)
		if err != nil {
			continue
		}
		if c.Status != models.CheckoutStatusActive {
			continue
		}
		if c.AreaID == areaID {
			return models.AccessModeEditable, nil
		}
	}

	// 3. 上記いずれにも該当しない → read_only
	//    editor+ は閲覧可（入力には自己チェックアウトが必要）、活動メンバーは UI 側で非表示の前提
	return models.AccessModeReadOnly, nil
}

func (s *checkoutService) PlaceAccessMode(userID string, placeID string) (models.AccessMode, error) {
	// 仕様 docs/wants/05_チェックアウト.md「アクセスモード > 場所レベル」:
	// 「現フェーズではモデルとデータ構造として用意し、UI からの read-only 切替操作は未実装」
	// したがって判定 API は常に editable を返す。場所単位の read-only 化は将来拡張時に実装。
	return models.AccessModeEditable, nil
}

func (s *checkoutService) ListAccessibleAreas(userID string) ([]AccessibleArea, error) {
	var result []AccessibleArea
	seenCheckouts := make(map[string]bool) // 担当者でも被招待者でもある場合の重複排除

	// 担当者として active なチェックアウトを持つ区域
	owned, err := s.coRepo.ListActiveCheckoutsForPersonInCharge(userID)
	if err != nil {
		return nil, fmt.Errorf("list owned checkouts: %w", err)
	}
	for _, c := range owned {
		result = append(result, AccessibleArea{
			AreaID:     c.AreaID,
			CheckoutID: c.ID,
			Role:       AccessibleAreaRolePersonInCharge,
		})
		seenCheckouts[c.ID] = true
	}

	// 有効な招待を保有しているチェックアウトの区域
	invs, err := s.coRepo.ListActiveCheckoutInvitationsForInvitee(userID)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	now := time.Now()
	for i := range invs {
		inv := &invs[i]
		if !inv.IsActive(now) {
			continue
		}
		if seenCheckouts[inv.CheckoutID] {
			continue // 自分が担当者でもある場合は owner として既に計上済み
		}
		c, err := s.coRepo.GetCheckout(inv.CheckoutID)
		if err != nil {
			continue
		}
		if c.Status != models.CheckoutStatusActive {
			continue
		}
		expiresAt := inv.ExpiresAt
		result = append(result, AccessibleArea{
			AreaID:          c.AreaID,
			CheckoutID:      c.ID,
			Role:            AccessibleAreaRoleInvitee,
			InviteExpiresAt: &expiresAt,
		})
		seenCheckouts[c.ID] = true
	}

	return result, nil
}

func containsString(haystack []string, needle string) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}

package service_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// --- helpers ---

func newSchedulePeriodService() service.SchedulePeriodService {
	repo := repository.NewInMemoryCoverageRepository()
	return service.NewSchedulePeriodService(repo)
}

func makeDate(y, m, d int) time.Time {
	return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
}

func newPeriod(id string, start, end time.Time) *models.SchedulePeriod {
	return &models.SchedulePeriod{
		ID:        id,
		Name:      id + "-name",
		StartDate: start,
		EndDate:   end,
	}
}

func newScope(id, periodID string, parentAreaIDs []string) *models.Scope {
	return &models.Scope{
		ID:               id,
		SchedulePeriodID: periodID,
		Name:             id + "-name",
		ParentAreaIDs:    parentAreaIDs,
	}
}

// =============================================================================
// SchedulePeriod tests
// =============================================================================

// TestCreateSchedulePeriod_Success: 正常な期間を登録できる。
func TestCreateSchedulePeriod_Success(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 3, 31))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("CreateSchedulePeriod: %v", err)
	}

	got, err := svc.GetSchedulePeriod("sp-1")
	if err != nil {
		t.Fatalf("GetSchedulePeriod: %v", err)
	}
	if got.ID != "sp-1" {
		t.Errorf("ID = %q, want sp-1", got.ID)
	}
}

// TestCreateSchedulePeriod_InvalidDates: StartDate >= EndDate はエラー。
func TestCreateSchedulePeriod_InvalidDates(t *testing.T) {
	svc := newSchedulePeriodService()

	cases := []struct {
		name  string
		start time.Time
		end   time.Time
	}{
		{"equal", makeDate(2026, 1, 1), makeDate(2026, 1, 1)},
		{"reversed", makeDate(2026, 3, 31), makeDate(2026, 1, 1)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sp := newPeriod("sp-bad-"+tc.name, tc.start, tc.end)
			err := svc.CreateSchedulePeriod(sp)
			if err == nil {
				t.Fatal("expected error for invalid dates")
			}
			if !service.IsCode(err, service.ErrInvalidInput) {
				t.Errorf("error code = %v, want invalid_input", err)
			}
		})
	}
}

// TestCreateSchedulePeriod_OverlapFull: 既存期間に完全に含まれる新規期間はエラー。
func TestCreateSchedulePeriod_OverlapFull(t *testing.T) {
	svc := newSchedulePeriodService()

	// 既存: 2026-01-01 〜 2026-06-30
	existing := newPeriod("sp-existing", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(existing); err != nil {
		t.Fatalf("setup: %v", err)
	}

	// 新規: 2026-03-01 〜 2026-04-30 (完全に内包)
	overlap := newPeriod("sp-overlap", makeDate(2026, 3, 1), makeDate(2026, 4, 30))
	err := svc.CreateSchedulePeriod(overlap)
	if err == nil {
		t.Fatal("expected overlap error")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

// TestCreateSchedulePeriod_OverlapPartial: 既存期間と部分的に重複する新規期間はエラー。
func TestCreateSchedulePeriod_OverlapPartial(t *testing.T) {
	svc := newSchedulePeriodService()

	// 既存: 2026-01-01 〜 2026-06-30
	existing := newPeriod("sp-existing", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(existing); err != nil {
		t.Fatalf("setup: %v", err)
	}

	cases := []struct {
		name  string
		start time.Time
		end   time.Time
	}{
		// 既存の前半にかかる
		{"overlap-start", makeDate(2025, 11, 1), makeDate(2026, 3, 1)},
		// 既存の後半にかかる
		{"overlap-end", makeDate(2026, 5, 1), makeDate(2026, 9, 1)},
		// 既存を完全に含む
		{"overlap-contains", makeDate(2025, 12, 1), makeDate(2026, 8, 1)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sp := newPeriod("sp-"+tc.name, tc.start, tc.end)
			err := svc.CreateSchedulePeriod(sp)
			if err == nil {
				t.Fatalf("expected overlap error")
			}
			if !service.IsCode(err, service.ErrInvalidInput) {
				t.Errorf("error code = %v, want invalid_input", err)
			}
		})
	}
}

// TestCreateSchedulePeriod_AdjacentOK: 隣接する期間（当日終了・翌日開始）は許可される。
func TestCreateSchedulePeriod_AdjacentOK(t *testing.T) {
	svc := newSchedulePeriodService()

	// 既存: 2026-01-01 〜 2026-06-30
	existing := newPeriod("sp-first", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(existing); err != nil {
		t.Fatalf("setup: %v", err)
	}

	cases := []struct {
		name  string
		start time.Time
		end   time.Time
	}{
		// 既存の直後
		{"adjacent-after", makeDate(2026, 7, 1), makeDate(2026, 12, 31)},
		// 既存の直前
		{"adjacent-before", makeDate(2025, 7, 1), makeDate(2025, 12, 31)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sp := newPeriod("sp-"+tc.name, tc.start, tc.end)
			if err := svc.CreateSchedulePeriod(sp); err != nil {
				t.Errorf("expected success for adjacent period, got: %v", err)
			}
		})
	}
}

// TestUpdateSchedulePeriod_OverlapOtherOK: 自分自身との重複は許可される（自己更新）。
func TestUpdateSchedulePeriod_SelfOverlapOK(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-self", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup: %v", err)
	}

	// 同じIDで名前だけ変えて更新
	sp.Name = "updated-name"
	if err := svc.UpdateSchedulePeriod(sp); err != nil {
		t.Errorf("UpdateSchedulePeriod self: %v", err)
	}

	got, _ := svc.GetSchedulePeriod("sp-self")
	if got.Name != "updated-name" {
		t.Errorf("Name = %q, want updated-name", got.Name)
	}
}

// TestDeleteSchedulePeriod_Success: 存在する期間を削除できる。
func TestDeleteSchedulePeriod_Success(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-del", makeDate(2026, 1, 1), makeDate(2026, 3, 31))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if err := svc.DeleteSchedulePeriod("sp-del"); err != nil {
		t.Fatalf("DeleteSchedulePeriod: %v", err)
	}

	_, err := svc.GetSchedulePeriod("sp-del")
	if err == nil {
		t.Error("expected not found after delete")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestDeleteSchedulePeriod_NotFound: 存在しない期間を削除するとエラー。
func TestDeleteSchedulePeriod_NotFound(t *testing.T) {
	svc := newSchedulePeriodService()

	err := svc.DeleteSchedulePeriod("sp-nonexistent")
	if err == nil {
		t.Fatal("expected not_found error")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestListSchedulePeriods_Empty: 空リストは正常に返る。
func TestListSchedulePeriods_Empty(t *testing.T) {
	svc := newSchedulePeriodService()

	list, err := svc.ListSchedulePeriods()
	if err != nil {
		t.Fatalf("ListSchedulePeriods: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("expected empty list, got %d items", len(list))
	}
}

// TestListSchedulePeriods_Multiple: 複数件登録後に全件取得できる。
func TestListSchedulePeriods_Multiple(t *testing.T) {
	svc := newSchedulePeriodService()

	periods := []*models.SchedulePeriod{
		newPeriod("sp-a", makeDate(2025, 1, 1), makeDate(2025, 6, 30)),
		newPeriod("sp-b", makeDate(2025, 7, 1), makeDate(2025, 12, 31)),
		newPeriod("sp-c", makeDate(2026, 1, 1), makeDate(2026, 6, 30)),
	}
	for _, sp := range periods {
		if err := svc.CreateSchedulePeriod(sp); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}

	list, err := svc.ListSchedulePeriods()
	if err != nil {
		t.Fatalf("ListSchedulePeriods: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("expected 3 periods, got %d", len(list))
	}
}

// TestGetSchedulePeriod_NotFound: 存在しない期間を取得するとエラー。
func TestGetSchedulePeriod_NotFound(t *testing.T) {
	svc := newSchedulePeriodService()

	_, err := svc.GetSchedulePeriod("sp-nonexistent")
	if err == nil {
		t.Fatal("expected not_found error")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// =============================================================================
// Scope tests
// =============================================================================

// TestCreateScope_Success: 正常なスコープを登録できる。
func TestCreateScope_Success(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup period: %v", err)
	}

	sc := newScope("scope-1", "sp-1", []string{"pa-001", "pa-002"})
	if err := svc.CreateScope(sc); err != nil {
		t.Fatalf("CreateScope: %v", err)
	}

	got, err := svc.GetScope("scope-1")
	if err != nil {
		t.Fatalf("GetScope: %v", err)
	}
	if got.ID != "scope-1" {
		t.Errorf("ID = %q, want scope-1", got.ID)
	}
	if len(got.ParentAreaIDs) != 2 {
		t.Errorf("ParentAreaIDs len = %d, want 2", len(got.ParentAreaIDs))
	}
}

// TestCreateScope_ParentNotFound: 存在しない SchedulePeriodID はエラー。
func TestCreateScope_ParentNotFound(t *testing.T) {
	svc := newSchedulePeriodService()

	sc := newScope("scope-1", "sp-nonexistent", []string{"pa-001"})
	err := svc.CreateScope(sc)
	if err == nil {
		t.Fatal("expected not_found error")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestCreateScope_ExclusiveParentArea: 同一 SchedulePeriod 内で同じ ParentAreaID が
// 既に別 Scope に存在する場合はエラー。
func TestCreateScope_ExclusiveParentArea(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup period: %v", err)
	}

	// 最初のスコープ: pa-001 を登録
	sc1 := newScope("scope-1", "sp-1", []string{"pa-001", "pa-002"})
	if err := svc.CreateScope(sc1); err != nil {
		t.Fatalf("setup scope1: %v", err)
	}

	// 2つ目のスコープ: pa-001 を重複登録しようとする → エラー
	sc2 := newScope("scope-2", "sp-1", []string{"pa-001", "pa-003"})
	err := svc.CreateScope(sc2)
	if err == nil {
		t.Fatal("expected exclusive parent area error")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

// TestCreateScope_DifferentPeriodOK: 異なる SchedulePeriod 内では同じ ParentAreaID を使える。
func TestCreateScope_DifferentPeriodOK(t *testing.T) {
	svc := newSchedulePeriodService()

	sp1 := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	sp2 := newPeriod("sp-2", makeDate(2026, 7, 1), makeDate(2026, 12, 31))
	if err := svc.CreateSchedulePeriod(sp1); err != nil {
		t.Fatalf("setup sp1: %v", err)
	}
	if err := svc.CreateSchedulePeriod(sp2); err != nil {
		t.Fatalf("setup sp2: %v", err)
	}

	sc1 := newScope("scope-1", "sp-1", []string{"pa-001"})
	sc2 := newScope("scope-2", "sp-2", []string{"pa-001"}) // 別期間なのでOK

	if err := svc.CreateScope(sc1); err != nil {
		t.Fatalf("CreateScope sc1: %v", err)
	}
	if err := svc.CreateScope(sc2); err != nil {
		t.Errorf("CreateScope sc2 (different period) should succeed: %v", err)
	}
}

// TestUpdateScope_ExclusiveParentArea: 更新時に他 Scope が使用中の ParentAreaID を追加するとエラー。
func TestUpdateScope_ExclusiveParentArea(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup period: %v", err)
	}

	sc1 := newScope("scope-1", "sp-1", []string{"pa-001"})
	sc2 := newScope("scope-2", "sp-1", []string{"pa-002"})
	if err := svc.CreateScope(sc1); err != nil {
		t.Fatalf("setup sc1: %v", err)
	}
	if err := svc.CreateScope(sc2); err != nil {
		t.Fatalf("setup sc2: %v", err)
	}

	// scope-2 に pa-001 を追加しようとする → エラー
	sc2.ParentAreaIDs = []string{"pa-002", "pa-001"}
	err := svc.UpdateScope(sc2)
	if err == nil {
		t.Fatal("expected exclusive parent area error")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

// TestUpdateScope_SameScopeOK: 自スコープ内の ParentAreaID のみ持つ更新は許可される。
func TestUpdateScope_SameScopeOK(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	if err := svc.CreateSchedulePeriod(sp); err != nil {
		t.Fatalf("setup period: %v", err)
	}

	sc := newScope("scope-1", "sp-1", []string{"pa-001", "pa-002"})
	if err := svc.CreateScope(sc); err != nil {
		t.Fatalf("setup sc: %v", err)
	}

	// 自分自身の ParentAreaIDs を保持したまま名前を変更
	sc.Name = "updated-name"
	if err := svc.UpdateScope(sc); err != nil {
		t.Errorf("UpdateScope same scope: %v", err)
	}

	got, _ := svc.GetScope("scope-1")
	if got.Name != "updated-name" {
		t.Errorf("Name = %q, want updated-name", got.Name)
	}
	if len(got.ParentAreaIDs) != 2 {
		t.Errorf("ParentAreaIDs len = %d, want 2", len(got.ParentAreaIDs))
	}
}

// TestDeleteScope_Success: 存在するスコープを削除できる。
func TestDeleteScope_Success(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	svc.CreateSchedulePeriod(sp)

	sc := newScope("scope-del", "sp-1", []string{"pa-001"})
	svc.CreateScope(sc)

	if err := svc.DeleteScope("scope-del"); err != nil {
		t.Fatalf("DeleteScope: %v", err)
	}

	_, err := svc.GetScope("scope-del")
	if err == nil {
		t.Error("expected not found after delete")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestDeleteScope_NotFound: 存在しないスコープを削除するとエラー。
func TestDeleteScope_NotFound(t *testing.T) {
	svc := newSchedulePeriodService()

	err := svc.DeleteScope("scope-nonexistent")
	if err == nil {
		t.Fatal("expected not_found error")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestListScopes_FilterByPeriod: ListScopes は SchedulePeriodID でフィルタする。
func TestListScopes_FilterByPeriod(t *testing.T) {
	svc := newSchedulePeriodService()

	sp1 := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	sp2 := newPeriod("sp-2", makeDate(2026, 7, 1), makeDate(2026, 12, 31))
	svc.CreateSchedulePeriod(sp1)
	svc.CreateSchedulePeriod(sp2)

	svc.CreateScope(newScope("sc-a", "sp-1", []string{"pa-001"}))
	svc.CreateScope(newScope("sc-b", "sp-1", []string{"pa-002"}))
	svc.CreateScope(newScope("sc-c", "sp-2", []string{"pa-001"})) // 別期間

	list, err := svc.ListScopes("sp-1")
	if err != nil {
		t.Fatalf("ListScopes: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 scopes for sp-1, got %d", len(list))
	}
}

// TestGetScope_NotFound: 存在しないスコープを取得するとエラー。
func TestGetScope_NotFound(t *testing.T) {
	svc := newSchedulePeriodService()

	_, err := svc.GetScope("scope-nonexistent")
	if err == nil {
		t.Fatal("expected not_found error")
	}
	if !service.IsCode(err, service.ErrNotFound) {
		t.Errorf("error code = %v, want not_found", err)
	}
}

// TestCreateScope_EmptyParentAreaIDs: ParentAreaIDs が空でも登録できる（空のスコープ）。
func TestCreateScope_EmptyParentAreaIDs(t *testing.T) {
	svc := newSchedulePeriodService()

	sp := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	svc.CreateSchedulePeriod(sp)

	sc := newScope("scope-empty", "sp-1", []string{})
	if err := svc.CreateScope(sc); err != nil {
		t.Errorf("CreateScope with empty ParentAreaIDs: %v", err)
	}
}

// TestUpdateSchedulePeriod_OverlapWithOtherError: 更新後に他期間と重複するとエラー。
func TestUpdateSchedulePeriod_OverlapWithOtherError(t *testing.T) {
	svc := newSchedulePeriodService()

	sp1 := newPeriod("sp-1", makeDate(2026, 1, 1), makeDate(2026, 6, 30))
	sp2 := newPeriod("sp-2", makeDate(2026, 7, 1), makeDate(2026, 12, 31))
	svc.CreateSchedulePeriod(sp1)
	svc.CreateSchedulePeriod(sp2)

	// sp-1 の終了日を sp-2 の開始日以降にしようとする
	sp1.EndDate = makeDate(2026, 8, 31)
	err := svc.UpdateSchedulePeriod(sp1)
	if err == nil {
		t.Fatal("expected overlap error on update")
	}
	if !service.IsCode(err, service.ErrInvalidInput) {
		t.Errorf("error code = %v, want invalid_input", err)
	}
}

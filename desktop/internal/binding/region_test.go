package binding_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

// setupRegionBinding は階層データ付きのテスト環境を構築する。
// Region: NRT(成田市) → ParentArea: NRT-001(加良部1丁目), NRT-002(花崎町)
// NRT-001 → Area: NRT-001-01, NRT-001-02
// NRT-002 → Area: NRT-002-01
func setupRegionBinding() (*binding.RegionBinding, *repository.InMemoryRepository) {
	repo := repository.NewInMemoryRepository()
	b := binding.NewRegionBinding(repo)

	repo.SaveRegion(&models.Region{ID: "NRT", Name: "成田市", Symbol: "NRT", Order: 0})
	repo.SaveRegion(&models.Region{ID: "TMS", Name: "富里市", Symbol: "TMS", Order: 1})

	repo.SaveParentArea(&models.ParentArea{ID: "NRT-001", RegionID: "NRT", Number: "001", Name: "加良部1丁目"})
	repo.SaveParentArea(&models.ParentArea{ID: "NRT-002", RegionID: "NRT", Number: "002", Name: "花崎町"})

	repo.SaveArea(&models.Area{ID: "NRT-001-01", ParentAreaID: "NRT-001", Number: "01"})
	repo.SaveArea(&models.Area{ID: "NRT-001-02", ParentAreaID: "NRT-001", Number: "02"})
	repo.SaveArea(&models.Area{ID: "NRT-002-01", ParentAreaID: "NRT-002", Number: "01"})

	return b, repo
}

func TestUpdateRegion_NameOnly(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田", "NRT")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	r, err := repo.GetRegion("NRT")
	if err != nil {
		t.Fatalf("GetRegion: %v", err)
	}
	if r.Name != "成田" {
		t.Errorf("got Name=%s, want 成田", r.Name)
	}
	if r.Symbol != "NRT" {
		t.Errorf("got Symbol=%s, want NRT", r.Symbol)
	}
}

func TestUpdateRegion_SymbolChange_UpdatesRegionID(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田市", "NR")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	// 旧IDでは見つからない
	_, err = repo.GetRegion("NRT")
	if err == nil {
		t.Error("expected old region ID 'NRT' to be removed")
	}

	// 新IDで取得できる
	r, err := repo.GetRegion("NR")
	if err != nil {
		t.Fatalf("GetRegion(NR): %v", err)
	}
	if r.Symbol != "NR" {
		t.Errorf("got Symbol=%s, want NR", r.Symbol)
	}
	if r.Name != "成田市" {
		t.Errorf("got Name=%s, want 成田市", r.Name)
	}
}

func TestUpdateRegion_SymbolChange_UpdatesParentAreaIDs(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田市", "NR")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	// 旧IDでは見つからない
	_, err = repo.GetParentArea("NRT-001")
	if err == nil {
		t.Error("expected old parent area ID 'NRT-001' to be removed")
	}

	// 新IDで取得できる
	pa, err := repo.GetParentArea("NR-001")
	if err != nil {
		t.Fatalf("GetParentArea(NR-001): %v", err)
	}
	if pa.RegionID != "NR" {
		t.Errorf("got RegionID=%s, want NR", pa.RegionID)
	}

	pa2, err := repo.GetParentArea("NR-002")
	if err != nil {
		t.Fatalf("GetParentArea(NR-002): %v", err)
	}
	if pa2.RegionID != "NR" {
		t.Errorf("got RegionID=%s, want NR", pa2.RegionID)
	}
}

func TestUpdateRegion_SymbolChange_UpdatesAreaIDs(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田市", "NR")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	// 旧IDでは見つからない
	_, err = repo.GetArea("NRT-001-01")
	if err == nil {
		t.Error("expected old area ID 'NRT-001-01' to be removed")
	}

	// 新IDで取得できる
	a, err := repo.GetArea("NR-001-01")
	if err != nil {
		t.Fatalf("GetArea(NR-001-01): %v", err)
	}
	if a.ParentAreaID != "NR-001" {
		t.Errorf("got ParentAreaID=%s, want NR-001", a.ParentAreaID)
	}

	a2, err := repo.GetArea("NR-001-02")
	if err != nil {
		t.Fatalf("GetArea(NR-001-02): %v", err)
	}
	if a2.ParentAreaID != "NR-001" {
		t.Errorf("got ParentAreaID=%s, want NR-001", a2.ParentAreaID)
	}

	a3, err := repo.GetArea("NR-002-01")
	if err != nil {
		t.Fatalf("GetArea(NR-002-01): %v", err)
	}
	if a3.ParentAreaID != "NR-002" {
		t.Errorf("got ParentAreaID=%s, want NR-002", a3.ParentAreaID)
	}
}

func TestUpdateRegion_SymbolChange_DoesNotAffectOtherRegions(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田市", "NR")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	// TMS region should be untouched
	r, err := repo.GetRegion("TMS")
	if err != nil {
		t.Fatalf("GetRegion(TMS): %v", err)
	}
	if r.Name != "富里市" {
		t.Errorf("got Name=%s, want 富里市", r.Name)
	}
}

func TestUpdateRegion_SymbolChange_PreservesOrder(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.UpdateRegion("NRT", "成田市", "NR")
	if err != nil {
		t.Fatalf("UpdateRegion: %v", err)
	}

	r, err := repo.GetRegion("NR")
	if err != nil {
		t.Fatalf("GetRegion(NR): %v", err)
	}
	if r.Order != 0 {
		t.Errorf("got Order=%d, want 0", r.Order)
	}
}

func TestUpdateRegion_NotFound(t *testing.T) {
	b, _ := setupRegionBinding()

	err := b.UpdateRegion("NONEXISTENT", "test", "TST")
	if err == nil {
		t.Fatal("expected error for nonexistent region")
	}
}

func TestBindPolygonToArea(t *testing.T) {
	b, repo := setupRegionBinding()

	err := b.BindPolygonToArea("NRT-001-01", "poly-abc-123")
	if err != nil {
		t.Fatalf("BindPolygonToArea: %v", err)
	}

	a, err := repo.GetArea("NRT-001-01")
	if err != nil {
		t.Fatalf("GetArea: %v", err)
	}
	if a.PolygonID != "poly-abc-123" {
		t.Errorf("got PolygonID=%s, want poly-abc-123", a.PolygonID)
	}
}

func TestBindPolygonToArea_NotFound(t *testing.T) {
	b, _ := setupRegionBinding()

	err := b.BindPolygonToArea("NONEXISTENT", "poly-123")
	if err == nil {
		t.Fatal("expected error for nonexistent area")
	}
}

func TestUnbindPolygonFromArea(t *testing.T) {
	b, repo := setupRegionBinding()

	// まずバインド
	b.BindPolygonToArea("NRT-001-01", "poly-abc-123")

	// アンバインド
	err := b.UnbindPolygonFromArea("NRT-001-01")
	if err != nil {
		t.Fatalf("UnbindPolygonFromArea: %v", err)
	}

	a, err := repo.GetArea("NRT-001-01")
	if err != nil {
		t.Fatalf("GetArea: %v", err)
	}
	if a.PolygonID != "" {
		t.Errorf("got PolygonID=%s, want empty", a.PolygonID)
	}
}

package repository_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newJSONFileRepo(t *testing.T) domain.RegionRepository {
	t.Helper()
	dir := t.TempDir()
	repo, err := repository.NewJSONFileRepository(dir)
	if err != nil {
		t.Fatalf("NewJSONFileRepository: %v", err)
	}
	return repo
}

// --- Region ---

func TestJSONFile_Region_SaveAndGet(t *testing.T) {
	repo := newJSONFileRepo(t)
	r := &models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"}

	if err := repo.SaveRegion(r); err != nil {
		t.Fatalf("SaveRegion: %v", err)
	}

	got, err := repo.GetRegion("r1")
	if err != nil {
		t.Fatalf("GetRegion: %v", err)
	}
	if got.Name != "成田市" || got.Symbol != "NRT" {
		t.Errorf("got %+v, want Name=成田市, Symbol=NRT", got)
	}
}

func TestJSONFile_Region_GetNotFound(t *testing.T) {
	repo := newJSONFileRepo(t)
	_, err := repo.GetRegion("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent region")
	}
}

func TestJSONFile_Region_List(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})
	repo.SaveRegion(&models.Region{ID: "r2", Name: "富里市", Symbol: "TMS"})

	regions, err := repo.ListRegions()
	if err != nil {
		t.Fatalf("ListRegions: %v", err)
	}
	if len(regions) != 2 {
		t.Errorf("got %d regions, want 2", len(regions))
	}
}

func TestJSONFile_Region_SaveOverwrite(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveRegion(&models.Region{ID: "r1", Name: "旧名", Symbol: "OLD"})
	repo.SaveRegion(&models.Region{ID: "r1", Name: "新名", Symbol: "NEW"})

	got, _ := repo.GetRegion("r1")
	if got.Name != "新名" {
		t.Errorf("got Name=%s, want 新名", got.Name)
	}
}

func TestJSONFile_Region_Delete(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})

	if err := repo.DeleteRegion("r1"); err != nil {
		t.Fatalf("DeleteRegion: %v", err)
	}
	_, err := repo.GetRegion("r1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

func TestJSONFile_Region_DeleteNotFound(t *testing.T) {
	repo := newJSONFileRepo(t)
	err := repo.DeleteRegion("nonexistent")
	if err == nil {
		t.Fatal("expected error for deleting nonexistent region")
	}
}

// --- ParentArea ---

func TestJSONFile_ParentArea_SaveAndGet(t *testing.T) {
	repo := newJSONFileRepo(t)
	pa := &models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1丁目"}

	if err := repo.SaveParentArea(pa); err != nil {
		t.Fatalf("SaveParentArea: %v", err)
	}

	got, err := repo.GetParentArea("pa1")
	if err != nil {
		t.Fatalf("GetParentArea: %v", err)
	}
	if got.Name != "加良部1丁目" {
		t.Errorf("got Name=%s, want 加良部1丁目", got.Name)
	}
}

func TestJSONFile_ParentArea_ListByRegion(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveParentArea(&models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1"})
	repo.SaveParentArea(&models.ParentArea{ID: "pa2", RegionID: "r1", Number: "002", Name: "加良部2"})
	repo.SaveParentArea(&models.ParentArea{ID: "pa3", RegionID: "r2", Number: "001", Name: "七栄1"})

	list, err := repo.ListParentAreas("r1")
	if err != nil {
		t.Fatalf("ListParentAreas: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d parent areas for r1, want 2", len(list))
	}
}

func TestJSONFile_ParentArea_Delete(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveParentArea(&models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1"})

	if err := repo.DeleteParentArea("pa1"); err != nil {
		t.Fatalf("DeleteParentArea: %v", err)
	}
	_, err := repo.GetParentArea("pa1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

// --- Area ---

func TestJSONFile_Area_SaveAndGet(t *testing.T) {
	repo := newJSONFileRepo(t)
	a := &models.Area{ID: "a1", ParentAreaID: "pa1", Number: "05"}

	if err := repo.SaveArea(a); err != nil {
		t.Fatalf("SaveArea: %v", err)
	}

	got, err := repo.GetArea("a1")
	if err != nil {
		t.Fatalf("GetArea: %v", err)
	}
	if got.Number != "05" {
		t.Errorf("got Number=%s, want 05", got.Number)
	}
}

func TestJSONFile_Area_ListByParentArea(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveArea(&models.Area{ID: "a1", ParentAreaID: "pa1", Number: "01"})
	repo.SaveArea(&models.Area{ID: "a2", ParentAreaID: "pa1", Number: "02"})
	repo.SaveArea(&models.Area{ID: "a3", ParentAreaID: "pa2", Number: "01"})

	list, err := repo.ListAreas("pa1")
	if err != nil {
		t.Fatalf("ListAreas: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d areas for pa1, want 2", len(list))
	}
}

func TestJSONFile_Area_Delete(t *testing.T) {
	repo := newJSONFileRepo(t)
	repo.SaveArea(&models.Area{ID: "a1", ParentAreaID: "pa1", Number: "01"})

	if err := repo.DeleteArea("a1"); err != nil {
		t.Fatalf("DeleteArea: %v", err)
	}
	_, err := repo.GetArea("a1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

// --- Persistence (再読み込みで永続化確認) ---

func TestJSONFile_Persistence(t *testing.T) {
	dir := t.TempDir()

	// 1回目: 書き込み
	repo1, _ := repository.NewJSONFileRepository(dir)
	repo1.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})
	repo1.SaveParentArea(&models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1"})
	repo1.SaveArea(&models.Area{ID: "a1", ParentAreaID: "pa1", Number: "05"})

	// 2回目: 別インスタンスで読み込み
	repo2, _ := repository.NewJSONFileRepository(dir)

	region, err := repo2.GetRegion("r1")
	if err != nil {
		t.Fatalf("GetRegion after reload: %v", err)
	}
	if region.Name != "成田市" {
		t.Errorf("got Name=%s, want 成田市", region.Name)
	}

	pa, err := repo2.GetParentArea("pa1")
	if err != nil {
		t.Fatalf("GetParentArea after reload: %v", err)
	}
	if pa.Name != "加良部1" {
		t.Errorf("got Name=%s, want 加良部1", pa.Name)
	}

	area, err := repo2.GetArea("a1")
	if err != nil {
		t.Fatalf("GetArea after reload: %v", err)
	}
	if area.Number != "05" {
		t.Errorf("got Number=%s, want 05", area.Number)
	}
}

func TestJSONFile_PersistenceWithGeometry(t *testing.T) {
	dir := t.TempDir()

	geo := &models.GeoJSONPolygon{
		Type: "Polygon",
		Coordinates: [][][2]float64{
			{{140.0, 35.0}, {140.1, 35.0}, {140.1, 35.1}, {140.0, 35.1}, {140.0, 35.0}},
		},
	}

	repo1, _ := repository.NewJSONFileRepository(dir)
	repo1.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT", Geometry: geo})

	repo2, _ := repository.NewJSONFileRepository(dir)
	got, _ := repo2.GetRegion("r1")

	if got.Geometry == nil {
		t.Fatal("Geometry is nil after reload")
	}
	if len(got.Geometry.Coordinates) != 1 || len(got.Geometry.Coordinates[0]) != 5 {
		t.Errorf("unexpected geometry coordinates: %+v", got.Geometry.Coordinates)
	}
}

func TestJSONFile_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	repo, err := repository.NewJSONFileRepository(dir)
	if err != nil {
		t.Fatalf("NewJSONFileRepository: %v", err)
	}

	regions, err := repo.ListRegions()
	if err != nil {
		t.Fatalf("ListRegions: %v", err)
	}
	if len(regions) != 0 {
		t.Errorf("got %d regions from empty dir, want 0", len(regions))
	}
}

func TestJSONFile_InvalidDir(t *testing.T) {
	_, err := repository.NewJSONFileRepository("/nonexistent/path/that/does/not/exist")
	if err == nil {
		t.Fatal("expected error for invalid directory")
	}
}

// --- 論理削除 + GetRaw + 永続化 ---

func TestJSONFile_SoftDelete_Persistence(t *testing.T) {
	dir := t.TempDir()

	repo1, _ := repository.NewJSONFileRepository(dir)
	repo1.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})
	repo1.DeleteRegion("r1")

	// 別インスタンスで読み込み → 論理削除されたデータが残っている
	repo2, _ := repository.NewJSONFileRepository(dir)

	// ListRegions では見えない
	regions, _ := repo2.ListRegions()
	if len(regions) != 0 {
		t.Errorf("got %d, want 0", len(regions))
	}

	// GetRegionRaw で論理削除済みを取得できる
	got, err := repo2.GetRegionRaw("r1")
	if err != nil {
		t.Fatalf("GetRegionRaw: %v", err)
	}
	if got.Name != "成田市" {
		t.Errorf("got Name=%s, want 成田市", got.Name)
	}
	if got.DeletedAt == nil {
		t.Error("DeletedAt should be set for soft-deleted region")
	}

	// DeletedAt をクリアして Save で復元（アプリ層のRestore相当）
	got.DeletedAt = nil
	if err := repo2.SaveRegion(got); err != nil {
		t.Fatalf("SaveRegion: %v", err)
	}
	restored, _ := repo2.GetRegion("r1")
	if restored.Name != "成田市" {
		t.Errorf("got Name=%s, want 成田市", restored.Name)
	}
}

func TestJSONFile_CorruptedFile(t *testing.T) {
	dir := t.TempDir()
	// 壊れたJSONファイルを配置
	os.WriteFile(filepath.Join(dir, "regions.json"), []byte("{invalid json"), 0644)

	_, err := repository.NewJSONFileRepository(dir)
	if err == nil {
		t.Fatal("expected error for corrupted JSON file")
	}
}

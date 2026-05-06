// Package testdata はテスト・開発用のダミーデータ生成を提供する。
//
// 方針: メンバー（ユーザー・タグ）のみダミー投入する。
// 領域・区域・場所・活動などの業務データはダミー投入しない（実データで扱う）。
package testdata

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

// NewLinkSelfRepos はLinkSelfリポジトリからReposを生成する。
func NewLinkSelfRepos(repo *repository.LinkSelfRepository) *Repos {
	return &Repos{
		User:         repo.User(),
		Checkout:     repo.Checkout(),
		Notification: repo.Notification(),
		Region:       repo.Region(),
		Coverage:     repo.Coverage(),
	}
}

// Repos はダミー投入対象のリポジトリを保持する構造体。
type Repos struct {
	User         domain.UserRepository
	Checkout     domain.CheckoutRepository
	Notification domain.NotificationRepository
	Region       domain.RegionRepository
	Coverage     domain.CoverageRepository
}

// NewInMemoryRepos はInMemoryリポジトリのセットを生成する。
func NewInMemoryRepos() *Repos {
	return &Repos{
		User:         repository.NewInMemoryUserRepository(),
		Checkout:     repository.NewInMemoryCheckoutRepository(),
		Notification: repository.NewInMemoryNotificationRepository(),
		Region:       repository.NewInMemoryRepository(),
		Coverage:     repository.NewInMemoryCoverageRepository(),
	}
}

// did は連番からDIDを生成する。
func did(n int) string {
	return fmt.Sprintf("did:key:z6Mk%04d", n)
}

// SeedAll はメンバー関連のダミーデータと、サービス層テスト用の最小限の
// 領域 / 区域 / アクティブ AvailablePeriod を投入する。
// 投入される領域は「TMS」(symbol) のみ、区域親番は pa-tms-001〜pa-tms-005、
// 区域は各親番配下に 01〜09 まで（ID 例: pa-tms-001-01）。
// AvailablePeriod は当該 5 親番すべてを対象とした active 期間（ap-test-active）が 1 件。
func SeedAll(repos *Repos) error {
	if err := seedUsers(repos); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}
	if repos.Region != nil {
		if err := seedRegions(repos); err != nil {
			return fmt.Errorf("seed regions: %w", err)
		}
	}
	if repos.Coverage != nil {
		if err := seedActivePeriod(repos); err != nil {
			return fmt.Errorf("seed active period: %w", err)
		}
	}
	return nil
}

// SeedTestParentAreaIDs はテスト用に投入された区域親番 ID 一覧を返す。
func SeedTestParentAreaIDs() []string {
	return []string{
		"pa-tms-001",
		"pa-tms-002",
		"pa-tms-003",
		"pa-tms-004",
		"pa-tms-005",
		"pa-tms-006",
		"pa-tms-007",
	}
}

// SeedTestActivePeriodID はテスト用に投入されたアクティブ AvailablePeriod の ID を返す。
const SeedTestActivePeriodID = "ap-test-active"

func seedRegions(repos *Repos) error {
	region := &models.Region{
		ID:       "rg-tms",
		Name:     "テスト市",
		Symbol:   "TMS",
		Approved: true,
	}
	if err := repos.Region.SaveRegion(region); err != nil {
		return err
	}
	for _, paID := range SeedTestParentAreaIDs() {
		number := paID[len("pa-tms-"):]
		pa := &models.ParentArea{
			ID:       paID,
			RegionID: region.ID,
			Number:   number,
			Name:     "親番" + number,
		}
		if err := repos.Region.SaveParentArea(pa); err != nil {
			return err
		}
		for i := 1; i <= 20; i++ {
			areaNumber := fmt.Sprintf("%02d", i)
			area := &models.Area{
				ID:           fmt.Sprintf("%s-%s", paID, areaNumber),
				ParentAreaID: paID,
				Number:       areaNumber,
			}
			if err := repos.Region.SaveArea(area); err != nil {
				return err
			}
		}
	}
	return nil
}

func seedActivePeriod(repos *Repos) error {
	now := time.Now()
	p := &models.AvailablePeriod{
		ID:            SeedTestActivePeriodID,
		Name:          "テスト用アクティブ期間",
		StartDate:     now.AddDate(0, 0, -7),
		EndDate:       now.AddDate(0, 0, 30),
		ParentAreaIDs: SeedTestParentAreaIDs(),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	return repos.Coverage.SaveAvailablePeriod(p)
}

// --- メンバー（50名） ---

var familyNames = []string{
	"田中", "鈴木", "佐藤", "高橋", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
	"吉田", "山田", "佐々木", "松本", "井上", "木村", "林", "斎藤", "清水", "山口",
	"森", "池田", "橋本", "阿部", "石川", "山崎", "中島", "前田", "藤田", "小川",
	"後藤", "岡田", "長谷川", "村上", "近藤", "石井", "坂本", "遠藤", "青木", "藤井",
	"西村", "福田", "太田", "三浦", "岡本", "松田", "中川", "中野", "原田", "小野",
}

func seedUsers(repos *Repos) error {
	// タグ作成
	tags := []models.Tag{
		{ID: "tag-foreign-lang", Name: "外国語対応"},
		{ID: "tag-new-member", Name: "新人"},
		{ID: "tag-experienced", Name: "ベテラン"},
		{ID: "tag-team-a", Name: "Aチーム"},
		{ID: "tag-team-b", Name: "Bチーム"},
		{ID: "tag-team-c", Name: "Cチーム"},
		{ID: "tag-team-d", Name: "Dチーム"},
	}
	for _, t := range tags {
		if err := repos.User.SaveTag(&t); err != nil {
			return err
		}
	}

	// メンバー50名作成
	teamTags := []string{"tag-team-a", "tag-team-b", "tag-team-c", "tag-team-d"}
	baseTime := time.Date(2025, 4, 1, 0, 0, 0, 0, time.Local)
	for i := 0; i < 50; i++ {
		var role models.Role
		var tagIDs []string

		switch {
		case i < 2: // admin 2名
			role = models.RoleAdmin
		case i < 7: // editor 5名
			role = models.RoleEditor
			tagIDs = append(tagIDs, teamTags[i%4])
		default: // member 43名
			role = models.RoleMember
			tagIDs = append(tagIDs, teamTags[i%4])
		}

		// 一部にタグ付与
		if i%10 == 0 {
			tagIDs = append(tagIDs, "tag-foreign-lang")
		}
		if i >= 45 {
			tagIDs = append(tagIDs, "tag-new-member")
		}
		if i >= 2 && i < 10 {
			tagIDs = append(tagIDs, "tag-experienced")
		}

		u := &models.User{
			ID:       did(i + 1),
			Name:     familyNames[i],
			Role:     role,
			TagIDs:   tagIDs,
			JoinedAt: baseTime.Add(time.Duration(i) * 24 * time.Hour),
		}
		if err := repos.User.SaveUser(u); err != nil {
			return err
		}
	}
	return nil
}

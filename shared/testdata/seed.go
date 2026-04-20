// Package testdata はテスト・開発用のダミーデータ生成を提供する。
//
// 方針: メンバー（ユーザー・グループ・タグ）のみダミー投入する。
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
		Activity:     repo.Activity(),
		Notification: repo.Notification(),
	}
}

// Repos はダミー投入対象のリポジトリを保持する構造体。
type Repos struct {
	User         domain.UserRepository
	Activity     domain.ActivityRepository
	Notification domain.NotificationRepository
}

// NewInMemoryRepos はInMemoryリポジトリのセットを生成する。
func NewInMemoryRepos() *Repos {
	return &Repos{
		User:         repository.NewInMemoryUserRepository(),
		Activity:     repository.NewInMemoryActivityRepository(),
		Notification: repository.NewInMemoryNotificationRepository(),
	}
}

// did は連番からDIDを生成する。
func did(n int) string {
	return fmt.Sprintf("did:key:z6Mk%04d", n)
}

// SeedAll はメンバー関連のダミーデータを投入する。
// 領域・区域などの業務データは投入しない。
func SeedAll(repos *Repos) error {
	if err := seedUsers(repos); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}
	return nil
}

// --- メンバー（50名） ---

var familyNames = []string{
	"田中", "鈴木", "佐藤", "高橋", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
	"吉田", "山田", "佐々木", "松本", "井上", "木村", "林", "斎藤", "清水", "山口",
	"森", "池田", "橋本", "阿部", "石川", "山崎", "中島", "前田", "藤田", "小川",
	"後藤", "岡田", "長谷川", "村上", "近藤", "石井", "坂本", "遠藤", "青木", "藤井",
	"西村", "福田", "太田", "三浦", "岡本", "松田", "中川", "中野", "原田", "小野",
}

var groupDefs = []struct {
	id   string
	name string
}{
	{"grp-a", "Aグループ"},
	{"grp-b", "Bグループ"},
	{"grp-c", "Cグループ"},
	{"grp-d", "Dグループ"},
}

func seedUsers(repos *Repos) error {
	// グループ作成
	for i, g := range groupDefs {
		if err := repos.User.SaveGroup(&models.Group{ID: g.id, Name: g.name, SortOrder: i + 1}); err != nil {
			return err
		}
	}

	// タグ作成
	tags := []models.Tag{
		{ID: "tag-foreign-lang", Name: "外国語対応"},
		{ID: "tag-new-member", Name: "新人"},
		{ID: "tag-experienced", Name: "ベテラン"},
	}
	for _, t := range tags {
		if err := repos.User.SaveTag(&t); err != nil {
			return err
		}
	}

	// メンバー50名作成
	baseTime := time.Date(2025, 4, 1, 0, 0, 0, 0, time.Local)
	for i := 0; i < 50; i++ {
		var role models.Role
		var groupID string
		var tagIDs []string

		switch {
		case i < 2: // admin 2名
			role = models.RoleAdmin
			groupID = "" // admin はグループ未所属可
		case i < 7: // editor 5名
			role = models.RoleEditor
			groupID = groupDefs[i%4].id
		default: // member 43名
			role = models.RoleMember
			groupID = groupDefs[i%4].id
		}

		// 一部にタグ付与
		if i%10 == 0 {
			tagIDs = []string{"tag-foreign-lang"}
		}
		if i >= 45 {
			tagIDs = append(tagIDs, "tag-new-member")
		}
		if i >= 2 && i < 10 {
			tagIDs = append(tagIDs, "tag-experienced")
		}

		u := &models.User{
			ID:         did(i + 1),
			Name:       familyNames[i],
			Role:       role,
			OrgGroupID: groupID,
			TagIDs:     tagIDs,
			JoinedAt:   baseTime.Add(time.Duration(i) * 24 * time.Hour),
		}
		if err := repos.User.SaveUser(u); err != nil {
			return err
		}
	}
	return nil
}

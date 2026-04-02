// Package testdata はテスト・開発用のダミーデータ生成を提供する。
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
		Region:       repo.Region(),
		User:         repo.User(),
		Place:        repo.Place(),
		Activity:     repo.Activity(),
		Coverage:     repo.Coverage(),
		Notification: repo.Notification(),
		Personal:     repo.Personal(),
	}
}

// Repos は全リポジトリを保持する構造体。
type Repos struct {
	Region       domain.RegionRepository
	User         domain.UserRepository
	Place        domain.PlaceRepository
	Activity     domain.ActivityRepository
	Coverage     domain.CoverageRepository
	Notification domain.NotificationRepository
	Personal     domain.PersonalRepository
}

// NewInMemoryRepos はInMemoryリポジトリのセットを生成する。
func NewInMemoryRepos() *Repos {
	return &Repos{
		Region:       repository.NewInMemoryRepository(),
		User:         repository.NewInMemoryUserRepository(),
		Place:        repository.NewInMemoryPlaceRepository(),
		Activity:     repository.NewInMemoryActivityRepository(),
		Coverage:     repository.NewInMemoryCoverageRepository(),
		Notification: repository.NewInMemoryNotificationRepository(),
		Personal:     repository.NewInMemoryPersonalRepository(),
	}
}

// did は連番からDIDを生成する。
func did(n int) string {
	return fmt.Sprintf("did:key:z6Mk%04d", n)
}

// SeedAll は50人規模のダミーデータを全リポジトリに投入する。
func SeedAll(repos *Repos) error {
	if err := seedUsers(repos); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}
	if err := seedRegions(repos); err != nil {
		return fmt.Errorf("seed regions: %w", err)
	}
	if err := seedPlaces(repos); err != nil {
		return fmt.Errorf("seed places: %w", err)
	}
	if err := seedTeams(repos); err != nil {
		return fmt.Errorf("seed teams: %w", err)
	}
	if err := seedActivities(repos); err != nil {
		return fmt.Errorf("seed activities: %w", err)
	}
	if err := seedCoverages(repos); err != nil {
		return fmt.Errorf("seed coverages: %w", err)
	}
	if err := seedNotifications(repos); err != nil {
		return fmt.Errorf("seed notifications: %w", err)
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

// --- 領域・区域 ---

type regionDef struct {
	id     string
	name   string
	symbol string
	pas    []parentAreaDef
}

type parentAreaDef struct {
	id    string
	num   string
	name  string
	areas int // 区域数
}

var regions = []regionDef{
	{
		id: "reg-nrt", name: "成田市", symbol: "NRT",
		pas: []parentAreaDef{
			{id: "pa-nrt-001", num: "001", name: "加良部1丁目", areas: 5},
			{id: "pa-nrt-002", num: "002", name: "加良部2丁目", areas: 4},
			{id: "pa-nrt-003", num: "003", name: "囲護台", areas: 6},
			{id: "pa-nrt-004", num: "004", name: "赤坂", areas: 3},
			{id: "pa-nrt-005", num: "005", name: "飯田町", areas: 4},
			{id: "pa-nrt-006", num: "006", name: "花崎町", areas: 3},
		},
	},
	{
		id: "reg-tms", name: "富里市", symbol: "TMS",
		pas: []parentAreaDef{
			{id: "pa-tms-001", num: "001", name: "七栄", areas: 5},
			{id: "pa-tms-002", num: "002", name: "日吉台", areas: 4},
			{id: "pa-tms-003", num: "003", name: "久能", areas: 3},
			{id: "pa-tms-004", num: "004", name: "十倉", areas: 3},
		},
	},
}

func seedRegions(repos *Repos) error {
	order := 0
	for _, rd := range regions {
		order++
		reg := &models.Region{
			ID:       rd.id,
			Name:     rd.name,
			Symbol:   rd.symbol,
			Approved: true,
			Order:    order,
		}
		if err := repos.Region.SaveRegion(reg); err != nil {
			return err
		}

		for _, pad := range rd.pas {
			pa := &models.ParentArea{
				ID:       pad.id,
				RegionID: rd.id,
				Number:   pad.num,
				Name:     pad.name,
			}
			if err := repos.Region.SaveParentArea(pa); err != nil {
				return err
			}

			for j := 1; j <= pad.areas; j++ {
				areaID := fmt.Sprintf("%s-%02d", pad.id, j)
				area := &models.Area{
					ID:           areaID,
					ParentAreaID: pad.id,
					Number:       fmt.Sprintf("%02d", j),
				}
				if err := repos.Region.SaveArea(area); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// --- 場所 ---

func seedPlaces(repos *Repos) error {
	placeID := 0
	for _, rd := range regions {
		for _, pad := range rd.pas {
			for j := 1; j <= pad.areas; j++ {
				areaID := fmt.Sprintf("%s-%02d", pad.id, j)
				// 各区域に8〜12件の場所
				numPlaces := 8 + (placeID % 5)
				for k := 0; k < numPlaces; k++ {
					placeID++
					pType := models.PlaceTypeHouse
					parentID := ""
					displayName := ""
					sortOrder := k + 1

					// 1割を集合住宅にする
					if k == 0 && placeID%3 == 0 {
						pType = models.PlaceTypeBuilding
						displayName = fmt.Sprintf("マンション%d", placeID)
					}

					p := &models.Place{
						ID:          fmt.Sprintf("place-%04d", placeID),
						AreaID:      areaID,
						Coord:       models.Coordinate{Lat: 35.77 + float64(placeID)*0.0001, Lng: 140.31 + float64(placeID)*0.0001},
						Type:        pType,
						Label:       familyNames[placeID%50],
						DisplayName: displayName,
						ParentID:    parentID,
						SortOrder:   sortOrder,
						DoNotVisit:  placeID%20 == 0, // 5%を訪問不可
						CreatedAt:   time.Date(2025, 6, 1, 0, 0, 0, 0, time.Local),
						UpdatedAt:   time.Date(2025, 6, 1, 0, 0, 0, 0, time.Local),
					}
					if placeID%15 == 0 {
						p.Languages = []string{"en"}
					}
					if placeID%25 == 0 {
						p.Languages = []string{"zh"}
					}
					if err := repos.Place.SavePlace(p); err != nil {
						return err
					}

					// 集合住宅なら部屋を追加
					if pType == models.PlaceTypeBuilding {
						buildingID := p.ID
						rooms := []string{"101", "102", "201", "202", "301", "302"}
						for ri, room := range rooms {
							placeID++
							rp := &models.Place{
								ID:          fmt.Sprintf("place-%04d", placeID),
								AreaID:      areaID,
								Coord:       p.Coord,
								Type:        models.PlaceTypeRoom,
								DisplayName: room,
								ParentID:    buildingID,
								SortOrder:   ri + 1,
								CreatedAt:   time.Date(2025, 6, 1, 0, 0, 0, 0, time.Local),
								UpdatedAt:   time.Date(2025, 6, 1, 0, 0, 0, 0, time.Local),
							}
							if err := repos.Place.SavePlace(rp); err != nil {
								return err
							}
						}
					}
				}
			}
		}
	}
	return nil
}

// --- チーム ---

func seedTeams(repos *Repos) error {
	for i := 0; i < 15; i++ {
		leaderIdx := 7 + i*3 // member領域のメンバー
		if leaderIdx >= 50 {
			leaderIdx = leaderIdx % 43 + 7
		}
		members := []string{did(leaderIdx + 1)}
		// 2〜3人のチーム
		for j := 1; j <= 1+(i%2); j++ {
			memberIdx := leaderIdx + j
			if memberIdx >= 50 {
				memberIdx = memberIdx % 43 + 7
			}
			members = append(members, did(memberIdx+1))
		}

		team := &models.Team{
			ID:       fmt.Sprintf("team-%02d", i+1),
			Name:     fmt.Sprintf("チーム%d", i+1),
			LeaderID: did(leaderIdx + 1),
			Members:  members,
		}
		if err := repos.Activity.SaveTeam(team); err != nil {
			return err
		}
	}
	return nil
}

// --- 訪問活動 ---

func seedActivities(repos *Repos) error {
	now := time.Now()
	actIdx := 0

	// 成田市の最初の3区域親番からアクティブな活動を生成
	for _, pad := range regions[0].pas[:3] {
		for j := 1; j <= pad.areas; j++ {
			areaID := fmt.Sprintf("%s-%02d", pad.id, j)
			actIdx++

			var status models.ActivityStatus
			var checkoutType models.CheckoutType
			var returnedAt *time.Time
			var completedAt *time.Time

			switch actIdx % 4 {
			case 0:
				status = models.ActivityStatusActive
				checkoutType = models.CheckoutTypeLending
			case 1:
				status = models.ActivityStatusActive
				checkoutType = models.CheckoutTypeSelfTake
			case 2:
				status = models.ActivityStatusReturned
				checkoutType = models.CheckoutTypeLending
				rt := now.Add(-48 * time.Hour)
				returnedAt = &rt
			case 3:
				status = models.ActivityStatusComplete
				checkoutType = models.CheckoutTypeLending
				rt := now.Add(-72 * time.Hour)
				ct := now.Add(-24 * time.Hour)
				returnedAt = &rt
				completedAt = &ct
			}

			ownerIdx := 7 + (actIdx % 43)
			lentByID := ""
			if checkoutType == models.CheckoutTypeLending {
				lentByID = did(3 + actIdx%5) // editor
			}

			act := &models.Activity{
				ID:           fmt.Sprintf("act-%03d", actIdx),
				AreaID:       areaID,
				CheckoutType: checkoutType,
				OwnerID:      did(ownerIdx + 1),
				LentByID:     lentByID,
				Status:       status,
				CreatedAt:    now.Add(-time.Duration(actIdx*24) * time.Hour),
				ReturnedAt:   returnedAt,
				CompletedAt:  completedAt,
				UpdatedAt:    now,
			}
			if err := repos.Activity.SaveActivity(act); err != nil {
				return err
			}

			// チーム割り当て
			teamIdx := actIdx % 15
			assign := &models.ActivityTeamAssignment{
				ID:           fmt.Sprintf("ata-%03d", actIdx),
				ActivityID:   act.ID,
				TeamID:       fmt.Sprintf("team-%02d", teamIdx+1),
				ActivityDate: now.Add(-time.Duration(actIdx*24) * time.Hour).Truncate(24 * time.Hour),
				AssignedAt:   now.Add(-time.Duration(actIdx*24) * time.Hour),
			}
			if err := repos.Activity.SaveAssignment(assign); err != nil {
				return err
			}

			// 訪問記録（アクティブ・返却済み・完了のもの）
			if status != models.ActivityStatusPending {
				numRecords := 3 + actIdx%5
				for r := 0; r < numRecords; r++ {
					vrID := fmt.Sprintf("vr-%03d-%02d", actIdx, r+1)
					result := models.VisitResultMet
					if r%3 == 0 {
						result = models.VisitResultAbsent
					}
					vr := &models.VisitRecord{
						ID:         vrID,
						UserID:     did(ownerIdx + 1),
						PlaceID:    fmt.Sprintf("place-%04d", actIdx*10+r+1),
						AreaID:     areaID,
						ActivityID: act.ID,
						Result:     result,
						VisitedAt:  now.Add(-time.Duration(actIdx*24-r) * time.Hour),
						CreatedAt:  now.Add(-time.Duration(actIdx*24-r) * time.Hour),
						UpdatedAt:  now.Add(-time.Duration(actIdx*24-r) * time.Hour),
					}
					if err := repos.Activity.SaveVisitRecord(vr); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

// --- 網羅活動 ---

func seedCoverages(repos *Repos) error {
	now := time.Now()

	for _, rd := range regions {
		for pi, pad := range rd.pas {
			covID := fmt.Sprintf("cov-%s-%s", rd.symbol, pad.num)
			status := models.CoverageStatusActive
			if pi >= len(rd.pas)-1 {
				status = models.CoverageStatusPlanned
			}

			cov := &models.Coverage{
				ID:           covID,
				ParentAreaID: pad.id,
				Status:       status,
				ActualPercent: float64(20 + pi*10),
				StatusPercent: float64(25 + pi*12),
				CreatedAt:    now.Add(-90 * 24 * time.Hour),
				UpdatedAt:    now,
			}
			if err := repos.Coverage.SaveCoverage(cov); err != nil {
				return err
			}

			// 予定期間（区域親番ごとに1期間）
			spID := fmt.Sprintf("sp-%s-%s", rd.symbol, pad.num)
			sp := &models.SchedulePeriod{
				ID:        spID,
				Name:      fmt.Sprintf("%s %s 活動期間", rd.name, pad.name),
				StartDate: now.Add(-60 * 24 * time.Hour),
				EndDate:   now.Add(30 * 24 * time.Hour),
				Approved:  pi < len(rd.pas)-1,
				CreatedAt: now.Add(-60 * 24 * time.Hour),
				UpdatedAt: now,
			}
			if err := repos.Coverage.SaveSchedulePeriod(sp); err != nil {
				return err
			}

			// スコープ（グループ割り当て）
			scID := fmt.Sprintf("sc-%s-%s", rd.symbol, pad.num)
			sc := &models.Scope{
				ID:               scID,
				SchedulePeriodID: spID,
				Name:             groupDefs[pi%4].name,
				GroupID:          groupDefs[pi%4].id,
				ParentAreaIDs:    []string{pad.id},
				CreatedAt:        now.Add(-60 * 24 * time.Hour),
				UpdatedAt:        now,
			}
			if err := repos.Coverage.SaveScope(sc); err != nil {
				return err
			}

			// 区域可用性
			for j := 1; j <= pad.areas; j++ {
				areaID := fmt.Sprintf("%s-%02d", pad.id, j)
				aaType := models.AvailabilityLendable
				if j%3 == 0 {
					aaType = models.AvailabilitySelfTake
				}
				aa := &models.AreaAvailability{
					ID:      fmt.Sprintf("aa-%s-%02d", pad.id, j),
					ScopeID: scID,
					AreaID:  areaID,
					Type:           aaType,
					ScopeGroupID:   groupDefs[pi%4].id,
					StartDate:      now.Add(-60 * 24 * time.Hour),
					EndDate:        now.Add(30 * 24 * time.Hour),
					SetByID:        did(3), // editor
					CreatedAt:      now.Add(-60 * 24 * time.Hour),
				}
				if err := repos.Coverage.SaveAreaAvailability(aa); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// --- 通知・招待 ---

func seedNotifications(repos *Repos) error {
	now := time.Now()

	// 招待（いくつかのpending）
	for i := 0; i < 3; i++ {
		inv := &models.Invitation{
			ID:          fmt.Sprintf("inv-%02d", i+1),
			Type:        models.InvitationTypeRolePromote,
			Status:      models.InvitationStatusPending,
			InviterID:   did(1), // admin
			InviteeID:   did(40 + i + 1),
			TargetRole:  models.RoleEditor,
			Description: fmt.Sprintf("%sさんを編集メンバーに任命", familyNames[40+i]),
			CreatedAt:   now.Add(-time.Duration(i*24) * time.Hour),
		}
		if err := repos.User.SaveInvitation(inv); err != nil {
			return err
		}
	}

	// 通知
	notifTypes := []models.NotificationType{
		models.NotificationTypeLending,
		models.NotificationTypeReturn,
		models.NotificationTypeForceReturn,
		models.NotificationTypeRequestResult,
		models.NotificationTypeInvitation,
	}
	for i := 0; i < 10; i++ {
		expires := now.Add(30 * 24 * time.Hour)
		n := &models.Notification{
			ID:          fmt.Sprintf("notif-%02d", i+1),
			Type:        notifTypes[i%5],
			TargetID:    did(10 + i + 1),
			ReferenceID: fmt.Sprintf("act-%03d", i+1),
			Message:     fmt.Sprintf("通知テスト%d", i+1),
			Read:        i < 5, // 前半は既読
			CreatedAt:   now.Add(-time.Duration(i*6) * time.Hour),
			ExpiresAt:   &expires,
		}
		if err := repos.Notification.SaveNotification(n); err != nil {
			return err
		}
	}

	// 申請
	reqTypes := []models.RequestType{
		models.RequestTypePlaceAdd,
		models.RequestTypeMapUpdate,
		models.RequestTypeDoNotVisit,
	}
	for i := 0; i < 5; i++ {
		status := models.RequestStatusPending
		if i >= 3 {
			status = models.RequestStatusResolved
		}
		req := &models.Request{
			ID:          fmt.Sprintf("req-%02d", i+1),
			Type:        reqTypes[i%3],
			Status:      status,
			SubmitterID: did(20 + i + 1),
			AreaID:      fmt.Sprintf("pa-nrt-001-%02d", i+1),
			Description: fmt.Sprintf("申請テスト%d", i+1),
			CreatedAt:   now.Add(-time.Duration(i*48) * time.Hour),
		}
		if err := repos.Notification.SaveRequest(req); err != nil {
			return err
		}
	}

	// 監査ログ
	auditActions := []models.AuditAction{
		models.AuditActionRoleChange,
		models.AuditActionAreaEdit,
		models.AuditActionApproval,
		models.AuditActionDoNotVisit,
		models.AuditActionForceReturn,
	}
	for i := 0; i < 8; i++ {
		log := &models.AuditLog{
			ID:        fmt.Sprintf("audit-%02d", i+1),
			RegionID:  regions[i%2].id,
			Action:    auditActions[i%5],
			ActorID:   did(1 + i%7),
			TargetID:  did(10 + i),
			Detail:    fmt.Sprintf("監査ログ%d", i+1),
			Timestamp: now.Add(-time.Duration(i*12) * time.Hour),
			CreatedAt: now.Add(-time.Duration(i*12) * time.Hour),
		}
		if err := repos.Notification.SaveAuditLog(log); err != nil {
			return err
		}
	}

	return nil
}

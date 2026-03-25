package testdata_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/testdata"
)

func TestSeedAll_NoError(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	if err := testdata.SeedAll(repos); err != nil {
		t.Fatalf("SeedAll: %v", err)
	}
}

func TestSeedAll_UserCount(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	users, _ := repos.User.ListUsers()
	if len(users) != 50 {
		t.Errorf("users = %d, want 50", len(users))
	}
}

func TestSeedAll_RoleDistribution(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	users, _ := repos.User.ListUsers()
	admins, editors, members := 0, 0, 0
	for _, u := range users {
		switch u.Role {
		case "admin":
			admins++
		case "editor":
			editors++
		case "member":
			members++
		}
	}
	if admins != 2 {
		t.Errorf("admins = %d, want 2", admins)
	}
	if editors != 5 {
		t.Errorf("editors = %d, want 5", editors)
	}
	if members != 43 {
		t.Errorf("members = %d, want 43", members)
	}
}

func TestSeedAll_Groups(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	groups, _ := repos.User.ListGroups()
	if len(groups) != 4 {
		t.Errorf("groups = %d, want 4", len(groups))
	}
}

func TestSeedAll_Regions(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	regions, _ := repos.Region.ListRegions()
	if len(regions) != 2 {
		t.Errorf("regions = %d, want 2", len(regions))
	}
}

func TestSeedAll_ParentAreas(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	// 成田: 6, 富里: 4
	nrt, _ := repos.Region.ListParentAreas("reg-nrt")
	tms, _ := repos.Region.ListParentAreas("reg-tms")
	if len(nrt) != 6 {
		t.Errorf("NRT parent areas = %d, want 6", len(nrt))
	}
	if len(tms) != 4 {
		t.Errorf("TMS parent areas = %d, want 4", len(tms))
	}
}

func TestSeedAll_Areas(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	// 加良部1: 5区域
	areas, _ := repos.Region.ListAreas("pa-nrt-001")
	if len(areas) != 5 {
		t.Errorf("pa-nrt-001 areas = %d, want 5", len(areas))
	}
}

func TestSeedAll_Teams(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	teams, _ := repos.Activity.ListTeams()
	if len(teams) != 15 {
		t.Errorf("teams = %d, want 15", len(teams))
	}
}

func TestSeedAll_Activities(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	// 最初の区域にアクティビティがあるはず
	acts, _ := repos.Activity.ListActivities("pa-nrt-001-01")
	if len(acts) == 0 {
		t.Error("expected activities for pa-nrt-001-01")
	}
}

func TestSeedAll_VisitRecords(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	// 最初の区域に訪問記録があるはず
	records, _ := repos.Activity.ListVisitRecords("pa-nrt-001-01")
	if len(records) == 0 {
		t.Error("expected visit records for pa-nrt-001-01")
	}
}

func TestSeedAll_Coverages(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	covs, _ := repos.Coverage.ListCoverages("pa-nrt-001")
	if len(covs) == 0 {
		t.Error("expected coverages for pa-nrt-001")
	}
}

func TestSeedAll_Notifications(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	// did:key:z6Mk0011のユーザーに通知があるはず
	notifs, _ := repos.Notification.ListNotifications("did:key:z6Mk0011")
	if len(notifs) == 0 {
		t.Error("expected notifications")
	}
}

func TestSeedAll_AuditLogs(t *testing.T) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)

	logs, _ := repos.Notification.ListAuditLogs("reg-nrt")
	if len(logs) == 0 {
		t.Error("expected audit logs for reg-nrt")
	}
}

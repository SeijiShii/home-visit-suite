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

package linkself_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/linkself"
)

func newPolicy(role string) *linkself.RoleBasedAccessPolicy {
	return &linkself.RoleBasedAccessPolicy{
		GetRole: func(did string) string { return role },
	}
}

func TestCanRead_AllRolesAllTables(t *testing.T) {
	tables := append(linkself.NetworkTables, linkself.DeviceTables...)
	for _, role := range []string{"admin", "editor", "member"} {
		policy := newPolicy(role)
		for _, tbl := range tables {
			if !policy.CanRead("did:key:test", tbl) {
				t.Errorf("role=%s should be able to read table=%s", role, tbl)
			}
		}
	}
}

func TestCanWrite_AdminOnly(t *testing.T) {
	adminTables := []string{linkself.TableRegions, linkself.TableUsers, linkself.TableOrgGroups}
	for _, tbl := range adminTables {
		if !newPolicy("admin").CanWrite("", tbl) {
			t.Errorf("admin should write to %s", tbl)
		}
		if newPolicy("editor").CanWrite("", tbl) {
			t.Errorf("editor should NOT write to %s", tbl)
		}
		if newPolicy("member").CanWrite("", tbl) {
			t.Errorf("member should NOT write to %s", tbl)
		}
	}
}

func TestCanWrite_EditorPlus(t *testing.T) {
	editorTables := []string{
		linkself.TableParentAreas, linkself.TableAreas, linkself.TablePlaces,
		linkself.TableMapNetwork, linkself.TableMemberTags,
		linkself.TableActivityAssignments, linkself.TableVisitRecordEdits,
		linkself.TableCoverages, linkself.TableSchedulePeriods,
		linkself.TableScopes, linkself.TableAreaAvailability,
		linkself.TableInvitations,
	}
	for _, tbl := range editorTables {
		if !newPolicy("admin").CanWrite("", tbl) {
			t.Errorf("admin should write to %s", tbl)
		}
		if !newPolicy("editor").CanWrite("", tbl) {
			t.Errorf("editor should write to %s", tbl)
		}
		if newPolicy("member").CanWrite("", tbl) {
			t.Errorf("member should NOT write to %s", tbl)
		}
	}
}

func TestCanWrite_AllMembers(t *testing.T) {
	memberTables := []string{
		linkself.TableTeams, linkself.TableActivities,
		linkself.TableVisitRecords, linkself.TableRequests,
	}
	for _, tbl := range memberTables {
		for _, role := range []string{"admin", "editor", "member"} {
			if !newPolicy(role).CanWrite("", tbl) {
				t.Errorf("role=%s should write to %s", role, tbl)
			}
		}
	}
}

func TestCanWrite_SystemOnly(t *testing.T) {
	systemTables := []string{linkself.TableAuditLog, linkself.TableNotifications}
	for _, tbl := range systemTables {
		for _, role := range []string{"admin", "editor", "member"} {
			if newPolicy(role).CanWrite("", tbl) {
				t.Errorf("role=%s should NOT directly write to %s", role, tbl)
			}
		}
	}
}

func TestCanWrite_PersonalTables(t *testing.T) {
	personalTables := []string{
		linkself.TablePersonalNotes, linkself.TablePersonalTags,
		linkself.TablePersonalTagAssignments,
	}
	for _, tbl := range personalTables {
		for _, role := range []string{"admin", "editor", "member"} {
			if !newPolicy(role).CanWrite("", tbl) {
				t.Errorf("role=%s should write to personal table %s", role, tbl)
			}
		}
	}
}

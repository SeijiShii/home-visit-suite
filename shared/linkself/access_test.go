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

func TestCanRead_AllRolesAllChannels(t *testing.T) {
	channels := linkself.AllChannels()
	for _, role := range []string{"admin", "editor", "member"} {
		policy := newPolicy(role)
		for _, ch := range channels {
			if !policy.CanRead("did:key:test", ch.Name) {
				t.Errorf("role=%s should be able to read channel=%s", role, ch.Name)
			}
		}
	}
}

func TestCanWrite_AdminOnly(t *testing.T) {
	adminChannels := []string{"regions", "users", "org_groups", "app_config"}
	for _, ch := range adminChannels {
		if !newPolicy("admin").CanWrite("", ch) {
			t.Errorf("admin should write to %s", ch)
		}
		if newPolicy("editor").CanWrite("", ch) {
			t.Errorf("editor should NOT write to %s", ch)
		}
		if newPolicy("member").CanWrite("", ch) {
			t.Errorf("member should NOT write to %s", ch)
		}
	}
}

func TestCanWrite_EditorPlus(t *testing.T) {
	editorChannels := []string{"parent_areas", "areas", "places", "map_vertices", "map_edges", "map_polygons",
		"member_tags", "activity_assignments", "visit_record_edits",
		"coverages", "schedule_periods", "scopes", "area_availability", "invitations"}
	for _, ch := range editorChannels {
		if !newPolicy("admin").CanWrite("", ch) {
			t.Errorf("admin should write to %s", ch)
		}
		if !newPolicy("editor").CanWrite("", ch) {
			t.Errorf("editor should write to %s", ch)
		}
		if newPolicy("member").CanWrite("", ch) {
			t.Errorf("member should NOT write to %s", ch)
		}
	}
}

func TestCanWrite_AllMembers(t *testing.T) {
	memberChannels := []string{"teams", "activities", "visit_records", "requests"}
	for _, ch := range memberChannels {
		for _, role := range []string{"admin", "editor", "member"} {
			if !newPolicy(role).CanWrite("", ch) {
				t.Errorf("role=%s should write to %s", role, ch)
			}
		}
	}
}

func TestCanWrite_SystemOnly(t *testing.T) {
	systemChannels := []string{"audit_log", "notifications"}
	for _, ch := range systemChannels {
		for _, role := range []string{"admin", "editor", "member"} {
			if newPolicy(role).CanWrite("", ch) {
				t.Errorf("role=%s should NOT directly write to %s", role, ch)
			}
		}
	}
}

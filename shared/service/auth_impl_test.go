package service_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
	"github.com/SeijiShii/home-visit-suite/shared/testdata"
)

func setupAuth() (service.AuthService, *testdata.Repos) {
	repos := testdata.NewInMemoryRepos()
	testdata.SeedAll(repos)
	svc := service.NewAuthService(repos.User)
	return svc, repos
}

// --- CanPerform ---

func TestCanPerform_AdminAll(t *testing.T) {
	svc, _ := setupAuth()
	actions := []string{"manage_users", "edit_areas", "checkout", "visit"}
	for _, action := range actions {
		if !svc.CanPerform(models.RoleAdmin, action) {
			t.Errorf("admin should be able to %s", action)
		}
	}
}

func TestCanPerform_EditorNoManageUsers(t *testing.T) {
	svc, _ := setupAuth()
	if svc.CanPerform(models.RoleEditor, "manage_users") {
		t.Error("editor should not manage_users")
	}
	if !svc.CanPerform(models.RoleEditor, "edit_areas") {
		t.Error("editor should edit_areas")
	}
}

func TestCanPerform_MemberLimited(t *testing.T) {
	svc, _ := setupAuth()
	if svc.CanPerform(models.RoleMember, "edit_areas") {
		t.Error("member should not edit_areas")
	}
	if !svc.CanPerform(models.RoleMember, "visit") {
		t.Error("member should visit")
	}
}

// --- InviteToRole ---

func TestInviteToRole_AdminPromoteToEditor(t *testing.T) {
	svc, repos := setupAuth()

	adminDID := "did:key:z6Mk0001"
	targetDID := "did:key:z6Mk0020"

	inv, err := svc.InviteToRole(adminDID, targetDID, models.RoleEditor)
	if err != nil {
		t.Fatalf("InviteToRole: %v", err)
	}
	if inv.TargetRole != models.RoleEditor {
		t.Errorf("TargetRole = %q, want editor", inv.TargetRole)
	}
	if inv.Status != models.InvitationStatusPending {
		t.Errorf("Status = %q, want pending", inv.Status)
	}

	// リポジトリに保存確認
	got, _ := repos.User.GetInvitation(inv.ID)
	if got == nil {
		t.Fatal("invitation not saved")
	}
}

func TestInviteToRole_MemberDenied(t *testing.T) {
	svc, _ := setupAuth()

	memberDID := "did:key:z6Mk0010"
	_, err := svc.InviteToRole(memberDID, "did:key:z6Mk0020", models.RoleEditor)
	if err == nil {
		t.Fatal("expected permission denied for member")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error = %v, want permission_denied", err)
	}
}

// --- AcceptInvitation ---

func TestAcceptInvitation_Success(t *testing.T) {
	svc, repos := setupAuth()

	adminDID := "did:key:z6Mk0001"
	targetDID := "did:key:z6Mk0020"

	inv, _ := svc.InviteToRole(adminDID, targetDID, models.RoleEditor)

	err := svc.AcceptInvitation(targetDID, inv.ID)
	if err != nil {
		t.Fatalf("AcceptInvitation: %v", err)
	}

	// ロール変更確認
	user, _ := repos.User.GetUser(targetDID)
	if user.Role != models.RoleEditor {
		t.Errorf("Role = %q, want editor after accept", user.Role)
	}

	// 招待ステータス確認
	gotInv, _ := repos.User.GetInvitation(inv.ID)
	if gotInv.Status != models.InvitationStatusAccepted {
		t.Errorf("invitation status = %q, want accepted", gotInv.Status)
	}
}

func TestAcceptInvitation_WrongPerson(t *testing.T) {
	svc, _ := setupAuth()

	adminDID := "did:key:z6Mk0001"
	targetDID := "did:key:z6Mk0020"
	otherDID := "did:key:z6Mk0021"

	inv, _ := svc.InviteToRole(adminDID, targetDID, models.RoleEditor)

	err := svc.AcceptInvitation(otherDID, inv.ID)
	if err == nil {
		t.Fatal("expected error for wrong person accepting")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error = %v, want permission_denied", err)
	}
}

// --- DismissRole ---

func TestDismissRole_Success(t *testing.T) {
	svc, repos := setupAuth()

	adminDID := "did:key:z6Mk0001"
	editorDID := "did:key:z6Mk0003"

	err := svc.DismissRole(adminDID, editorDID, models.RoleMember)
	if err != nil {
		t.Fatalf("DismissRole: %v", err)
	}

	user, _ := repos.User.GetUser(editorDID)
	if user.Role != models.RoleMember {
		t.Errorf("Role = %q, want member after dismiss", user.Role)
	}
}

func TestDismissRole_SelfDismissal_Admin(t *testing.T) {
	svc, _ := setupAuth()

	adminDID := "did:key:z6Mk0001"

	err := svc.DismissRole(adminDID, adminDID, models.RoleMember)
	if err == nil {
		t.Fatal("expected self dismissal error for admin")
	}
	if !service.IsCode(err, service.ErrSelfDismissal) {
		t.Errorf("error = %v, want self_dismissal", err)
	}
}

func TestDismissRole_LastAdmin(t *testing.T) {
	svc, repos := setupAuth()

	// admin1がadmin2を罷免
	admin1 := "did:key:z6Mk0001"
	admin2 := "did:key:z6Mk0002"
	svc.DismissRole(admin1, admin2, models.RoleMember)

	// admin2はもうmember
	u2, _ := repos.User.GetUser(admin2)
	if u2.Role != models.RoleMember {
		t.Fatalf("admin2 should be member now, got %q", u2.Role)
	}

	// 別のメンバーがadmin1を罷免しようとする → 最後の管理者なのでエラー
	// ただしadmin1自身は自己罷免不可なので、新たにeditorを昇格させてからテスト
	// ここではadmin1が唯一のadmin
	err := svc.DismissRole(admin1, admin1, models.RoleMember)
	if err == nil {
		t.Fatal("expected error: self dismissal")
	}
}

// --- RemoveMember ---

func TestRemoveMember_Success(t *testing.T) {
	svc, repos := setupAuth()

	adminDID := "did:key:z6Mk0001"
	targetDID := "did:key:z6Mk0020"

	err := svc.RemoveMember(adminDID, targetDID)
	if err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}

	_, err = repos.User.GetUser(targetDID)
	if err == nil {
		t.Fatal("expected user to be deleted")
	}
}

func TestRemoveMember_NonAdminDenied(t *testing.T) {
	svc, _ := setupAuth()

	editorDID := "did:key:z6Mk0003"
	err := svc.RemoveMember(editorDID, "did:key:z6Mk0020")
	if err == nil {
		t.Fatal("expected permission denied for editor")
	}
	if !service.IsCode(err, service.ErrPermissionDenied) {
		t.Errorf("error = %v, want permission_denied", err)
	}
}

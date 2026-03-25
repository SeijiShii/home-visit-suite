import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../contexts/I18nContext";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";
import { models } from "../../wailsjs/go/models";

type ModalState =
  | { type: "none" }
  | { type: "addGroup" }
  | { type: "editGroup"; group: models.Group }
  | { type: "deleteGroup"; group: models.Group }
  | { type: "assignGroup"; user: models.User };

export function UsersPage() {
  const { t } = useI18n();
  const u = t.users;
  const c = t.common;

  const [users, setUsers] = useState<models.User[]>([]);
  const [groups, setGroups] = useState<models.Group[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [search, setSearch] = useState("");

  const groupNameRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [u, g] = await Promise.all([
        UserBinding.ListUsers(),
        UserBinding.ListGroups(),
      ]);
      setUsers(u || []);
      setGroups(g || []);
    } catch (e) {
      console.error("reload failed:", e);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const groupMap = new Map(groups.map((g) => [g.id, g]));

  const groupName = (groupId: string) =>
    groupMap.get(groupId)?.name ?? u.unassigned;

  const membersOfGroup = (groupId: string) =>
    users.filter((user) => user.orgGroupId === groupId);

  const unassignedMembers = users.filter(
    (user) => !user.orgGroupId || !groupMap.has(user.orgGroupId)
  );

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return u.roles.admin;
      case "editor":
        return u.roles.editor;
      default:
        return u.roles.member;
    }
  };

  const filteredUsers = search
    ? users.filter(
        (user) =>
          user.name.includes(search) ||
          roleLabel(user.role).includes(search) ||
          groupName(user.orgGroupId).includes(search)
      )
    : users;

  const handleSaveGroup = async () => {
    const name = groupNameRef.current?.value.trim();
    if (!name) return;
    if (modal.type === "addGroup") {
      await UserBinding.SaveGroup({ id: `grp-${Date.now()}`, name } as models.Group);
    } else if (modal.type === "editGroup") {
      await UserBinding.SaveGroup({ ...modal.group, name } as models.Group);
    }
    setModal({ type: "none" });
    reload();
  };

  const handleDeleteGroup = async () => {
    if (modal.type !== "deleteGroup") return;
    const members = membersOfGroup(modal.group.id);
    for (const member of members) {
      await UserBinding.SaveUser({ ...member, orgGroupId: "" } as models.User);
    }
    await UserBinding.DeleteGroup(modal.group.id);
    setModal({ type: "none" });
    reload();
  };

  const handleAssignGroup = async (groupId: string) => {
    if (modal.type !== "assignGroup") return;
    await UserBinding.SaveUser({ ...modal.user, orgGroupId: groupId } as models.User);
    setModal({ type: "none" });
    reload();
  };

  const handleRemoveFromGroup = async (user: models.User) => {
    await UserBinding.SaveUser({ ...user, orgGroupId: "" } as models.User);
    reload();
  };

  return (
    <>
      <div className="users-header">
        <h1 className="users-title">{u.title}</h1>
      </div>

      {/* Groups */}
      <section>
        <div className="group-card-header">
          <h2>{u.groups}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: "addGroup" })}>
            {u.addGroup}
          </button>
        </div>

        {groups.length === 0 ? (
          <p>{u.noGroups}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {groups.map((group) => {
              const members = membersOfGroup(group.id);
              return (
                <div key={group.id} className="group-card">
                  <div className="group-card-header">
                    <span className="group-card-name">{group.name}</span>
                    <span className="group-card-count">({members.length}{u.memberCount})</span>
                    <div className="group-card-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: "editGroup", group })}>
                        {c.edit}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setModal({ type: "deleteGroup", group })}>
                        {c.delete}
                      </button>
                    </div>
                  </div>
                  <div className="chip-list">
                    {members.map((member) => (
                      <span key={member.id} className="member-chip">
                        {member.name}
                        <span className="member-chip-role">{roleLabel(member.role)}</span>
                        <button
                          className="member-chip-remove"
                          onClick={() => handleRemoveFromGroup(member)}
                          title={u.removeFromGroup}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {unassignedMembers.length > 0 && (
              <div className="group-unassigned">
                <div className="group-card-header">
                  <span className="group-card-name">{u.unassigned}</span>
                  <span className="group-card-count">({unassignedMembers.length}{u.memberCount})</span>
                </div>
                <div className="chip-list">
                  {unassignedMembers.map((member) => (
                    <span
                      key={member.id}
                      className="member-chip member-chip-unassigned"
                      onClick={() => setModal({ type: "assignGroup", user: member })}
                      title={u.assignToGroup}
                    >
                      {member.name}
                      <span className="member-chip-role">{roleLabel(member.role)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Members table */}
      <section>
        <div className="group-card-header">
          <h2>{u.members} ({users.length})</h2>
          <div className="group-card-actions">
            <input
              type="text"
              className="search-input"
              placeholder={c.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <p>{u.noMembers}</p>
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th>{u.members}</th>
                <th>Role</th>
                <th>{u.groups}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{roleLabel(user.role)}</td>
                  <td>
                    <span
                      className="member-table-group"
                      onClick={() => setModal({ type: "assignGroup", user })}
                    >
                      {groupName(user.orgGroupId)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add/Edit Group Modal */}
      {(modal.type === "addGroup" || modal.type === "editGroup") && (
        <div className="modal-overlay" onClick={() => setModal({ type: "none" })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {modal.type === "addGroup" ? u.addGroup : u.editGroup}
            </div>
            <div className="modal-field">
              <label className="modal-label">{u.groupName}</label>
              <input
                ref={groupNameRef}
                type="text"
                className="modal-input"
                defaultValue={modal.type === "editGroup" ? modal.group.name : ""}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveGroup()}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
              <button className="btn btn-primary" onClick={handleSaveGroup}>
                {c.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Modal */}
      {modal.type === "deleteGroup" && (
        <div className="modal-overlay" onClick={() => setModal({ type: "none" })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{u.deleteGroup}</div>
            <p style={{ fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>
              {modal.group.name}
            </p>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
              {u.confirmDeleteGroup}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
              <button className="btn btn-danger" onClick={handleDeleteGroup}>
                {c.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Group Modal */}
      {modal.type === "assignGroup" && (
        <div className="modal-overlay" onClick={() => setModal({ type: "none" })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{u.assignToGroup}</div>
            <p style={{ fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>
              {modal.user.name}
              <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 8 }}>
                {roleLabel(modal.user.role)}
              </span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`group-pick-btn ${modal.user.orgGroupId === group.id ? "group-pick-btn-active" : ""}`}
                  onClick={() => handleAssignGroup(group.id)}
                >
                  {group.name}
                  <span className="group-pick-count">
                    ({membersOfGroup(group.id).length}{u.memberCount})
                  </span>
                </button>
              ))}
              <button
                className={`group-pick-btn group-pick-btn-unassigned ${!modal.user.orgGroupId ? "group-pick-btn-active" : ""}`}
                onClick={() => handleAssignGroup("")}
              >
                {u.unassigned}
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

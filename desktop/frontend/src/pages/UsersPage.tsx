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

  // --- Group helpers ---

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

  // --- Filtered users ---

  const filteredUsers = search
    ? users.filter(
        (user) =>
          user.name.includes(search) ||
          roleLabel(user.role).includes(search) ||
          groupName(user.orgGroupId).includes(search)
      )
    : users;

  // --- Group CRUD ---

  const handleSaveGroup = async () => {
    const name = groupNameRef.current?.value.trim();
    if (!name) return;

    if (modal.type === "addGroup") {
      const id = `grp-${Date.now()}`;
      await UserBinding.SaveGroup({ id, name } as models.Group);
    } else if (modal.type === "editGroup") {
      await UserBinding.SaveGroup({
        ...modal.group,
        name,
      } as models.Group);
    }
    setModal({ type: "none" });
    reload();
  };

  const handleDeleteGroup = async () => {
    if (modal.type !== "deleteGroup") return;
    const groupId = modal.group.id;

    // Unassign all members from this group
    const members = membersOfGroup(groupId);
    for (const member of members) {
      await UserBinding.SaveUser({
        ...member,
        orgGroupId: "",
      } as models.User);
    }
    await UserBinding.DeleteGroup(groupId);
    setModal({ type: "none" });
    reload();
  };

  const handleAssignGroup = async (groupId: string) => {
    if (modal.type !== "assignGroup") return;
    await UserBinding.SaveUser({
      ...modal.user,
      orgGroupId: groupId,
    } as models.User);
    setModal({ type: "none" });
    reload();
  };

  const handleRemoveFromGroup = async (user: models.User) => {
    await UserBinding.SaveUser({
      ...user,
      orgGroupId: "",
    } as models.User);
    reload();
  };

  return (
    <>
      <h1>{u.title}</h1>

      {/* --- Groups section --- */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2>{u.groups}</h2>
          <button onClick={() => setModal({ type: "addGroup" })}>
            {u.addGroup}
          </button>
        </div>

        {groups.length === 0 ? (
          <p>{u.noGroups}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groups.map((group) => {
              const members = membersOfGroup(group.id);
              return (
                <div
                  key={group.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <strong>{group.name}</strong>
                    <span style={{ color: "#888" }}>
                      ({members.length}
                      {u.memberCount})
                    </span>
                    <button
                      onClick={() => setModal({ type: "editGroup", group })}
                      style={{ marginLeft: "auto" }}
                    >
                      {c.edit}
                    </button>
                    <button
                      onClick={() => setModal({ type: "deleteGroup", group })}
                    >
                      {c.delete}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {members.map((member) => (
                      <span
                        key={member.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "#f0f0f0",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 13,
                        }}
                      >
                        {member.name}
                        <span style={{ color: "#888", fontSize: 11 }}>
                          {roleLabel(member.role)}
                        </span>
                        <button
                          onClick={() => handleRemoveFromGroup(member)}
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 14,
                            color: "#999",
                          }}
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

            {/* Unassigned */}
            {unassignedMembers.length > 0 && (
              <div
                style={{
                  border: "1px dashed #aaa",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <strong>{u.unassigned}</strong>
                  <span style={{ color: "#888", marginLeft: 8 }}>
                    ({unassignedMembers.length}
                    {u.memberCount})
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {unassignedMembers.map((member) => (
                    <span
                      key={member.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "#fff8e0",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                      onClick={() => setModal({ type: "assignGroup", user: member })}
                      title={u.assignToGroup}
                    >
                      {member.name}
                      <span style={{ color: "#888", fontSize: 11 }}>
                        {roleLabel(member.role)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* --- Members table --- */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2>
            {u.members} ({users.length})
          </h2>
          <input
            type="text"
            placeholder={c.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginLeft: "auto", padding: "4px 8px" }}
          />
        </div>

        {filteredUsers.length === 0 ? (
          <p>{u.noMembers}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>名前</th>
                <th style={{ padding: "6px 8px" }}>ロール</th>
                <th style={{ padding: "6px 8px" }}>{u.groups}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  style={{ borderBottom: "1px solid #eee" }}
                >
                  <td style={{ padding: "6px 8px" }}>{user.name}</td>
                  <td style={{ padding: "6px 8px" }}>{roleLabel(user.role)}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <span
                      style={{ cursor: "pointer", textDecoration: "underline" }}
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

      {/* --- Modals --- */}

      {/* Add/Edit Group Modal */}
      {(modal.type === "addGroup" || modal.type === "editGroup") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModal({ type: "none" })}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              {modal.type === "addGroup" ? u.addGroup : u.editGroup}
            </h3>
            <div style={{ marginTop: 12 }}>
              <label>{u.groupName}</label>
              <input
                ref={groupNameRef}
                type="text"
                defaultValue={
                  modal.type === "editGroup" ? modal.group.name : ""
                }
                style={{ display: "block", width: "100%", padding: "6px 8px", marginTop: 4 }}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveGroup()}
              />
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
              <button onClick={handleSaveGroup}>{c.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Modal */}
      {modal.type === "deleteGroup" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModal({ type: "none" })}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{u.deleteGroup}</h3>
            <p>
              <strong>{modal.group.name}</strong>
            </p>
            <p>{u.confirmDeleteGroup}</p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
              <button
                onClick={handleDeleteGroup}
                style={{ color: "red" }}
              >
                {c.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Group Modal */}
      {modal.type === "assignGroup" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModal({ type: "none" })}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{u.assignToGroup}</h3>
            <p>
              <strong>{modal.user.name}</strong> ({roleLabel(modal.user.role)})
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 12,
              }}
            >
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleAssignGroup(group.id)}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    background:
                      modal.user.orgGroupId === group.id ? "#e0e8ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  {group.name} ({membersOfGroup(group.id).length}
                  {u.memberCount})
                </button>
              ))}
              <button
                onClick={() => handleAssignGroup("")}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  border: "1px dashed #aaa",
                  borderRadius: 4,
                  background:
                    !modal.user.orgGroupId ? "#fff8e0" : "#fff",
                  cursor: "pointer",
                }}
              >
                {u.unassigned}
              </button>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button onClick={() => setModal({ type: "none" })}>
                {c.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

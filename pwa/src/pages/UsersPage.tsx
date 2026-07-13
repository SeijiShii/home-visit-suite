// desktop/frontend/src/pages/UsersPage.tsx からの移植。
// Wails UserBinding 依存を useServices() に置き換えた。
//
// メンバーグループ（OrgGroup）廃止に伴い、Group / addGroup / editGroup /
// deleteGroup / assignGroup / confirmRemove のバリアントは削除済み。
// 旧グループ機能の代替はメンバータグで運用する。

import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useServices } from "../contexts/ServicesContext";
import { TAG_COLOR_PALETTE, type Tag, type User } from "../domain/models/user";
import { newId } from "../services/id";

type ModalState =
  | { type: "none" }
  | { type: "addTag" }
  | { type: "editTag"; tag: Tag }
  | { type: "deleteTag"; tag: Tag }
  | { type: "assignTags"; user: User };

function tagBgColor(hex: string): string {
  // Convert hex color to light background variant
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

export function UsersPage() {
  const { t } = useI18n();
  const { userRepo } = useServices();
  const u = t.users;
  const c = t.common;

  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [search, setSearch] = useState("");
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [showTagFilter, setShowTagFilter] = useState(false);

  const tagNameRef = useRef<HTMLInputElement>(null);
  const [tagColor, setTagColor] = useState(TAG_COLOR_PALETTE[0]);

  // assignTags modal state
  const [assignTagIds, setAssignTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");

  const reload = useCallback(async () => {
    try {
      const [userList, tagList] = await Promise.all([
        userRepo.listUsers(),
        userRepo.listTags(),
      ]);
      setUsers(userList);
      setTags(tagList);
    } catch (e) {
      console.error("reload failed:", e);
    }
  }, [userRepo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const tagMap = new Map(tags.map((t) => [t.id, t]));

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

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case "admin":
        return "role-badge role-badge-admin";
      case "editor":
        return "role-badge role-badge-editor";
      default:
        return "role-badge role-badge-member";
    }
  };

  const roleOrder = (role: string) => {
    switch (role) {
      case "admin":
        return 0;
      case "editor":
        return 1;
      default:
        return 2;
    }
  };

  const sortByRole = (a: User, b: User) =>
    roleOrder(a.role) - roleOrder(b.role);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !search ||
      user.name.includes(search) ||
      roleLabel(user.role).includes(search);
    const matchesTag = !filterTagId || user.tagIds.includes(filterTagId);
    return matchesSearch && matchesTag;
  });

  // --- Tag handlers ---

  const handleSaveTag = async () => {
    const name = tagNameRef.current?.value.trim();
    if (!name) return;
    try {
      if (modal.type === "addTag") {
        await userRepo.saveTag({ id: newId("tag"), name, color: tagColor });
      } else if (modal.type === "editTag") {
        await userRepo.saveTag({ ...modal.tag, name, color: tagColor });
      }
      setModal({ type: "none" });
      void reload();
    } catch (e) {
      console.error("save tag failed:", e);
    }
  };

  const handleDeleteTag = async () => {
    if (modal.type !== "deleteTag") return;
    // Remove tag from all users who have it
    const affectedUsers = users.filter((user) =>
      user.tagIds.includes(modal.tag.id),
    );
    for (const user of affectedUsers) {
      await userRepo.saveUser({
        ...user,
        tagIds: user.tagIds.filter((id) => id !== modal.tag.id),
      });
    }
    await userRepo.deleteTag(modal.tag.id);
    if (filterTagId === modal.tag.id) setFilterTagId(null);
    setModal({ type: "none" });
    void reload();
  };

  const tagUsageCount = (tagId: string) =>
    users.filter((user) => user.tagIds.includes(tagId)).length;

  const handleOpenAssignTags = (user: User) => {
    setAssignTagIds([...user.tagIds]);
    setNewTagName("");
    setModal({ type: "assignTags", user });
  };

  const handleToggleAssignTag = (tagId: string) => {
    setAssignTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : prev.length < 10
          ? [...prev, tagId]
          : prev,
    );
  };

  const handleSaveAssignTags = async () => {
    if (modal.type !== "assignTags") return;
    await userRepo.saveUser({ ...modal.user, tagIds: assignTagIds });
    setModal({ type: "none" });
    void reload();
  };

  const handleCreateTagInAssign = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const id = newId("tag");
      await userRepo.saveTag({ id, name, color: "" });
      setNewTagName("");
      await reload();
      if (assignTagIds.length < 10) {
        setAssignTagIds((prev) => [...prev, id]);
      }
    } catch (e) {
      console.error("create tag in assign failed:", e);
    }
  };

  return (
    <>
      <div className="users-header">
        <h1 className="users-title">{u.title}</h1>
      </div>

      {/* メンバーグループ廃止済み（2026-05-06 仕様改訂）。
          チーム単位の分類はメンバータグで運用する。 */}

      {/* Tags */}
      <section>
        <div className="group-card-header">
          <h2>{u.tags}</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setTagColor(TAG_COLOR_PALETTE[0]);
              setModal({ type: "addTag" });
            }}
          >
            {u.addTag}
          </button>
        </div>

        {tags.length === 0 ? (
          <p>{u.noTags}</p>
        ) : (
          <div className="tag-manage-section">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="tag-chip-action"
                style={{
                  background: tagBgColor(tag.color),
                  borderColor: tag.color,
                  color: tag.color,
                }}
              >
                {tag.name}
                <span className="tag-chip-action-btns">
                  <button
                    className="tag-chip-action-btn"
                    onClick={() => {
                      setTagColor(tag.color);
                      setModal({ type: "editTag", tag });
                    }}
                    title={u.editTag}
                  >
                    &#9998;
                  </button>
                  <button
                    className="tag-chip-action-btn danger"
                    onClick={() => setModal({ type: "deleteTag", tag })}
                    title={u.deleteTag}
                  >
                    &times;
                  </button>
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Members table */}
      <section>
        <div className="group-card-header">
          <h2>
            {u.members} ({users.length})
          </h2>
          <div className="group-card-actions">
            <input
              type="text"
              className="search-input"
              placeholder={c.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {tags.length > 0 && (
              <div className="tag-filter">
                <button
                  className="tag-filter-btn"
                  onClick={() => setShowTagFilter(!showTagFilter)}
                >
                  {u.filterByTag}
                  {filterTagId && `: ${tagMap.get(filterTagId)?.name}`}
                </button>
                {showTagFilter && (
                  <div className="tag-filter-dropdown">
                    <button
                      className={`tag-filter-item${!filterTagId ? " active" : ""}`}
                      onClick={() => {
                        setFilterTagId(null);
                        setShowTagFilter(false);
                      }}
                    >
                      {u.allTags}
                    </button>
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        className={`tag-filter-item${filterTagId === tag.id ? " active" : ""}`}
                        onClick={() => {
                          setFilterTagId(tag.id);
                          setShowTagFilter(false);
                        }}
                      >
                        <span
                          className="tag-chip"
                          style={{
                            background: tagBgColor(tag.color),
                            borderColor: tag.color,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <p>{u.noMembers}</p>
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th>{u.members}</th>
                <th>{u.role}</th>
                <th>{u.tags}</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredUsers].sort(sortByRole).map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>
                    <span className={roleBadgeClass(user.role)}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td>
                    {user.tagIds.length > 0 ? (
                      <div
                        className="member-table-tags"
                        onClick={() => handleOpenAssignTags(user)}
                      >
                        {user.tagIds.map((tagId) => {
                          const tag = tagMap.get(tagId);
                          if (!tag) return null;
                          return (
                            <span
                              key={tagId}
                              className="tag-chip"
                              style={{
                                background: tagBgColor(tag.color),
                                borderColor: tag.color,
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span
                        className="member-table-tags-empty"
                        onClick={() => handleOpenAssignTags(user)}
                      >
                        +
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add/Edit Tag Modal */}
      {(modal.type === "addTag" || modal.type === "editTag") && (
        <div
          className="modal-overlay"
          onClick={() => setModal({ type: "none" })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {modal.type === "addTag" ? u.addTag : u.editTag}
            </div>
            <div className="modal-field">
              <label className="modal-label">{u.tagName}</label>
              <input
                ref={tagNameRef}
                type="text"
                className="modal-input"
                maxLength={16}
                defaultValue={modal.type === "editTag" ? modal.tag.name : ""}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveTag()}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">{u.tagColor}</label>
              <div className="tag-color-picker">
                {TAG_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    className={`tag-color-swatch${tagColor === color ? " selected" : ""}`}
                    style={{ background: color }}
                    onClick={() => setTagColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setModal({ type: "none" })}
              >
                {c.cancel}
              </button>
              <button className="btn btn-primary" onClick={handleSaveTag}>
                {c.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tag Modal */}
      {modal.type === "deleteTag" && (
        <div
          className="modal-overlay"
          onClick={() => setModal({ type: "none" })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{u.deleteTag}</div>
            <p style={{ fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>
              <span
                className="tag-chip"
                style={{
                  background: tagBgColor(modal.tag.color),
                  borderColor: modal.tag.color,
                  color: modal.tag.color,
                  fontSize: 14,
                }}
              >
                {modal.tag.name}
              </span>
            </p>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
              {u.confirmDeleteTag.replace(
                "{count}",
                String(tagUsageCount(modal.tag.id)),
              )}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setModal({ type: "none" })}
              >
                {c.cancel}
              </button>
              <button className="btn btn-danger" onClick={handleDeleteTag}>
                {c.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Tags Modal */}
      {modal.type === "assignTags" && (
        <div
          className="modal-overlay"
          onClick={() => setModal({ type: "none" })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{u.assignTags}</div>
            <p style={{ fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>
              {modal.user.name}
              <span
                style={{ fontWeight: 400, color: "#64748b", marginLeft: 8 }}
              >
                {roleLabel(modal.user.role)}
              </span>
            </p>

            {assignTagIds.length >= 10 && (
              <p
                style={{
                  color: "#f97316",
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                {u.tagLimit}
              </p>
            )}

            <div className="tag-assign-list">
              {tags.map((tag) => {
                const selected = assignTagIds.includes(tag.id);
                const atLimit = assignTagIds.length >= 10 && !selected;
                return (
                  <button
                    key={tag.id}
                    className={`tag-assign-item${selected ? " selected" : ""}${atLimit ? " disabled" : ""}`}
                    onClick={() => !atLimit && handleToggleAssignTag(tag.id)}
                    disabled={atLimit}
                  >
                    <span
                      className="tag-chip"
                      style={{
                        background: tagBgColor(tag.color),
                        borderColor: tag.color,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                    {selected && <span>&#10003;</span>}
                  </button>
                );
              })}
            </div>

            <div className="tag-assign-new">
              <input
                type="text"
                placeholder={u.addTag}
                maxLength={16}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleCreateTagInAssign()
                }
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreateTagInAssign}
                disabled={!newTagName.trim()}
              >
                +
              </button>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setModal({ type: "none" })}
              >
                {c.cancel}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAssignTags}
              >
                {c.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

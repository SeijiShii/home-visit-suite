import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import {
  useIdentity,
  isRoleAtLeast,
  type Role,
} from "../contexts/IdentityContext";

interface NavItem {
  to: string;
  labelKey: keyof ReturnType<typeof useI18n>["t"]["nav"];
  icon: React.ReactNode;
  end?: boolean;
  /** このメニュー項目を表示するために必要な最低ロール（未指定なら全ロール表示） */
  minRole?: Role;
}

const navItems: NavItem[] = [
  {
    to: "/",
    labelKey: "dashboard",
    end: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    // 区域編集（地図・ポリゴン編集）: 編集メンバー以上
    // 仕様 docs/wants/04_メンバー管理と権限.md「ポリゴン作成などの実作業は編集メンバーが行う」
    to: "/map",
    labelKey: "map",
    minRole: "editor",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
        <path d="M8 2v16" />
        <path d="M16 6v16" />
      </svg>
    ),
  },
  {
    // 領域管理: 管理者専用
    // 仕様 docs/wants/04_メンバー管理と権限.md「領域の管理は管理者専用ページで行う」
    to: "/regions",
    labelKey: "regions",
    minRole: "admin",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    // メンバー管理: 管理者専用
    // 仕様 docs/wants/04_メンバー管理と権限.md「管理者権限 > 招待と任免」「グループ管理」
    // 編集メンバーはメンバー管理権限を持たない（ロール任免・グループ変更等は admin のみ）
    to: "/users",
    labelKey: "users",
    minRole: "admin",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    // チェックアウト管理（編集メンバー以上専用）
    // 仕様 docs/wants/10_画面設計.md「チェックアウト管理 /checkouts」
    to: "/checkouts",
    labelKey: "checkouts",
    minRole: "editor",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 4v4" />
        <path d="M16 4v4" />
      </svg>
    ),
  },
  {
    // 申請管理: 編集メンバー以上
    // 仕様 docs/wants/07_通知と申請.md「申請は編集メンバーのタスクリストに表示される」
    to: "/requests",
    labelKey: "requests",
    minRole: "editor",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    to: "/settings",
    labelKey: "settings",
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export function Layout() {
  const { t } = useI18n();
  const { currentRole } = useIdentity();
  const [collapsed, setCollapsed] = useState(false);

  // ロール別フィルタ: minRole 指定があれば currentRole >= minRole の項目だけ表示
  const visibleItems = navItems.filter(
    (item) => !item.minRole || isRoleAtLeast(currentRole, item.minRole),
  );

  return (
    <div className="layout">
      <nav className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-header">
          <h3 className="app-title">Home Visit</h3>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            title="Toggle sidebar"
          >
            &#9776;
          </button>
        </div>
        <div className="nav-links">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{t.nav[item.labelKey]}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

package linkself

import ls "github.com/SeijiShii/link-self/core/pkg/linkself"

// AllMigrations はスキーママイグレーション定義。
var AllMigrations = []ls.Migration{
	{Version: 1, SQL: migrationV1},
}

const migrationV1 = `
-- 領域・区域
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    geometry TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS parent_areas (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    number TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    geometry TEXT,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    parent_area_id TEXT NOT NULL,
    number TEXT NOT NULL,
    polygon_id TEXT NOT NULL DEFAULT '',
    geometry TEXT,
    deleted_at TEXT
);

-- 場所
CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    type TEXT NOT NULL DEFAULT 'house',
    label TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    parent_id TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    languages TEXT NOT NULL DEFAULT '[]',
    do_not_visit INTEGER NOT NULL DEFAULT 0,
    do_not_visit_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 地図ネットワーク（map-polygon-editorのJSON全体）
CREATE TABLE IF NOT EXISTS map_network (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

-- メンバー
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    org_group_id TEXT NOT NULL DEFAULT '',
    tag_ids TEXT NOT NULL DEFAULT '[]',
    joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS member_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT ''
);

-- チーム・訪問活動
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    leader_id TEXT NOT NULL DEFAULT '',
    members TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    scope_id TEXT NOT NULL DEFAULT '',
    checkout_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    lent_by_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    returned_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_assignments (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    assigned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    place_id TEXT NOT NULL DEFAULT '',
    coord_lat REAL,
    coord_lng REAL,
    area_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    result TEXT NOT NULL,
    visited_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_record_edits (
    id TEXT PRIMARY KEY,
    visit_record_id TEXT NOT NULL,
    editor_id TEXT NOT NULL,
    old_body TEXT NOT NULL DEFAULT '',
    new_body TEXT NOT NULL DEFAULT '',
    edited_at TEXT NOT NULL
);

-- 網羅管理
CREATE TABLE IF NOT EXISTS coverages (
    id TEXT PRIMARY KEY,
    parent_area_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    actual_percent REAL NOT NULL DEFAULT 0,
    status_percent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_periods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scopes (
    id TEXT PRIMARY KEY,
    schedule_period_id TEXT NOT NULL,
    name TEXT NOT NULL,
    group_id TEXT NOT NULL DEFAULT '',
    parent_area_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS area_availability (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'lendable',
    scope_group_id TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    set_by_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 申請・通知
CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    submitter_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    coord_lat REAL,
    coord_lng REAL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL DEFAULT '',
    target_role TEXT NOT NULL DEFAULT 'member',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reference_id TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT
);

-- 監査
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 個人データ（ScopeDevice）
CREATE TABLE IF NOT EXISTS personal_notes (
    id TEXT PRIMARY KEY,
    visit_record_id TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_tag_assignments (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    visit_record_id TEXT NOT NULL
);
`

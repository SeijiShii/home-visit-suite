# LinkSelfストレージ実装プラン

## 概要

現在のInMemory/JSONFileリポジトリ実装を、LinkSelf MyDB（SQL）ベースの実装に置き換える。
LinkSelfの透過的同期により、マルチデバイス同期とネットワーク共有が自動的に実現される。

## 前提: LinkSelf新API

LinkSelfの大幅アップデート（Phase A〜E）により、以下が利用可能:

| 機能 | API |
|------|-----|
| SQL操作 | `MyDB().Exec/Query/QueryRow/Migrate` |
| KV操作 | `MyDB().Put/Get/Delete/List` |
| 同期スコープ制御 | `MyDB().SetSyncScope(table, ScopeDevice/ScopeNetwork)` |
| スキーママイグレーション | `MyDB().Migrate([]Migration)` |
| デバイスペアリング | `CreatePairingToken/CompletePairing` |
| ネットワーク管理 | `Network().CreateGroup/AddMember/Leave/ListGroups` |
| データルート自動配置 | `Config.SuiteID` → `<dataroot>/<DID>/suites/<suiteID>/data.db` |

**重要な設計ポイント**: アプリはMyDBのSQLインターフェースを使うだけ。同期はLinkSelfが透過的に処理する。

## アーキテクチャ

```
┌──────────────────────────────────────────────┐
│  Wails Frontend (TypeScript/React)           │
│  ← Wails bindings経由でGoを呼び出す →        │
├──────────────────────────────────────────────┤
│  Binding層 (desktop/internal/binding/)       │
│  RegionBinding, UserBinding, MapBinding, ... │
├──────────────────────────────────────────────┤
│  Repository Interface (shared/domain/)       │
│  RegionRepository, UserRepository, ...       │
├──────────────────────────────────────────────┤
│  ★ 新規: LinkSelfRepository実装              │
│  shared/domain/repository/linkself.go        │
│  ← MyDB SQLを使って全リポジトリを実装 →      │
├──────────────────────────────────────────────┤
│  LinkSelf Client (pkg/linkself)              │
│  MyDB (SQL+KV) / Network / Pairing          │
│  SyncScope: Device ↔ Network 自動同期       │
└──────────────────────────────────────────────┘
```

## Phase 1: 基盤セットアップ

### 1.1 LinkSelf依存の追加

```bash
cd shared && go get github.com/SeijiShii/link-self/core@latest
cd desktop && go get github.com/SeijiShii/link-self/core@latest
```

### 1.2 shared/linkself/client.go の刷新

現在の旧インターフェース（Connect/Disconnect/SyncData）を破棄し、LinkSelf Clientをラップ:

```go
package linkself

import (
    "context"
    ls "github.com/SeijiShii/link-self/core/pkg/linkself"
)

const SuiteID = "jp.home-visit-suite"

// Service はLinkSelfクライアントのライフサイクルを管理する。
type Service struct {
    client ls.Client
    db     ls.MyDB
}

func NewService() *Service {
    return &Service{client: ls.NewClient()}
}

func (s *Service) Start(ctx context.Context) (*ls.NodeInfo, error) {
    config := ls.Config{
        SuiteID: SuiteID,
        Roles: role.RoleDefs{
            "member": {},
            "editor": {Includes: []string{"member"}},
            "admin":  {Includes: []string{"editor"}},
        },
        ChangeLogRetention: &ls.ChangeLogRetention{
            Mode:     ls.TimeBasedRetention,
            Duration: 30 * 24 * time.Hour,
        },
    }
    info, err := s.client.Start(ctx, config)
    if err != nil {
        return nil, err
    }
    s.db = s.client.MyDB()

    // スキーママイグレーション実行
    if err := s.db.Migrate(ctx, allMigrations); err != nil {
        return nil, err
    }

    // SyncScope設定
    if err := s.setupSyncScopes(ctx); err != nil {
        return nil, err
    }

    return info, nil
}

func (s *Service) Stop(ctx context.Context) error {
    return s.client.Stop(ctx)
}

func (s *Service) DB() ls.MyDB { return s.db }
func (s *Service) Client() ls.Client { return s.client }
```

### 1.3 shared/linkself/channels.go の更新

GroupShareチャンネル定義はMyDB + SyncScopeに統合されたため、**channels.goはテーブル名定義ファイルに変換**する:

```go
package linkself

// テーブル名定数（チャンネル定義を置き換え）
const (
    // マスターデータ（ScopeNetwork）
    TableRegions      = "regions"
    TableParentAreas  = "parent_areas"
    TableAreas        = "areas"
    TablePlaces       = "places"

    // 地図（ScopeNetwork）
    TableMapNetwork   = "map_network"  // map-polygon-editorのJSON

    // メンバー（ScopeNetwork）
    TableUsers        = "users"
    TableOrgGroups    = "org_groups"
    TableMemberTags   = "member_tags"

    // 訪問活動（ScopeNetwork）
    TableTeams               = "teams"
    TableActivities          = "activities"
    TableActivityAssignments = "activity_assignments"
    TableVisitRecords        = "visit_records"
    TableVisitRecordEdits    = "visit_record_edits"

    // 網羅管理（ScopeNetwork）
    TableCoverages         = "coverages"
    TableSchedulePeriods   = "schedule_periods"
    TableScopes            = "scopes"
    TableAreaAvailability  = "area_availability"

    // 申請・通知（ScopeNetwork）
    TableRequests      = "requests"
    TableInvitations   = "invitations"
    TableNotifications = "notifications"

    // 監査（ScopeNetwork）
    TableAuditLog = "audit_log"

    // 個人データ（ScopeDevice — 自分のデバイス間のみ同期）
    TablePersonalNotes          = "personal_notes"
    TablePersonalTags           = "personal_tags"
    TablePersonalTagAssignments = "personal_tag_assignments"
)
```

## Phase 2: SQLスキーマ定義

### 2.1 マイグレーション定義

`shared/linkself/migrations.go` に定義:

```go
package linkself

import ls "github.com/SeijiShii/link-self/core/pkg/linkself"

var allMigrations = []ls.Migration{
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
    field_name TEXT NOT NULL,
    old_value TEXT NOT NULL DEFAULT '',
    new_value TEXT NOT NULL DEFAULT '',
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
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member',
    token TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT
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
```

### 2.2 SyncScope設定

```go
func (s *Service) setupSyncScopes(ctx context.Context) error {
    // Network共有テーブル（全メンバーに同期）
    networkTables := []string{
        TableRegions, TableParentAreas, TableAreas, TablePlaces,
        TableMapNetwork,
        TableUsers, TableOrgGroups, TableMemberTags,
        TableTeams, TableActivities, TableActivityAssignments,
        TableVisitRecords, TableVisitRecordEdits,
        TableCoverages, TableSchedulePeriods, TableScopes, TableAreaAvailability,
        TableRequests, TableInvitations, TableNotifications,
        TableAuditLog,
    }
    for _, t := range networkTables {
        if err := s.db.SetSyncScope(ctx, t, ls.ScopeNetwork); err != nil {
            return err
        }
    }

    // Device限定テーブル（自デバイス間のみ同期）
    deviceTables := []string{
        TablePersonalNotes, TablePersonalTags, TablePersonalTagAssignments,
    }
    for _, t := range deviceTables {
        if err := s.db.SetSyncScope(ctx, t, ls.ScopeDevice); err != nil {
            return err
        }
    }
    return nil
}
```

## Phase 3: LinkSelfリポジトリ実装

### 3.1 実装方針

- **1ファイル1リポジトリ**: `shared/domain/repository/linkself_region.go` 等
- **共通ヘルパー**: `shared/domain/repository/linkself.go` にDB参照、JSON変換ユーティリティ
- **Goのstruct ↔ SQLカラム**: JSON配列フィールド（TagIDs, Members, ParentAreaIDs等）はTEXTにJSON文字列として格納
- **time.Time ↔ TEXT**: RFC3339形式で格納
- **geometry ↔ TEXT**: GeoJSON文字列として格納
- **論理削除**: `deleted_at` カラム（NULLで有効、非NULLで削除済み）

### 3.2 ファイル構成

```
shared/domain/repository/
├── linkself.go              # LinkSelfRepository（共通基盤 + DB参照保持）
├── linkself_region.go       # RegionRepository実装
├── linkself_user.go         # UserRepository実装
├── linkself_activity.go     # ActivityRepository実装
├── linkself_coverage.go     # CoverageRepository実装
├── linkself_notification.go # NotificationRepository実装
├── linkself_place.go        # PlaceRepository実装
├── linkself_personal.go     # PersonalRepository実装
├── linkself_map.go          # MapBinding用（map_networkテーブル）
```

### 3.3 共通基盤

```go
// shared/domain/repository/linkself.go
package repository

import (
    "context"
    ls "github.com/SeijiShii/link-self/core/pkg/linkself"
)

// LinkSelfRepository はLinkSelf MyDBを使ったリポジトリ共通基盤。
// 各リポジトリインターフェースを embed で実装する。
type LinkSelfRepository struct {
    db  ls.MyDB
    ctx context.Context  // アプリケーションライフサイクルのコンテキスト
}

func NewLinkSelfRepository(db ls.MyDB) *LinkSelfRepository {
    return &LinkSelfRepository{db: db, ctx: context.Background()}
}

// 各リポジトリインターフェースを実装する型
type LinkSelfRegionRepo struct{ *LinkSelfRepository }
type LinkSelfUserRepo struct{ *LinkSelfRepository }
type LinkSelfActivityRepo struct{ *LinkSelfRepository }
type LinkSelfCoverageRepo struct{ *LinkSelfRepository }
type LinkSelfNotificationRepo struct{ *LinkSelfRepository }
type LinkSelfPlaceRepo struct{ *LinkSelfRepository }
type LinkSelfPersonalRepo struct{ *LinkSelfRepository }

func (r *LinkSelfRepository) Region() *LinkSelfRegionRepo { ... }
func (r *LinkSelfRepository) User() *LinkSelfUserRepo { ... }
// ... 省略
```

### 3.4 実装例: RegionRepository

```go
// shared/domain/repository/linkself_region.go
func (r *LinkSelfRegionRepo) ListRegions() ([]models.Region, error) {
    rows, err := r.db.Query(r.ctx,
        `SELECT id, name, symbol, approved, geometry, sort_order, deleted_at
         FROM regions WHERE deleted_at IS NULL ORDER BY sort_order`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var result []models.Region
    for rows.Next() {
        var reg models.Region
        var geomJSON sql.NullString
        var approved int
        err := rows.Scan(&reg.ID, &reg.Name, &reg.Symbol, &approved,
            &geomJSON, &reg.Order, &sql.NullString{})
        if err != nil {
            return nil, err
        }
        reg.Approved = approved != 0
        if geomJSON.Valid {
            json.Unmarshal([]byte(geomJSON.String), &reg.Geometry)
        }
        result = append(result, reg)
    }
    return result, nil
}

func (r *LinkSelfRegionRepo) SaveRegion(region *models.Region) error {
    geomJSON, _ := json.Marshal(region.Geometry)
    _, err := r.db.Exec(r.ctx,
        `INSERT OR REPLACE INTO regions (id, name, symbol, approved, geometry, sort_order, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        region.ID, region.Name, region.Symbol, boolToInt(region.Approved),
        nullableJSON(region.Geometry), region.Order, nullableTime(region.DeletedAt))
    return err
}
```

## Phase 4: desktop/main.go の統合

### 4.1 起動フロー変更

```go
func main() {
    ctx := context.Background()

    // LinkSelf起動
    lsService := linkself.NewService()
    info, err := lsService.Start(ctx)
    if err != nil {
        log.Fatalf("failed to start LinkSelf: %v", err)
    }
    log.Printf("LinkSelf started: DID=%s", info.DID)

    // リポジトリ生成（全てLinkSelf MyDB経由）
    repo := repository.NewLinkSelfRepository(lsService.DB())

    app := NewApp(lsService)  // App にlsServiceを持たせる
    regionBinding := binding.NewRegionBinding(repo.Region())
    mapBinding := binding.NewMapBinding(repo.Map())  // 新: LinkSelf経由
    userBinding := binding.NewUserBinding(repo.User())

    err = wails.Run(&options.App{
        // ...
        OnShutdown: func(ctx context.Context) {
            lsService.Stop(ctx)
        },
        Bind: []interface{}{app, regionBinding, mapBinding, userBinding},
    })
}
```

### 4.2 MapBindingのLinkSelf対応

現在のファイルI/Oベース（network.json読み書き）を、MyDBの `map_network` テーブルに移行:

```go
// GetNetworkJSON / SaveNetworkJSON が MyDB経由になる
func (b *MapBinding) GetNetworkJSON() (string, error) {
    row := b.db.QueryRow(b.ctx, `SELECT data FROM map_network WHERE id = 'default'`)
    var data string
    if err := row.Scan(&data); err != nil {
        return "{}", nil  // 初期状態
    }
    return data, nil
}

func (b *MapBinding) SaveNetworkJSON(json string) error {
    _, err := b.db.Exec(b.ctx,
        `INSERT OR REPLACE INTO map_network (id, data) VALUES ('default', ?)`, json)
    return err
}
```

## Phase 5: データ移行

### 5.1 既存JSONファイルからの移行

初回起動時に `~/.home-visit-suite/data/*.json` が存在すれば読み込み、LinkSelf DBに投入:

```go
func migrateFromJSON(dataDir string, repo *LinkSelfRepository) error {
    jsonRepo, err := repository.NewJSONFileRepository(dataDir)
    if err != nil {
        return nil // JSONファイルなし = 移行不要
    }

    regions, _ := jsonRepo.ListRegions()
    for _, r := range regions {
        repo.Region().SaveRegion(&r)
    }
    // 他のエンティティも同様...

    // 移行完了マーカー作成
    os.WriteFile(filepath.Join(dataDir, ".migrated"), []byte("done"), 0644)
    return nil
}
```

## Phase 6: ネットワーク参加・デバイスペアリング

### 6.1 新規Binding: NetworkBinding

```go
type NetworkBinding struct {
    lsService *linkself.Service
}

// CreateNetwork は新しいネットワークを作成
func (b *NetworkBinding) CreateNetwork() (string, error)

// InviteMember はDIDでメンバーを招待
func (b *NetworkBinding) InviteMember(networkID, memberDID string) error

// CreatePairingQR はペアリング用のトークンを生成
func (b *NetworkBinding) CreatePairingQR() (string, error)

// CompletePairing はペアリングを完了
func (b *NetworkBinding) CompletePairing(secret string) error

// GetMyDID は自分のDIDを取得
func (b *NetworkBinding) GetMyDID() string
```

## 実装順序

| Step | 内容 | 依存 |
|------|------|------|
| **1** | `go get` でLinkSelf依存追加 | — |
| **2** | `shared/linkself/` 刷新: Service, migrations, テーブル定数 | Step 1 |
| **3** | `shared/domain/repository/linkself.go` 共通基盤 | Step 2 |
| **4** | `linkself_region.go` — RegionRepository実装 + テスト | Step 3 |
| **5** | `linkself_user.go` — UserRepository実装 + テスト | Step 3 |
| **6** | `linkself_map.go` — MapBinding対応 | Step 3 |
| **7** | `desktop/main.go` 統合 — Step 4〜6 を接続、起動確認 | Step 4-6 |
| **8** | 既存JSONデータ移行 | Step 7 |
| **9** | 残りリポジトリ実装（Activity, Coverage, Notification, Place, Personal） | Step 7 |
| **10** | NetworkBinding — ネットワーク参加・ペアリングUI | Step 7 |

## 設計判断

### なぜSQLベース（KVではなく）か

- 既存リポジトリインターフェースがリスト・フィルタ・ソートを多用 → SQLのWHERE/ORDER BYが自然
- LinkSelf MyDBのSQL書き込みは自動的にDeviceSync/GroupShareにイベント発火（Phase C）
- map-polygon-editorのネットワークJSONだけはKV的にBLOB格納

### SyncScopeの使い分け

| スコープ | 対象テーブル | 理由 |
|----------|-------------|------|
| **ScopeNetwork** | regions, users, activities等（大半） | グループ全員で共有するデータ |
| **ScopeDevice** | personal_notes, personal_tags等 | 個人メモは本人のデバイス間のみ |

### channels.go の扱い

旧GroupShareチャンネル定義は、MyDB + SetSyncScopeに置き換わる。
channels.goはテーブル名定数ファイルとして再利用し、チャンネル構造体は廃止。

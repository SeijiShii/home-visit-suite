# Implementation Plan: LinkSelf SQLite3 統合

## Task Type
- [x] Backend (Go)
- [x] Fullstack (→ main.go wiring + frontend影響確認)

## 現状分析

### home-visit-suite 側
- **7つのリポジトリインターフェース**: RegionRepository, UserRepository, PlaceRepository, ActivityRepository, CoverageRepository, NotificationRepository, PersonalRepository
- **現在の実装**:
  - `JSONFileRepository` — RegionRepository のみ実装（`~/.home-visit-suite/data/` にJSON保存）
  - `InMemoryXxxRepository` — 残り6リポジトリは全てインメモリ（開発用、testdataのシードで初期化）
- **LinkSelf統合層**（`shared/linkself/`）: Client interface（空実装）、Channel定義（26チャネル）、AccessPolicy（ロールベース）は設計済みだが未接続
- **main.go**: JSONFileRepository + InMemoryRepos を直接生成、LinkSelf未使用

### LinkSelf 側
- **公開API**: `linkself.Client` — `NewClient()` → `Start(ctx, Config)` → `DeviceDB()` / `GroupShare()` / `Groups()`
- **DeviceDB**: テーブル+レコードID指定のKV型操作（Put/Get/Delete/List）— 同一DID全デバイス自動同期
- **GroupShareAPI**: Channel+Topic+RecordID指定の共有操作 — グループメンバー間で同期
- **SQLite3ストレージ**: `core/internal/storage/sqlite.Open(path)` で5つのストレージIF全対応（WALモード、Pure Go）
- **現在の wiring**: `client.go` は `NewMemStorage()` / `NewMemSharedStorage()` を使用 — **SQLite未接続**

### ギャップ
1. LinkSelfの `client.go` がSQLite storageを使うオプションがない（MemStorageハードコード）
2. home-visit-suiteのリポジトリインターフェースとLinkSelfのDeviceDB/GroupShare APIの間のアダプタがない
3. `go.mod` に LinkSelf 依存が未追加

## Technical Solution

### アーキテクチャ方針

```
┌──────────────────────────────────────────────────────┐
│  Wails Binding Layer  (desktop/internal/binding/)    │
│   RegionBinding, UserBinding, MapBinding ...         │
├──────────────────────────────────────────────────────┤
│  Domain Interfaces  (shared/domain/)                 │
│   RegionRepository, UserRepository, ... (既存)       │
├──────────────────────────────────────────────────────┤
│  LinkSelf Adapter  (shared/linkself/repository/)     │  ← NEW
│   GroupShareRegionRepo, GroupShareUserRepo, ...      │
│   DeviceDBPersonalRepo                               │
├──────────────────────────────────────────────────────┤
│  shared/linkself/client.go  (ラッパー拡張)            │  ← MODIFY
│   StartWithSQLite(config) — SQLiteストレージ指定      │
├──────────────────────────────────────────────────────┤
│  LinkSelf Core  (link-self/core/pkg/linkself)        │
│   Client.DeviceDB() / Client.GroupShare()            │
│   SQLite storage (core/internal/storage/sqlite/)     │
└──────────────────────────────────────────────────────┘
```

### データ同期戦略

| データ種類 | LinkSelf API | チャネル/テーブル | 理由 |
|-----------|-------------|-----------------|------|
| 領域・区域・場所 | GroupShare | regions, parent_areas, areas, places | グループ全員で共有するマスターデータ |
| メンバー・グループ・タグ | GroupShare | users, org_groups, member_tags | 同上 |
| 訪問活動関連 | GroupShare | activities, teams, visit_records, ... | メンバー間で共有 |
| 網羅管理 | GroupShare | coverages, schedule_periods, scopes, ... | 編集メンバーが管理、全員参照 |
| 通知・申請・監査 | GroupShare | notifications, requests, audit_log | 対象者別topic付き |
| 個人メモ・タグ | DeviceDB | personal_notes, personal_tags, ... | 個人データ、同一DIDデバイス間同期 |

### JSON Body エンコーディング

リポジトリの各メソッドは `models.Xxx` を受け取り、`json.Marshal` して LinkSelf の `body []byte` に格納する。
取得時は `json.Unmarshal` で復元する。既存モデルにJSON tagが付いているのでそのまま利用可能。

## Implementation Steps

### Step 1: LinkSelf側 — Config経由でSQLiteストレージを注入可能にする

**目的**: `linkself.Config` にストレージパスオプションを追加し、SQLite使用を可能にする

**対象リポジトリ**: link-self

1. `core/pkg/linkself/types.go` の `Config` に `DBPath string` フィールドを追加
2. `core/pkg/linkself/client.go` の `Start()` メソッドを修正:
   - `DBPath` が非空なら `sqlite.Open(dbPath)` を使い、各ストレージを取得
   - `DBPath` が空なら従来の MemStorage（後方互換）
3. テスト: DBPathありの起動テストを追加

**期待成果物**: LinkSelf Client がSQLiteバックエンドで起動可能になる

### Step 2: shared/go.mod に LinkSelf 依存を追加

**目的**: home-visit-suite/shared から LinkSelf を参照可能にする

1. `shared/go.mod` に `require github.com/SeijiShii/link-self/core v0.0.0` を追加
2. `replace github.com/SeijiShii/link-self/core => ../../link-self/core` でローカル参照
3. `desktop/go.mod` も同様（間接依存の解決）
4. `go mod tidy` で依存解決を確認

**期待成果物**: コンパイル通過

### Step 3: shared/linkself/client.go — 実装を接続

**目的**: 既存のClient interfaceをLinkSelf公開APIに接続する

1. `shared/linkself/client.go` のClient interfaceを拡張:
   ```go
   type Client interface {
       Start(ctx context.Context, config ClientConfig) error
       Stop(ctx context.Context) error
       DeviceDB() linkself.DeviceDB
       GroupShare() linkself.GroupShareAPI
       Groups() linkself.GroupAPI
       GetMyDID() string
   }

   type ClientConfig struct {
       DBPath         string   // SQLite3 DB path
       IdentityPath   string
       ListenAddrs    []string
       BootstrapPeers []string
   }
   ```
2. `shared/linkself/real_client.go` に実体実装:
   - 内部で `linkself.NewClient()` + `Start()` を呼ぶ
   - チャネル登録（`AllChannels()` を使って全チャネル RegisterChannel）
   - AccessPolicy設定
3. `shared/linkself/mock_client.go` にテスト用モック（InMemory版）

**期待成果物**: アプリからLinkSelfを起動・チャネル登録できるClient

### Step 4: GroupShareアダプタ — RegionRepository 実装

**目的**: 最初のリポジトリをGroupShare経由で実装し、パターンを確立する

1. `shared/linkself/repository/groupshare_region.go` を作成:
   ```go
   type GroupShareRegionRepository struct {
       gs     linkself.GroupShareAPI
       myDID  string
   }

   func (r *GroupShareRegionRepository) SaveRegion(region *models.Region) error {
       body, _ := json.Marshal(region)
       return r.gs.Put(ctx, "regions", region.ID, region.ID, body)
       // channel="regions", topic=region.ID, recordID=region.ID
   }

   func (r *GroupShareRegionRepository) ListRegions() ([]models.Region, error) {
       records, _ := r.gs.List(ctx, "regions")
       // json.Unmarshal each record.Body → models.Region
       // filter DeletedAt == nil, sort by Order
   }
   ```
2. topic戦略: マスターデータはrecordID=topicで1:1マッピング
3. 論理削除: models.Region.DeletedAtをBody内に保持（GroupShare自体のDeleteは物理削除なので使わない）
4. テスト: InMemory GroupShareモックを使ったユニットテスト

**期待成果物**: GroupShare経由のRegionRepository + テスト + 共通パターン確立

### Step 5: GroupShareアダプタ — 残り5リポジトリ実装

**目的**: Step 4のパターンで残りのGroupShareリポジトリを実装

1. `groupshare_user.go` — UserRepository (users, org_groups, member_tags チャネル)
2. `groupshare_place.go` — PlaceRepository (places チャネル)
3. `groupshare_activity.go` — ActivityRepository (activities, teams, activity_assignments, visit_records, visit_record_edits チャネル)
4. `groupshare_coverage.go` — CoverageRepository (coverages, schedule_periods, scopes, area_availability チャネル)
5. `groupshare_notification.go` — NotificationRepository (notifications, requests, audit_log チャネル)
6. 各リポジトリのテスト

**共通設計**:
- 複数チャネルをまたぐリポジトリ（例: ActivityRepository は5チャネル使用）は、構造体に複数チャネル名を保持
- List系メソッドのフィルタ条件（areaID等）はtopicマッピングで効率化
- context.Context は構造体にデフォルトを持たせる or メソッド毎にcontext.Background()

**期待成果物**: 6つのGroupShareリポジトリ実装 + テスト

### Step 6: DeviceDBアダプタ — PersonalRepository 実装

**目的**: 個人データをDeviceDB経由で実装

1. `shared/linkself/repository/devicedb_personal.go` を作成:
   ```go
   type DeviceDBPersonalRepository struct {
       db linkself.DeviceDB
   }

   func (r *DeviceDBPersonalRepository) SavePersonalNote(note *models.PersonalNote) error {
       body, _ := json.Marshal(note)
       return r.db.Put(ctx, "personal_notes", note.ID, body)
   }
   ```
2. テーブル名: `personal_notes`, `personal_tags`, `personal_tag_assignments`
3. テスト

**期待成果物**: DeviceDB経由のPersonalRepository + テスト

### Step 7: main.go 統合 — LinkSelfクライアント起動とリポジトリ切り替え

**目的**: main.goでLinkSelfを起動し、全リポジトリをLinkSelf実装に切り替える

1. `desktop/main.go` を修正:
   ```go
   // LinkSelf起動
   dataDir := filepath.Join(homeDir, ".home-visit-suite")
   dbPath := filepath.Join(dataDir, "linkself.db")
   identityPath := filepath.Join(dataDir, "identity.json")

   lsClient := linkself.NewRealClient()
   err := lsClient.Start(ctx, linkself.ClientConfig{
       DBPath:       dbPath,
       IdentityPath: identityPath,
   })

   // リポジトリ生成（全てLinkSelf経由）
   regionRepo := lsrepo.NewGroupShareRegionRepository(lsClient.GroupShare(), lsClient.GetMyDID())
   userRepo := lsrepo.NewGroupShareUserRepository(lsClient.GroupShare(), lsClient.GetMyDID())
   // ... 他のリポジトリも同様
   personalRepo := lsrepo.NewDeviceDBPersonalRepository(lsClient.DeviceDB())
   ```
2. `testdata.SeedAll` をLinkSelfリポジトリに対しても使えるよう、Repos構造体にセット
3. OnShutdown で `lsClient.Stop()` を呼ぶ
4. JSONFileRepository / InMemoryRepos のコードは残す（フォールバック・テスト用）

**期待成果物**: LinkSelf + SQLite3 でアプリ起動可能

### Step 8: チャネル登録とSubscription設定

**目的**: アプリ起動時にGroupShareチャネルを正しく登録する

1. `shared/linkself/bootstrap.go` を作成:
   ```go
   func RegisterAllChannels(gs linkself.GroupShareAPI, groupID string) error {
       for _, ch := range AllChannels() {
           opts := []linkself.ChannelOption{}
           if ch.Retention > 0 {
               opts = append(opts, linkself.WithRetention(ch.Retention))
           }
           if err := gs.RegisterChannel(ch.Name, groupID, opts...); err != nil {
               return err
           }
       }
       return nil
   }
   ```
2. Subscribe: 全チャネル `["*"]` で購読（管理アプリは全データ必要）
3. main.go の起動フローに組み込み

**期待成果物**: チャネル登録・購読の自動化

### Step 9: 統合テストとデータマイグレーション

**目的**: 全体結合の検証とJSONファイルからの移行パス

1. `shared/linkself/repository/integration_test.go`:
   - SQLite3 `:memory:` でLinkSelfクライアントを起動
   - 全リポジトリの CRUD操作テスト
   - SeedAll がLinkSelfリポジトリで動作することを確認
2. マイグレーションツール（任意）:
   - 既存 `~/.home-visit-suite/data/*.json` → LinkSelf GroupShare への移行
   - 初回起動時にJSONファイルが存在すればインポート → 成功後にリネーム
3. Wails `wails dev` での動作確認

**期待成果物**: 統合テスト + マイグレーションパス

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `link-self/core/pkg/linkself/types.go` | Modify | Config.DBPath追加 |
| `link-self/core/pkg/linkself/client.go` | Modify | SQLiteストレージ選択ロジック |
| `shared/go.mod` | Modify | LinkSelf依存追加 |
| `desktop/go.mod` | Modify | 間接依存解決 |
| `shared/linkself/client.go` | Modify | Client interface拡張・実装接続 |
| `shared/linkself/real_client.go` | Create | LinkSelf公開APIラッパー |
| `shared/linkself/mock_client.go` | Create | テスト用モック |
| `shared/linkself/bootstrap.go` | Create | チャネル登録・購読ヘルパー |
| `shared/linkself/repository/groupshare_region.go` | Create | RegionRepository実装 |
| `shared/linkself/repository/groupshare_user.go` | Create | UserRepository実装 |
| `shared/linkself/repository/groupshare_place.go` | Create | PlaceRepository実装 |
| `shared/linkself/repository/groupshare_activity.go` | Create | ActivityRepository実装 |
| `shared/linkself/repository/groupshare_coverage.go` | Create | CoverageRepository実装 |
| `shared/linkself/repository/groupshare_notification.go` | Create | NotificationRepository実装 |
| `shared/linkself/repository/devicedb_personal.go` | Create | PersonalRepository実装 |
| `shared/linkself/repository/*_test.go` | Create | 各リポジトリのテスト |
| `desktop/main.go` | Modify | LinkSelf起動・リポジトリ切り替え |

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| LinkSelf `client.go` がinternal packageをハードコードしている | Step 1でConfig経由の注入に変更。internal/storage/sqliteはLinkSelf内で閉じる |
| go.mod のreplace指令が複雑化 | ローカル開発ではreplace、CI/リリースではGitHub tagを参照 |
| GroupShare List がフルスキャンになる | topicベースのフィルタリング + ListByChannelAndTopic で最適化。データ量が少ない（数千件規模）ので許容範囲 |
| context.Context の伝播 | リポジトリメソッドがcontextを取らない既存設計 → アダプタ内でcontext.Background()を使用。将来的にinterfaceにctx追加を検討 |
| SQLite WAL + Wailsの同時アクセス | 単一プロセスなので問題なし。SetMaxOpenConns(1) で排他制御済み |
| 既存JSONデータのマイグレーション | Step 9で初回起動時の自動インポートを実装。失敗してもJSONファイルは保持 |
| ncruces/go-sqlite3 (WASM) のビルドサイズ | ~8MB増。Wailsアプリとしては許容範囲。問題ならmattn/go-sqlite3に切替 |

## 実装順序の依存関係

```
Step 1 (LinkSelf側修正)
  ↓
Step 2 (go.mod依存追加)
  ↓
Step 3 (Client wrapper)
  ↓
Step 4 (RegionRepo — パターン確立)
  ↓
Step 5 (残りGroupShareリポジトリ) ─── Step 6 (DeviceDB PersonalRepo)  ← 並列可
  ↓                                        ↓
Step 7 (main.go統合)
  ↓
Step 8 (チャネル登録)
  ↓
Step 9 (統合テスト・マイグレーション)
```

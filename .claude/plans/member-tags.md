# Implementation Plan: メンバータグ機能

## Task Type
- [x] Frontend (React + CSS)
- [x] Backend (Go models + repository)
- [x] Fullstack

## Current State

**Already implemented:**
- `models.Tag` struct (Go): `ID`, `Name`
- `models.Tag` class (TS): `id`, `name`
- `User.TagIDs []string` (Go/TS both)
- Backend bindings: `ListTags()`, `SaveTag()`, `DeleteTag()`
- Repository interface + in-memory implementation
- Wails binding auto-generation

**Missing (per spec):**
- Tag model に `Color` フィールドがない
- UI 全般（タグ表示・CRUD・付与・フィルタリング）
- i18n キー
- バリデーション（16文字制限、同名禁止、上限10個）

---

## Technical Solution

Tag モデルに `color` フィールドを追加し、UsersPage にタグ管理セクション・タグ付与UI・フィルタリングを実装する。既存の member-chip / modal パターンを踏襲する。

---

## Implementation Steps

### Step 1: Tag モデルに Color 追加
- **Go**: `shared/domain/models/user.go` の `Tag` struct に `Color string` フィールド追加
- **TS**: `wailsjs/go/models.ts` の `Tag` class に `color: string` 追加（Wails再生成で自動反映される可能性あり）
- Expected deliverable: Tag に色情報を持てるようになる

### Step 2: バリデーションロジック（Backend）
- `shared/domain/models/user.go` に `Tag.Validate()` メソッド追加
  - 名前が空でないこと
  - 名前が16文字以内であること
- Repository 層（`memory_user.go`）の `SaveTag` に同名チェック追加
- `SaveUser` にタグ上限10個チェック追加
- Expected deliverable: 不正データの拒否

### Step 3: タグ色の自動割り当て
- `shared/domain/models/user.go` にデフォルトカラーパレット定数を定義（8色程度）
- `SaveTag` 時に `Color` が空なら自動割り当て（既存タグ色を避けて循環）
- Expected deliverable: 新規タグ作成時に自動で色が付く

### Step 4: i18n キー追加
- `i18n-types.ts` の `users` セクションにタグ関連キー追加
- `ja/index.ts` に日本語訳追加
- `en/index.ts` に英語訳追加
- Keys: tags, noTags, addTag, editTag, deleteTag, tagName, tagColor, confirmDeleteTag, tagLimit, duplicateTagName, filterByTag, allTags
- Expected deliverable: 多言語対応のタグUI文言

### Step 5: UsersPage — タグ管理セクション（CRUD）
- 新しい ModalState type: `addTag`, `editTag`, `deleteTag`
- `reload()` に `UserBinding.ListTags()` 追加、`tags` state 管理
- グループセクションとメンバーテーブルの間にタグ管理セクション追加
- タグ一覧（色付きチップ表示）＋追加ボタン
- 各タグに edit/delete ボタン
- 削除時：付与済みメンバー数表示の確認ダイアログ
- Expected deliverable: タグのCRUD操作が可能

### Step 6: UsersPage — メンバーテーブルにタグ列追加
- メンバーテーブルに「タグ」列追加
- 各メンバーの `tagIds` を解決してタグチップ表示（色付き）
- タグチップクリックでタグ付与モーダルを開く
- Expected deliverable: メンバー一覧でタグが見える

### Step 7: UsersPage — タグ付与モーダル
- 新 ModalState: `assignTags` (対象メンバーを保持)
- モーダル内容：全タグ一覧（トグル選択）＋新規タグ入力欄
- 上限10個に達したら追加不可表示
- `SaveUser` で `tagIds` 更新
- Expected deliverable: メンバーへのタグ付与・解除

### Step 8: UsersPage — タグフィルタリング
- 検索バー横にタグフィルタドロップダウン追加
- 選択タグで `filteredUsers` を絞り込み（OR条件）
- テキスト検索との併用可
- Expected deliverable: タグによるメンバー絞り込み

### Step 9: CSS スタイリング
- `.tag-chip` — 色はインラインスタイルで動的適用（Tag.color ベース）
- `.tag-manage-section` — タグ管理セクションレイアウト
- `.tag-color-picker` — プリセット色選択UI
- `.tag-filter` — フィルタUIスタイル
- 既存の `.member-chip`, `.role-badge` パターンと統一
- Expected deliverable: 統一感のあるタグUI

### Step 10: テスト
- Tag バリデーションのユニットテスト
- タグ付与上限のテスト
- 同名禁止のテスト
- Expected deliverable: 品質担保

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `shared/domain/models/user.go:44-48` | Modify | Tag struct に Color 追加 + Validate() |
| `shared/domain/repository/memory_user.go:121-152` | Modify | 同名チェック・色自動割り当て・タグ上限チェック |
| `shared/domain/user_repository.go` | No change | Interface 変更不要 |
| `desktop/frontend/src/pages/UsersPage.tsx` | Modify | タグ管理UI・タグ列・付与モーダル・フィルタリング |
| `desktop/frontend/src/i18n/i18n-types.ts:71-93` | Modify | tags 関連 i18n キー追加 |
| `desktop/frontend/src/i18n/ja/index.ts` | Modify | 日本語訳追加 |
| `desktop/frontend/src/i18n/en/index.ts` | Modify | 英語訳追加 |
| `desktop/frontend/src/style.css` | Modify | タグ関連 CSS 追加 |
| `desktop/frontend/wailsjs/go/models.ts:207-220` | Auto-gen | Wails 再生成で Color 反映 |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Wails models.ts 自動生成が Color を反映しない | `wails generate module` 実行確認。手動修正がフォールバック |
| UsersPage 肥大化（既に512行） | 必要に応じてタグ関連コンポーネント分離検討 |
| 色選択UIの複雑化 | プリセット8色のクリック選択で簡素実装 |
| メンバーテーブル列幅バランス | タグ列は flex-wrap で複数行対応 |

---

## Design Notes: カラーパレット（タグ用プリセット8色）

| Color | Text/Border | Background |
|-------|------------|------------|
| Blue | #3b82f6 | #eff6ff |
| Purple | #8b5cf6 | #f5f3ff |
| Pink | #ec4899 | #fdf2f8 |
| Orange | #f97316 | #fff7ed |
| Teal | #14b8a6 | #f0fdfa |
| Yellow | #eab308 | #fefce8 |
| Indigo | #6366f1 | #eef2ff |
| Rose | #f43f5e | #fff1f2 |
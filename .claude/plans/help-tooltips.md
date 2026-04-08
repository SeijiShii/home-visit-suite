# 実装計画: ヘルプツールチップ + アプリ設定画面

## 概要
地図編集画面に、右上から降りてくるフェード式のヘルプツールチップを追加する。メッセージは i18n キーで指定し、個別に「表示しない」設定が可能。アプリ設定画面を新設し、ヘルプ表示のリセットや将来の各種設定を集約する。永続化は既存の LinkSelf MyDB 上の個人設定リポジトリ（`linkself_personal.go`）を活用する。

## 要件（原文整理）
1. アプリ設定画面を新設し、ヘルプ表示関連の設定を管理する。
2. 地図編集画面で、画面右上から降りてくるツールチップ型ヘルプを表示する。
3. 表示後約5秒でフェードアウト、各ツールチップに「このメッセージを表示しない」リンク。
4. 非表示化したキーは永続化（端末をまたぐ可能性も考慮し、個人設定 = LinkSelf MyDB）。
5. 設定画面に「ヘルプ表示をリセット」ボタン。
6. API: `showTips(keys: string[])` — 複数キーを 1.5 秒間隔でキュー投入、先頭に unshift（既存は下へ押下）。
7. **同一キーが既に表示中の場合は重複投入しない**（ちらつき防止、明文化）。
8. **地図画面表示時に、ポリゴン描画関連でできることを自動で全件ツールチップ表示する**（ホバー不要）。
   - 対象: ポリゴン描画関連の操作のみ（一般的な地図操作 — ズーム/パン/レイヤ切替/区域追加削除 — は直感的なので対象外）
   - 発火タイミング: 地図データロード完了後
   - 頻度: セッション中 1 回のみ
   - 非表示化されたキーはスキップ
9. 辺／頂点ホバー時の showTips も残す（初期表示で見逃したユーザー向け、表示中は重複抑制）。
10. 同時表示の上限は 5 件（超過時は最古から即時フェードアウト）。
11. 対象キーは **実装済みの操作のみ**。未実装機能はヘルプに含めない。
12. **仕様・実装変更時はヘルプ文言との齟齬確認を必須とする**（MEMORY.json feedback に保存済み）。

## 既存コードベースの調査結果
- Wails v2 + React + HashRouter (`desktop/frontend/src/App.tsx`)。
- i18n は独自実装。型 `Translations` を `src/i18n/i18n-types.ts` に定義し、`ja/index.ts`, `en/index.ts` で実装。Context は `src/contexts/I18nContext.tsx`。
- Go バインディングは `desktop/internal/binding/*.go`、`main.go` の `Bind:` 配列で登録。例: `MapBinding`, `RegionBinding`, `UserBinding`。
- 永続化は LinkSelf MyDB 経由の `shared/domain/repository/linkself_personal.go`（個人設定向けリポジトリが既存、要確認）。
- トースト／ツールチップ／通知 UI の既存実装は見当たらない（新規作成）。
- 地図レンダラは `src/lib/map-renderer.ts`。現時点で辺／頂点ホバーイベントは未公開のため、追加フックが必要。

## アーキテクチャ変更

### バックエンド（Go）
- 新規バインディング: `desktop/internal/binding/settings.go`
  - `GetHiddenTipKeys() ([]string, error)`
  - `SetTipHidden(key string, hidden bool) error`
  - `ResetHiddenTips() error`
  - `GetLocale() (string, error)` — ユーザースコープの言語設定取得
  - `SetLocale(locale string) error` — ユーザースコープの言語設定保存
- 永続化先: `shared/domain/repository/linkself_personal.go` 上の `PersonalRepo` (LinkSelf 個人設定、端末間同期) に下記メソッドを追加
  - `GetHiddenTipKeys / AddHiddenTipKey / ClearHiddenTipKeys`
  - `GetLocale / SetLocale`
  - データモデル: `app_settings` キー値テーブル（または既存 personal 領域の kv ストア）
    - `ui.hiddenTipKeys` → JSON 配列
    - `ui.locale` → 文字列 ("ja" | "en")
- `desktop/main.go` の `Bind:` に `settingsBinding` を追加。

### フロントエンド（TypeScript / React）
- 新規コンテキスト: `desktop/frontend/src/contexts/TipsContext.tsx`
  - 公開 API: `showTips(keys: string[])`, `hideTip(key)`, `resetHiddenTips()`
  - 内部状態: `activeTips: TipInstance[]`, `queue: string[]`, `hiddenKeys: Set<string>`
- 新規コンポーネント: `TipStack.tsx`（右上固定）/ `TipCard.tsx`（単一表示＋「表示しない」ボタン）
- 新規フック: `src/hooks/useTips.ts`
- 新規サービス: `src/services/settings-service.ts`（Wails バインディングのラッパ）
- 新規ページ: `src/pages/SettingsPage.tsx` — ヘルプ表示リセット + 言語切替 (ja/en) を含む
- `src/App.tsx` に `/settings` ルートと `<TipsProvider>` 配線、`<Layout>` 内に `<TipStack />` 常駐
- `src/components/Layout.tsx` に設定ナビ追加、**既存の locale 切替ボタンをサイドバーから削除**
- `src/contexts/I18nContext.tsx` の初期ロードを Go バインディング (`SettingsBinding.GetLocale`) 経由に変更（非同期ロード中は仮の locale で描画、取得完了後に差し替え）
- `SettingsPage` での言語変更は `SettingsBinding.SetLocale` → `I18nContext` 更新の順で反映
- 既存 `localStorage` に locale 値が残っていれば、アプリ初回起動時に LinkSelf へ一度だけ移行（移行後 localStorage から削除）
- i18n に `tips: Record<TipKey, string>` と `settings: {...}` セクションを追加

### 地図編集統合
- `src/lib/map-renderer.ts` に `onEdgeHover`, `onVertexHover` コールバック追加
- `src/components/MapView.tsx` で props 経由に公開
- `src/pages/MapPage.tsx` で `useTips()` を取得しホバー時 `showTips([...])` を呼ぶ

## データモデル（永続化）
```
app_settings
  key   TEXT PRIMARY KEY
  value TEXT (JSON)

key = "ui.hiddenTipKeys"
value = ["map.edgeRightClickEdit", "map.vertexDragEdit", ...]

key = "ui.locale"
value = "ja" | "en"
```

## showTips API 設計
```ts
type TipKey = keyof Translations["tips"];
interface TipInstance { id: string; key: TipKey; createdAt: number; }

interface TipsContextValue {
  showTips(keys: TipKey[]): void;
  hideTip(key: TipKey): Promise<void>;
  resetHiddenTips(): Promise<void>;
  hiddenKeys: ReadonlySet<TipKey>;
}
```

動作仕様:
- `hiddenKeys` に含まれるキーは除外
- queue → `INTERVAL_MS = 1500` ごとに `activeTips` の先頭へ unshift（既存は下へ押下）
- 各 `TipInstance` は `DISPLAY_MS = 5000` でフェードアウト
- **同時表示上限 `MAX_ACTIVE = 5`**。超過する場合は最古の `TipInstance` を即時除去してから unshift
- **同一 key が `activeTips` または `queue` に存在する場合は重複投入をスキップ**（ちらつき防止）
- アンマウント時に全タイマクリア

### 地図画面初期表示
- `MapPage` は `TipsContext` に加えて「地図画面で showTips 初期発火済みか」を追跡するセッションフラグを持つ（`useRef` + context-level ref、ページ離脱〜再訪で維持、アプリリロードでリセット）
- 地図データロード完了を検出したら、フラグが未セットなら `showTips([...POLYGON_DRAWING_TIP_KEYS])` を呼び出してフラグをセット
- `POLYGON_DRAWING_TIP_KEYS` は実装済み描画操作のキー配列（論理順固定）。実装調査時に確定する（下記リスト参照）

CSS: `transform: translateY(-20px) → 0` + `opacity 0 → 1` で slideDown、退出は opacity フェード。`TipStack` は `position: fixed; top:16px; right:16px; flex-direction:column; gap:8px; pointer-events:none;`、カード側 `pointer-events:auto`。

## i18n キー命名
- `tips.<画面>.<動作>` 例: `tips.map.edgeRightClickEdit`, `tips.map.vertexDragEdit`
- 設定: `settings.title`, `settings.helpSection`, `settings.resetHelp`, `settings.resetHelpDone`

### ポリゴン描画関連 Tip キー候補（実装調査後に実装済みのみ採用）
論理順で発火する。未実装のものは採用せず、実装追加時に追記する。

1. `tips.map.polygon.startDraw` — 「地図上をクリックして頂点を追加、ポリゴン描画を開始します」
2. `tips.map.polygon.continueVertex` — 「クリックし続けて頂点を追加します」
3. `tips.map.polygon.confirmDraw` — 「始点をクリック、またはダブルクリックで描画を確定します」
4. `tips.map.polygon.cancelDraw` — 「Esc キーで描画をキャンセルします」
5. `tips.map.polygon.moveVertex` — 「頂点をドラッグで移動できます」
6. `tips.map.polygon.deleteVertex` — 「頂点を右クリックで削除します」
7. `tips.map.polygon.splitEdge` — 「辺を右クリック、または中点をドラッグで新しい頂点を追加します」
8. `tips.map.polygon.selectPolygon` — 「ポリゴン内部をクリックで選択します」
9. `tips.map.polygon.deletePolygon` — 「選択後 Delete キーで削除します」

**※ 実装時に `map-renderer.ts` と `map-polygon-editor` を調査し、実装済みでないものはスキップする。操作キー割り当てが異なる場合は文言を実態に合わせる。**

## 実装ステップ

### Phase 1: 永続化とバインディング（Go）
1. `shared/domain/repository/linkself_personal.go` に `GetHiddenTipKeys / AddHiddenTipKey / ClearHiddenTipKeys` 追加（既存 kv の有無を要調査、無ければ `app_settings` スキーマを追加）— Risk: Medium
2. `desktop/internal/binding/settings.go` 新設 + 単体テスト — Risk: Low
3. `desktop/main.go` の `Bind:` に登録 — Risk: Low

### Phase 2: フロントエンド基盤
4. i18n 型・翻訳追加（`i18n-types.ts`, `ja/index.ts`, `en/index.ts`）
5. `src/services/settings-service.ts`（mock でユニットテスト）
6. `src/contexts/TipsContext.tsx`（vitest + fake timers でキュー/スタック/重複抑制/hidden 除外を検証）
7. `TipStack.tsx` / `TipCard.tsx`（a11y: `role="status" aria-live="polite"`）
8. `src/App.tsx` に Provider 配線、`<Layout>` に `<TipStack />` 追加

### Phase 3: 設定画面
9. `src/pages/SettingsPage.tsx`
   - ヘルプ表示リセットボタン（`resetHiddenTips()` → 完了通知）
   - 言語切替 UI (ja/en ラジオ or セレクト) → `SettingsBinding.SetLocale` 経由で保存、`I18nContext` を更新
10. `src/components/Layout.tsx`
    - `navItems` に `/settings` を追加
    - 既存の locale 切替ボタンを削除
11. `src/contexts/I18nContext.tsx` を改修
    - 起動時: `localStorage["ui.locale.mirror"]` があれば即座にその locale で描画（ちらつき防止）
    - 並行して `SettingsBinding.GetLocale()` を非同期呼び出し、取得後に差分があれば locale を差し替え
    - `SettingsBinding.SetLocale()` 成功時は `localStorage` ミラーも同時更新
    - 旧 `localStorage` locale キー（既存実装の key 名）がある場合は初回のみ LinkSelf へ移行し、旧キーを削除してミラーキーへ置き換え
    - ミラー無しかつ LinkSelf 未設定なら `ja` をデフォルト

### Phase 4: 地図編集トリガと初期表示
12. **実装済み描画操作の調査** — `src/lib/map-renderer.ts`, `src/pages/map.ts`, `map-polygon-editor` を読み、採用する `POLYGON_DRAWING_TIP_KEYS` を確定（未実装はスキップ、操作キーの実態を文言に反映）
13. `src/lib/map-renderer.ts` に `onEdgeHover` / `onVertexHover`（enter のみ、debounce 200ms）
14. `src/components/MapView.tsx` で props 公開
15. `src/pages/MapPage.tsx` で `useTips()` を取得し:
    - 地図データロード完了を検出したら、セッションフラグ未セット時のみ `showTips(POLYGON_DRAWING_TIP_KEYS)` を発火しフラグをセット
    - 辺 enter → `showTips(['tips.map.polygon.splitEdge'])` 等のホバートリガ

### Phase 5: ドキュメント
14. `docs/wants/03_地図機能.md` にヘルプ表示の節を追加。設定画面は `01_共通基盤.md` もしくは新規 `10_UI共通.md` に記述。`docs/未整理wants.md` から該当項目を削除。

## テスト戦略
- Unit: `settings-service.test.ts`, `TipsContext.test.tsx`（fake timers）, `TipCard.test.tsx`, `settings_test.go`, `linkself_personal` テストに hiddenTipKeys 追加
- Integration: MapPage + TipsProvider で JSDOM による表示確認
- 手動 E2E: Wails dev で辺ホバー→フェード、複数連続押下、再起動後の非表示維持、リセット動作

## リスクと対策
- **スキーマ欠如**: `linkself_personal` に汎用 kv が無い可能性 → `app_settings` テーブル追加で対応
- **ホバー暴発**: レンダラ debounce + Context 側で同一 key 抑制
- **WebKitGTK の transition 差異**: transition をシンプル化、`prefers-reduced-motion` で即時切替
- **非同期保存失敗**: 楽観的 UI（ローカル即反映 + 背景永続化、失敗はログ）

## ユーザー確定事項（2026-04-08 対話にて）
- 初期表示対象は**ポリゴン描画関連のみ**（一般地図操作・区域追加削除は対象外）
- キー順は論理順固定、表示間隔 1.5 秒
- 同時表示上限 5 件、超過時は最古から即時フェードアウト
- 「表示しない」は初期表示からもスキップ、全非表示ならゼロ表示で正常
- 発火タイミング: 地図データロード完了後
- 頻度: セッション中 1 回のみ（再訪では再発火しない）
- ホバートリガは残す
- 対象は**実装済みの操作のみ**。未実装機能はヘルプに含めない
- 仕様・実装変更時はヘルプとの齟齬確認を必須とする（MEMORY.json に保存済み）

## ユーザー確定事項 追補（2026-04-08）
- **永続化先**: LinkSelf 個人設定（端末間同期、ユーザースコープ）
- **設定画面スコープ**: ヘルプリセット + 言語切替を統合。サイドバーの言語ボタンは削除
- **言語設定もユーザースコープ**: `ui.locale` を LinkSelf 個人設定に保存
- **ツールチップ基盤**: 汎用 (`tips.<画面>.<動作>`) 。地図以外の画面でも流用可能に設計
- **i18n 範囲**: ja/en 両方を最初から用意
- **言語ロード中の暫定 locale**: `localStorage["ui.locale.mirror"]` に前回値をミラー保存し、起動時は即座にそれを使用。非同期で LinkSelf から取得して差分があれば差し替え
- **未決事項なし**: 計画確定

## 成功基準
- [ ] 辺／頂点ホバー時にツールチップがスライドダウンし 5 秒後に消える
- [ ] 複数キーの順次表示・積み上げが動作する
- [ ] 「このメッセージを表示しない」でキーが永続的に非表示になる
- [ ] 再起動後も非表示状態が維持される
- [ ] 設定画面のリセットで全キーが再表示される
- [ ] 既存テストがグリーン、追加部分のカバレッジ 80% 以上

## 関連ファイル
- desktop/main.go
- desktop/internal/binding/map.go
- shared/domain/repository/linkself_personal.go
- desktop/frontend/src/App.tsx
- desktop/frontend/src/components/Layout.tsx
- desktop/frontend/src/components/MapView.tsx
- desktop/frontend/src/lib/map-renderer.ts
- desktop/frontend/src/pages/MapPage.tsx
- desktop/frontend/src/i18n/i18n-types.ts
- desktop/frontend/src/i18n/ja/index.ts
- docs/wants/03_地図機能.md
- docs/未整理wants.md

---

**WAITING FOR CONFIRMATION**: この計画で進めてよいですか？（yes / modify: ... / different approach: ...）

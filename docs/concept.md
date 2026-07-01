# HOME-VISIT-SUITE — コンセプト（中央書類）

| 項目 | 内容 |
|---|---|
| プロダクト名 | HOME-VISIT-SUITE（戸別訪問活動スイート） |
| 生成方法 | `/flow:onboard`（既存コードベースからの逆生成） |
| 生成日 | 2026-07-01 |
| 対象コードベース | `/home/seiji/home-visit-suite` |
| SoT 関係 | 意図の SoT = `docs/wants/01〜11`／本書 = 実装実態 + 意図↔実装ドリフトの中央集約 |
| ドキュメント方針 | 本 PJ は補助ドキュメントを増やさない方針。本書は wants/ を置き換えず、実態把握とドリフト論点の索引に徹する |

> **本書の位置づけ（重要）**
> `docs/wants/` は「人と AI の対話で作った**意図**」であり、必ずしも実装の現実を反映していない。
> 本書はコードベースを網羅読みして得た「**実装の現実**」と、「意図↔実装の乖離（ドリフト）」を集約する。
> 次の作業（① ドキュメント修正 → ② 設計・実装変更）の土台として、§8 のドリフト論点を参照する。

---

## §1 プロダクト概要

### §1.1 プロダクト名 + 一行説明

**HOME-VISIT-SUITE** — グループ／組織が**戸別訪問（戸別訪問活動）**を体系的に行うためのアプリスイート。領域・区域の地図管理、区域の排他的チェックアウト（担当割当）、訪問記録、網羅（カバレッジ）管理を扱う。データは **LinkSelf によるサーバーレス P2P** でグループ内に閉じ、外部に出ない。

### §1.2 提供価値・ターゲット・課題

- **提供価値**: 訪問先の重複・取りこぼしを防ぎながら、テリトリーを分割・割当・追跡し、訪問結果を記録して網羅度を可視化する。全データはグループ内 P2P に閉じるためプライバシーが保たれる。
- **ターゲット（1 LinkSelf グループ内、ロールで区別、上位互換）**:
  - **管理者 (admin)**: メンバー管理、ロール任免、メンバータグ、領域定義、区域セットの承認。
  - **編集メンバー (editor)**: ポリゴン／区域親番／区域の作成、AvailablePeriod・チェックアウト・強制返却・招待の管理、申請処理。デスクトップ管理アプリにログイン可。
  - **活動メンバー (member)**: 現場作業者。区域をチェックアウトし、モバイルアプリで訪問記録を作成。デスクトップ管理アプリにはログイン不可（予定）。
  - 管理・編集アプリは活動アプリの**上位互換**。
- **解決する課題**: テリトリー全体の系統的な戸別訪問を調整する（区域分割、担当者の割当・追跡＝排他的チェックアウト、訪問結果記録、再訪事故防止、網羅度測定）。

### §1.3 機能マップ（既存 `docs/wants/` を SoT として参照）

> 本 PJ の方針に従い、機能ごとの新規ドキュメントフォルダは作らない。各機能の精細仕様は既存 `docs/wants/` を SoT とする。下表は「機能領域 → 意図 SoT → 実装コード → 実装状況」の対応表。

| # | 機能領域 | 意図 SoT (`docs/wants/`) | 主な実装コード | 実装状況 |
|---|---|---|---|---|
| 1 | 共通基盤（データ構造・同期・i18n・設定） | `01_共通基盤.md` | `shared/linkself/*`, `shared/locale/*`, `binding/settings.go` | ✅ 稼働 |
| 2 | 領域と区域 | `02_領域と区域.md` | `models/region.go`, `binding/region.go`, `pages/RegionManagementPage.tsx` | ✅ 稼働（承認フローはサービス層未実装、後述 §8） |
| 3 | 地図機能（ポリゴン・場所） | `03_地図機能.md` | `binding/map.go`, `binding/place.go`, `pages/MapPage.tsx`, `pages/AreaDetailEditPage*.tsx`, `lib/map-*`, `lib/area-detail-*` | ✅ 稼働（部屋の地図描画は Phase-1 未対応） |
| 4 | メンバー管理と権限 | `04_メンバー管理と権限.md` | `models/user.go`, `service/auth*.go`, `binding/user.go`, `pages/UsersPage.tsx` | ⚠️ 部分（タグ管理は本実装、招待/任免 UI は未実装） |
| 5 | チェックアウト | `05_チェックアウト.md` | `models/{visit,checkout_invitation,available_period,access}.go`, `service/checkout*.go`, `service/available_period*.go`, `binding/{checkout,available_period}.go`, `pages/CheckoutsPage.tsx` | ✅ 稼働（Place レベル read-only は未実装） |
| 6 | 網羅管理 | `06_網羅管理.md` | `models/coverage.go`, `service/available_period*.go`, `pages/CoveragePage.tsx` | ⚠️ 部分（AvailablePeriod は本実装、網羅率算出は未配線） |
| 7 | 通知と申請 | `07_通知と申請.md` | `models/{notification,request,audit}.go`, `pages/RequestsPage.tsx` | ⚠️ スタブ（RequestsPage は静的、申請ライフサイクル未実装） |
| 8 | 活動メンバー向けアプリ（モバイル） | `08_活動メンバー向けアプリ.md` | （未着手） | ❌ 未着手（技術方針: Expo RN + gomobile + MapLibre） |
| 9 | 継続的検討事項 | `09_継続的検討事項.md` | — | 未決論点集（§8 と連動） |
| 10 | 画面設計 | `10_画面設計.md` | `pages/*`, `components/*` | ⚠️ 仕様が古い（後述 §8: 複数画面で実装が先行） |
| 11 | LinkSelf 拡張要望 | `11_LinkSelf拡張要望.md` | （link-self リポジトリへの提案ドラフト） | ❌ 提案段階 |

### §1.4 実装コードフォルダ構成（実態）

```
home-visit-suite/
├── desktop/                          # Wails デスクトップ管理・編集アプリ
│   ├── main.go                       # 起動: LinkSelf 起動 → repo 構築 → binding 束ね → wails.Run
│   ├── app.go                        # App ライフサイクル (startup/shutdown、frontend 露出メソッドなし)
│   ├── wails.json                    # name=home-visit-suite, tags=webkit2_41
│   ├── internal/binding/             # Wails Binding 層（Go→JS API 契約）
│   │   ├── checkout.go / available_period.go / visit.go
│   │   ├── region.go                 # ※ サービス層を経ずビジネスロジック直書き
│   │   ├── map.go / place.go / user.go / settings.go / identity.go
│   └── frontend/                     # React 19 + TS + Vite
│       └── src/
│           ├── App.tsx / main.tsx    # HashRouter + 4 プロバイダ
│           ├── pages/                # 画面（Dashboard/Map/AreaDetail/Regions/Visit/Checkouts/Coverage/Users/Requests/Settings）
│           ├── components/           # ダイアログ・地図ビュー・ツリー等
│           ├── contexts/             # Identity / I18n / Tips
│           ├── hooks/                # useMapState / usePolygonEditor / useAreaDetailMap / useCommandHistory
│           ├── lib/                  # 純ロジック（map-renderer, area-detail-*, *-flow, place-sort-order, visit-date-color）
│           ├── services/             # Binding ラッパ（region/place/polygon/visit/settings + command-*）
│           └── i18n/                 # typesafe-i18n 風カタログ（ja/en）
├── shared/                           # Go 共通コア（モバイルと共有予定）
│   ├── domain/
│   │   ├── models/                   # ドメインモデル（唯一 Map だけ struct 化されず JSON blob）
│   │   ├── *_repository.go           # リポジトリインターフェース群（Map インターフェースは未定義）
│   │   └── repository/               # memory(テスト) / jsonfile(region専用,レガシー) / linkself(本番)
│   ├── service/                      # auth / checkout / available_period / region(※IF のみ,実装なし)
│   ├── linkself/                     # LinkSelf 統合（service, tables, migrations v1-8, access）
│   ├── locale/                       # go-i18n（ja.json / en.json）
│   └── testdata/                     # 起動時 seed（※本番パスでも走る、§8）
└── docs/
    ├── wants/                        # 意図の SoT（01〜11）
    ├── user-stories/ , *.md          # 補助メモ
    ├── concept.md                    # 本書
    ├── INDEX.md / DOC_MAP.md
    └── AI_LOG/                       # 設計判断ログ
```

- **ランタイムのストレージは LinkSelf 一択**。`main.go` が `repository.NewLinkSelfRepository(lsService.DB())` を構築し全 binding に注入。memory/jsonfile はテスト専用で切替フラグなし。
- **Bind 対象（10 個、順序）**: `app`(メソッドなし), `region`, `map`, `user`, `settings`, `place`, `availablePeriod`, `visit`, `checkout`, `identity` → 実質 9 名前空間。

---

## §2 主要ユースケース

1. **テリトリー整備**: admin が領域（Region, 例 成田市/NRT）を定義 → editor がポリゴンを描き区域親番→区域に分割 → admin が区域セットを承認。
2. **チェックアウト運用**: editor が AvailablePeriod（チェックアウト可能期間, 対象区域親番付き）を定義 → member が区域を**排他的に**チェックアウト（1 区域 1 アクティブ）→ 現場訪問 → 結果記録 → 返却。
3. **区域招待**: 担当者/editor が他の活動メンバーを時限（既定 24h）で招待し共同作業。
4. **訪問記録**: member が場所（戸建て/集合住宅/部屋）ごとに 5 択（会えた/留守/空き家(入居可)/空き家(廃屋)/訪問拒否）で記録。廃屋・拒否は申請テキスト必須で Request を自動生成。
5. **網羅管理**: AvailablePeriod 単位で区域親番の網羅率を集計しダッシュボード・ヒートマップで可視化（**現状: 算出未配線**）。
6. **申請処理**: 現場からの場所追加/情報修正/地図更新/訪問拒否報告を editor がタスクとして処理（**現状: UI スタブ**）。

---

## §3 非機能要件（NFR）

| 区分 | 実装実態・目標 |
|---|---|
| デプロイ形態 | デスクトップネイティブ（Wails, Windows/Mac）。サーバーレス。将来モバイルネイティブ。 |
| データ機密性 | 全データはグループ内 P2P に閉じる（外部送信なし）。個人情報（訪問先住所・訪問拒否宅等）を扱うため機密性は最重要。 |
| 同期・整合性 | LinkSelf に委譲。地図エンティティは LWW（Last-Write-Wins by timestamp）。オフラインは Store-and-Forward。 |
| 可用性 | 単一プロセス（Wails）ローカルアクセス。ネットワーク断でもローカル DB で継続。 |
| スケール | **小規模組織**: 1 グループ＝メンバー数十名、1 自治体規模（領域数個、区域数百、訪問先数千〜数万）。 |
| i18n | ja/en 2 言語。Go 側（go-i18n）+ TS 側（typesafe-i18n 風）の二層。既定 ja。 |
| テスト | vitest（フロント）+ Go test（バックエンド、多数の *_test.go）。 |
| 監視/エラー追跡 | 専用ツールなし（デスクトップアプリ、P2P のため）。 |

### §3 セキュリティ観点（現状の注意点、§8 と連動）

- サービス層 RBAC（member/editor/admin）は各メソッドで `actorID` を明示受領し `Role.IsAtLeast` で判定。**セッション/トークン層はなく、呼び出し側が actorID を供給**する設計。
- LinkSelf 層の権限は `ls.Config.RoleDefs`/`AdminRole` で適用。別実装の `RoleBasedAccessPolicy`（テーブル別書込許可マトリクス）は**実装・テスト済みだがランタイム未配線**（権限の真実源が二重）。
- `SchemaValidator` インターフェースは実装なし（レコード本体検証が未実装）。

---

## §4 技術・リソース選定

### §4.3 リソース選定（コード/設定から抽出）

| カテゴリ | 選定 | 抽出元 |
|---|---|---|
| 言語（バックエンド） | Go 1.26.0（README は 1.24+） | `desktop/go.mod`, `shared/go.mod` |
| 言語（フロント） | TypeScript 5.9（strict, ESNext, bundler resolution） | `tsconfig.json` |
| デスクトップシェル | Wails v2 (v2.11.0) | `desktop/go.mod`, `wails.json` |
| UI フレームワーク | React 19.2 + react-router-dom 7.x（HashRouter） | `package.json`, `App.tsx` |
| ビルド | Vite 3 + @vitejs/plugin-react | `vite.config.ts`, `package.json` |
| 地図描画 | Leaflet 1.9 + GSI（国土地理院）タイル | `lib/map-renderer.ts` |
| ポリゴン編集 | map-polygon-editor 0.6（同一作者） | `package.json`, `usePolygonEditor.ts` |
| データ基盤 | LinkSelf（`github.com/SeijiShii/link-self/core`）= サーバーレス P2P | `shared/linkself/*` |
| 永続化 | LinkSelf MyDB → SQLite3（ncruces/go-sqlite3 wasm） | migrations.go, transitive deps |
| P2P スタック | libp2p, pion/webrtc, quic-go, ipfs/boxo, multiformats | transitive deps |
| i18n | go-i18n/v2 + golang.org/x/text（Go）／ typesafe-i18n 風（TS） | `shared/locale/*`, `src/i18n/*` |
| ID 生成 | google/uuid（Place 等）／ LinkSelf DID（User） | `models/*` |
| テスト | vitest 4 + Testing Library + jsdom（TS）／ Go test | `package.json`, `*_test.go` |
| 外部 AI | **なし** | 依存に AI SDK 不在 |

### §4.5 ローカル開発環境

- 前提: Go 1.24+, Node 18+, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, Wails CLI。
- **WSL2 開発**: `desktop/dev.sh`（webkit2gtk-4.1 タグ・`HVS_DEV=1` を設定、依存チェック・npm install 自動化）。日本語入力不可、英字で動作確認。
- **Windows ネイティブ（最終確認）**: IME 必要時。`D:\home-visit-suite` に clone、Git Bash で `wails dev`。WSL↔Windows は GitHub 経由同期。
- ビルド: `cd desktop && make build && ./build/bin/home-visit-suite`。
- 開発フラグ: `HVS_DEV=1` で identity 切替 UI とダミーユーザー seed が有効。
- 制約: `\\wsl$\` 経由は Go file lock 不可、`/mnt/*` は 9p で低速、WSLg+WebKitGTK は IME 不可。

---

## §5 データ規模

- **P2P 1 グループ＝1 組織**単位。小規模組織想定。
- 目安: 領域数個 / 区域親番 数百 / 区域 数百〜千 / 訪問先（場所）数千〜数万 / メンバー数十名。
- ScopeNetwork テーブル（全メンバー同期）: regions, parent_areas, areas, places, map_network, users, member_tags, checkouts, checkout_invitations, visit_records, visit_record_edits, coverages, available_periods, available_period_tags, requests, invitations, notifications, audit_log。
- ScopeDevice テーブル（同一ユーザーの端末間のみ）: personal_notes, personal_tags, personal_tag_assignments, app_settings。

---

## §6 外部連携

- **GSI（国土地理院）タイル**: 地図ラスタタイル（`cyberjapandata.gsi.go.jp`）。要オンライン（オフラインは事前取得）。
- **LinkSelf ネットワーク**: P2P データ同期基盤。Network 作成/招待/離脱、端末ペアリング（QR: `CreatePairingToken`/`CompletePairing`）。
- 外部 SaaS・クラウド・決済・認証プロバイダ・AI API 連携は**なし**（設計思想としてグループ内 P2P 完結）。

---

## §7 決定事項ログ

| 日付 | 決定 | 理由 | 影響範囲 | 参照 |
|---|---|---|---|---|
| 2026-05-06 | 貸出/持出の区別を廃止し「チェックアウト」に統一 | 概念単純化 | checkout, notification | migrations v8, `models/visit.go` |
| 2026-05-06 | OrgGroup（メンバーグループ）概念を廃止、ロール+タグで分類 | 分類の簡素化 | users, migrations | migrations v8, `models/user.go` |
| 2026-05-06 | SchedulePeriod/Scope/AreaAvailability を AvailablePeriod に統合 | 期間モデル一本化 | coverage, checkout | migrations v8 |
| 2026-05-06 | Activity/Team 概念を削除、activities→checkouts へリネーム | チェックアウトモデルへ集約 | 全体 | migrations v7 |
| 2026-07-01 | 運用規模を「小規模組織」で確定 | onboard での確認 | §3 NFR, §5 | 本 onboard セッション |
| 2026-07-01 | onboard は concept.md + INDEX + DOC_MAP + AI_LOG のみ生成（機能フォルダは wants/ 参照） | 補助ドキュメント重複回避・単一 SoT 尊重 | docs 構成 | 本 onboard セッション |

---

## §8 未決事項・ドリフト論点（意図↔実装の乖離）

> 次工程（ドキュメント修正 → 設計・実装変更）の入力。優先度は「①仕様書の陳腐化修正 → ②未実装意図の実装 → ③残骸整理 → ④アーキテクチャ整合」の順で内部整理。

### A. 仕様書が実装より古い（ドキュメント修正が必要）

- **[論点-001] `wants/10_画面設計` の画面ステータスが陳腐化**
  - 検出根拠: 10 は `/checkouts`（editor+ placeholder, high）・`/users`（admin placeholder, high）・`/coverage`・`/`（dashboard）を「未実装/placeholder」と記すが、コードでは **CheckoutsPage / UsersPage / CoveragePage / DashboardPage は本実装済み**。
  - 詰めるべき問い: 10 の画面ステータス表を実装現状に更新するか（推奨: 更新）。
  - 判断期限: ドキュメント修正フェーズ（近い）。

### B. 仕様が実装より先行（未実装の意図）

- **[論点-002] `RegionService` がインターフェースのみで実装なし**
  - 検出根拠: `service/region.go` に承認フロー・admin/editor ゲート・承認後の削除ロック等を定義するが、`region_impl.go`/`NewRegionService` が存在しない。実際の領域 CRUD は `binding/region.go` に直書きされ、**承認フロー（04）と権限ゲートがサービス層で強制されていない**。
  - 詰めるべき問い: (a) RegionService を実装して binding から移譲するか、(b) binding 直書きを正として仕様を追従させるか（推奨: (a) 実装 — 承認フローは 04 の中核要件）。
  - 影響範囲: regions, 権限, migrations（承認状態）。
- **[論点-003] Place レベル read-only モードが UI 未実装**
  - 検出根拠: `AccessMode` モデル・`PlaceAccessMode` API は存在するが常に `editable` を返すスタブ。UI トグルなし（05/09 の記載通り）。
  - 詰めるべき問い: 招待期限切れ後の再訪ニーズ（09）への対応としていつ実装するか。
- **[論点-004] 申請（Request）ライフサイクルが未実装（RequestsPage スタブ）**
  - 検出根拠: `pages/RequestsPage.tsx` は静的表示のみ。VisitPage の場所作成/修正申請は `console.log` のみ（`// TODO: Slice 10 RequestService`）。未処理/保留/処理済みの状態管理・却下・申請者通知が未実装（07 の「次スコープ」通り）。
  - 詰めるべき問い: RequestService の実装スコープと優先度。
- **[論点-005] 網羅率/達成率の算出が未配線**
  - 検出根拠: Dashboard の進捗列は `progressPlaceholder`、CoveragePage は達成率/過去記録ビューを明示的に未実装。`Coverage.ActualPercent/StatusPercent` カラムはあるが算出ロジックなし（06）。
  - 詰めるべき問い: 網羅率算出（訪問先の ≥1 記録比率、AvailablePeriod スコープ）の実装。
- **[論点-006] メンバー招待/任免 UI が未実装**
  - 検出根拠: `service/auth*.go` に InviteToRole/AcceptInvitation/DismissRole/RemoveMember は実装済みだが、`UsersPage` はタグ管理のみで招待/ロール変更/ユーザー作成 UI がない（04 は「招待・任免」を規定）。
  - 詰めるべき問い: 任免フローの UI を UsersPage に載せるか、専用画面にするか。
- **[論点-007] モバイル活動メンバーアプリ + LinkSelf 拡張（08/11）未着手**
  - 検出根拠: `mobile/` なし。11 は link-self への提案ドラフト。技術方針（Expo RN + gomobile + MapLibre）のみ確定。
  - 詰めるべき問い: 着手時期、LinkSelf 拡張の採否確認。

### C. コード内の残骸・技術的負債（整理が必要）

- **[論点-008] locale が activity→checkout リネーム後も旧名前空間のまま**
  - 検出根拠: `ja.json`/`en.json` のキーが `activity.*`、テキストが "visit activity" のまま（V7 で activity→checkout 済み）。
- **[論点-009] Phase-1 暫定コードの解消**
  - 検出根拠: `VisitBinding.RecordVisitPhase1`（チェックアウトバイパス）、`VisitPageContainer` の `PHASE1_AREA_ID="NRT-001-01"` ハードコード（`/visits/:areaId` の param 無視）、`VisitRecord.CheckoutID` 空文字許容（本来 NOT NULL）。
  - 詰めるべき問い: 本チェックアウト→訪問→返却フローの配線完了と暫定 API 削除。
- **[論点-010] 残存する廃止概念**
  - 検出根拠: `NotificationType` に `lending`（区域貸出、廃止済）が残存。`RemoveMember` は担当チェックアウトのクリーンアップ未実装（IF の記述と不一致）。`InviteToRole` の doc（admin/editor+）とコード（editor+ のみ）不一致。
- **[論点-011] i18n 抜け漏れ**
  - 検出根拠: `EdgeContextMenu` が「頂点の追加」をハードコード（他は全て useI18n 経由）。→ グローバル方針「i18n 準拠レビュー」対象。
- **[論点-012] `wails generate` 未実行による型手動ミラー**
  - 検出根拠: `place-service.ts`/`visit-service.ts` が `Place`/`VisitRecord`/`Coordinate` を手動再定義（生成 models 不使用）。Go 側変更との同期ドリフトリスク。
- **[論点-013] `buildPolygonAreaMap` が area.id をラベル表示**
  - 検出根拠: `areaLabel` に `area.id` を代入。`formatAreaLabel` があるのに未使用で、PolygonList/AreaPicker が生 ID を表示。
- **[論点-014] スケジューラ未配線 / 本番 seed**
  - 検出根拠: `ForceCloseExpiredCheckouts`（期間終了時の強制クローズ）実装済みだがスケジューラに未接続。`main.go` の seed/legacy region 削除が **HVS_DEV 非依存で本番パスでも実行**（新規実インストールにダミーデータが入る）。

### D. アーキテクチャの不整合

- **[論点-015] サービス層の有無が機能で不揃い**
  - 検出根拠: checkout/visit/available_period はサービス層あり。region/map/user/place/settings は binding 直書き（特に region はビジネスロジック大）。フロントも checkout/user/identity/available-period はサービスラッパなしで binding 直呼び。
- **[論点-016] Map ドメインの表現が例外的**
  - 検出根拠: Map はドメインインターフェース未定義、linkself 実装のみ、struct 化されず**不透明 JSON blob 一括保存**（`GetNetworkJSON`/`SaveNetworkJSON`）。`03_地図機能` は per-entity（map_vertices/edges/polygons）保存を意図。
- **[論点-017] 権限の真実源が二重**
  - 検出根拠: サービス層 RBAC と LinkSelf `RoleDefs`、さらに未配線の `RoleBasedAccessPolicy`。`SchemaValidator` は未実装。

### E. 09 由来の継続検討事項（既存）

- 招待メンバーの期限切れ後再訪（Place read-only 再利用予定, → [論点-003]）
- 区域編集画面のロール別権限分割
- 場所も座標もない訪問記録の扱い（今フェーズ対象外）
- 場所種別「その他」の定義
- 場所作成申請の長押し誤爆防止 UX
- リバースジオコーディング（住所自動取得）、メゾネット等の部屋レイアウト表現、重複区域巡回、MyPage の UIUX

---

## §9 実装状況サマリ

| 区分 | 件数/状態 |
|---|---|
| ドメインモデル（struct 化） | 20+ エンティティ（Map のみ JSON blob） |
| Binding 名前空間 | 9（region/map/user/settings/place/availablePeriod/visit/checkout/identity） |
| サービス | auth / checkout / available_period 実装、region は IF のみ（未実装） |
| LinkSelf migrations | v1〜v8 |
| フロント画面 | 本実装 7（Dashboard/Map/AreaDetail/Regions/Checkouts/Coverage/Users）+ Visit(Phase-1) + Requests(スタブ) + Settings |
| ドリフト論点 | 17 件（§8: A×1, B×6, C×7, D×3）+ 09 継続検討 |
| 過去 flow 実行 | 0（本 onboard が初回） |

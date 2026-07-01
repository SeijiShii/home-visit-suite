# AI_LOG — D20260701_001 / /flow:onboard / home-visit-suite

## セッションサマリ

| 項目 | 内容 |
|---|---|
| 実行日時 | 2026-07-01（JST） |
| コマンド | `/flow:onboard` |
| codebase_root | `/home/seiji/home-visit-suite` |
| docs_root | `/home/seiji/home-visit-suite` |
| 実行者 | SeijiShii |
| 状態 | 完了 |
| decision 範囲 | Step 0（方針衝突）〜 Step 4（生成） |

### 主要決定サマリ

| id | 決定 | chosen_type | 確信度 |
|---|---|---|---|
| D20260701-001 | CLAUDE.md「補助ドキュメント禁止」方針を今回のみ override して onboard 一式生成 | explicit-choice | — |
| D20260701-002 | 考慮漏れ視点チェック(Step 3.6) は実行しない | explicit-choice | — |
| D20260701-003 | onboard の目的 = コードベース↔ドキュメントの状態を揃える（wants は意図、code が現実） | explicit-choice | high |
| D20260701-004 | コード読み取り = 並列エージェント6モジュールで網羅読み | explicit-choice | — |
| D20260701-005 | 運用規模 = 小規模組織 | auto-recommended | high |
| D20260701-006 | §1.3 機能マップ = 新規フォルダを作らず既存 docs/wants/ を参照 | explicit-choice | high |

### 抽出結果サマリ（数値）

- 言語: Go 1.26 / TypeScript 5.9
- FW: Wails v2, React 19, Vite 3
- ドメインモデル: 20+ エンティティ（Map のみ JSON blob）
- Binding 名前空間: 9
- サービス: 3 実装（auth/checkout/available_period）+ 1 未実装(region)
- LinkSelf migrations: v1〜v8
- フロント画面: 10（本実装7 + Phase-1×1 + スタブ×1 + 設定×1）
- 外部依存: LinkSelf(P2P), GSI タイル。外部 AI なし。
- 検出ドリフト論点: 17 件

### 生成・更新アーティファクト

- `docs/concept.md`（新規）
- `docs/INDEX.md`（新規）
- `docs/DOC_MAP.md`（新規）
- `docs/AI_LOG/D20260701_001_onboard_home-visit-suite.md`（本ファイル）
- `docs/AI_LOG/INDEX.md`（新規）

---

## Decisions

```yaml
- id: D20260701-001
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 0 / 方針衝突の解消
  question: docs/wants/ 単一SoT方針と onboard のドキュメント逆生成が衝突。どう進めるか
  options: [会話内オンボードのみ, wants/ を検証・補完, onboard 一式を通常生成]
  recommended: 会話内オンボードのみ（CLAUDE.md 方針尊重）
  chosen: onboard 一式を通常生成
  chosen_type: explicit-choice
  context: |
    CLAUDE.md「補助ドキュメントは作らない/wants を単一SoT」と onboard の成果物一式が衝突。
    ユーザーは今回のみ方針を override して通常生成を選択。

- id: D20260701-002
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 0.5 / 考慮漏れ視点チェック実行可否
  question: 考慮漏れ視点チェック(Step 3.6)を実行するか
  options: [実行しない, 実行する]
  recommended: 実行しない（wants に 11 本の精細仕様があり重複論点を出しやすい）
  chosen: 実行しない
  chosen_type: explicit-choice
  context: |
    既存 docs/wants/ が大半の観点を検討済みの可能性が高く、コードのみ見るチェックは
    既存仕様を見落とし重複論点を出しやすいと判断。

- id: D20260701-003
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 1 / onboard 目的の明確化
  question: onboard の狙いは何か
  options: [新規 concept 生成, コードベース↔ドキュメントの状態を揃える]
  recommended: —
  chosen: コードベース↔ドキュメントの状態を揃える（wants=意図/code=現実、ドリフト検出）
  chosen_type: explicit-choice
  depends_on: [D20260701-001]
  context: |
    ユーザー補足「wants は人と AI の対話で作ったもので AI に十分とは限らない。
    コードとドキュメントの状態を揃えるのが目的。その後ドキュメント修正 → 設計・実装変更」。

- id: D20260701-004
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 1.2 / Read スコープ・方法
  question: コードの読み取り方法
  options: [並列エージェント網羅読み, 直接 Read 代表サンプル, 全ファイル精査]
  recommended: 並列エージェント網羅読み
  chosen: 並列エージェント網羅読み（binding/domain/service-linkself/frontend-pages/frontend-lib/intent-wants の6モジュール）
  chosen_type: explicit-choice
  depends_on: [D20260701-003]
  context: |
    ドリフト検出が目的のためコード網羅性を優先。Explore エージェント6並列で
    各モジュールの実装実態を構造化抽出。

- id: D20260701-005
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 3 / Q5-Q6 データ規模・同時利用者数
  question: 想定運用規模
  options: [小規模組織, 中規模, 規模未定・後で]
  recommended: 小規模組織
  chosen: 小規模組織（1グループ=数十名、1自治体規模）
  chosen_type: auto-recommended
  context: |
    P2P・グループ内閉じの設計、無料・個人/小集団ツールの性質から小規模組織を推奨。
    コードからは規模を直接読み取れないためユーザー確認。

- id: D20260701-006
  timestamp: 2026-07-01T00:00:00+09:00
  command: /flow:onboard
  phase: Step 3.5 / 機能フォルダ分割
  question: concept §1.3 機能マップの構成
  options: [既存 wants/ 参照, 新規機能フォルダ生成, concept.md のみ]
  recommended: 既存 wants/ 参照
  chosen: 既存 wants/ 参照（新規フォルダを作らず docs/wants/01〜11 へマッピング）
  chosen_type: explicit-choice
  depends_on: [D20260701-001]
  context: |
    docs/wants/ に既に 11 本のテーマ別精細仕様があり、機能フォルダ新設は重複を生む。
    単一 SoT 文化を尊重し concept §1.3 を wants への対応表とした。
```

## 学習・改善

- 本 PJ は preferences.md の 12 Web SaaS 系 PJ（Vercel+Neon+Clerk+React PWA）と技術プロファイルが大きく異なる**異例パターン**（Wails デスクトップ + Go + P2P LinkSelf + ネイティブモバイル予定）。preferences の推奨バイアスは React+TS+Vite / vitest のみ整合、他はほぼ適用外。
- onboard は「既存 wants/ が意図、code が現実」というケースで、ドリフト検出（意図↔実装の乖離を §8 に集約）が最大の価値になる好例。機能フォルダ逆生成より concept + ドリフトマップに集約する方が、単一 SoT 文化の PJ に適合する。

# DOC_MAP — AI 用エントリポイント

HOME-VISIT-SUITE のドキュメント地図。AI/エージェントが目的別に最短でたどり着くための索引。

## §0 目的別アクセス

| やりたいこと | 参照先 |
|---|---|
| プロダクト全体像を掴む | [concept.md](./concept.md) §1 |
| 実装の現実（何が動くか）を知る | [concept.md](./concept.md) §1.4, §9 |
| 意図↔実装の乖離（次にやること）を知る | [concept.md](./concept.md) §8 ドリフト論点 |
| ある機能の詳細仕様を読む | [concept.md](./concept.md) §1.3 の対応表 → 該当 `wants/NN` |
| 技術スタック・依存を確認 | [concept.md](./concept.md) §4.3 |
| ローカル開発環境を立てる | [concept.md](./concept.md) §4.5 + `../README.md` + `windows-build.md` |
| 設計判断の経緯を追う | [AI_LOG/INDEX.md](./AI_LOG/INDEX.md) |

## §1 全体ドキュメント

- [concept.md](./concept.md) — 中央書類（実態 + ドリフト）
- [INDEX.md](./INDEX.md) — docs 索引

## §2 機能領域 → 意図 SoT → 実装コード

| 機能領域 | 意図 SoT | 主な実装 | 状況 |
|---|---|---|---|
| 共通基盤 | `wants/01` | `shared/linkself/*`, `shared/locale/*` | ✅ |
| 領域と区域 | `wants/02` | `models/region.go`, `binding/region.go`, `RegionManagementPage` | ✅(承認未) |
| 地図機能 | `wants/03` | `binding/{map,place}.go`, `MapPage`, `AreaDetailEditPage`, `lib/*` | ✅(部屋未) |
| メンバー管理と権限 | `wants/04` | `service/auth*.go`, `binding/user.go`, `UsersPage` | ⚠️ |
| チェックアウト | `wants/05` | `service/checkout*.go`, `binding/checkout.go`, `CheckoutsPage` | ✅ |
| 網羅管理 | `wants/06` | `service/available_period*.go`, `CoveragePage` | ⚠️ |
| 通知と申請 | `wants/07` | `models/{notification,request,audit}.go`, `RequestsPage` | ⚠️スタブ |
| 活動メンバーアプリ | `wants/08` | （未着手） | ❌ |
| 画面設計 | `wants/10` | `pages/*`, `components/*` | ⚠️仕様陳腐化 |
| LinkSelf 拡張 | `wants/11` | （提案ドラフト） | ❌ |

## §3 横断関心事

| 関心事 | 実装 |
|---|---|
| データ同期・P2P | LinkSelf（`shared/linkself/*`, migrations v1-8） |
| i18n | go-i18n(Go) + typesafe-i18n 風(TS)、ja/en |
| アイデンティティ | LinkSelf DID + `IdentityContext` + `binding/identity.go`（dev 切替 HVS_DEV=1） |
| 権限(RBAC) | サービス層 `Role.IsAtLeast` + LinkSelf `RoleDefs`（真実源二重, §8 論点-017） |
| UI 共通 | `Layout`(ロール別ナビ), Tips/help, command-history(削除 undo/redo) |

## §4 設計判断ログ

- [AI_LOG/INDEX.md](./AI_LOG/INDEX.md) → [D20260701_001](./AI_LOG/D20260701_001_onboard_home-visit-suite.md)

## §5 依存グラフ（概略）

```
frontend (React/pages) → wailsjs binding → desktop/internal/binding
                                              ↓
                              shared/service (auth/checkout/available_period)
                                              ↓
                              shared/domain/repository (linkself impl)
                                              ↓
                              shared/linkself (LinkSelf MyDB / SQLite / P2P)
```
※ region/map/user/place/settings は service を経ず binding→repository 直（§8 論点-015）

## §6 コマンド使い分け（次工程の目安）

- ドキュメント修正: `docs/wants/` 該当ファイルを直接編集（§8 論点-001, 008-014 系）
- 設計・実装変更の計画: `/plan`（本 PJ は補助ドキュメントを作らず会話/コミットで完結）
- 未実装意図の実装: §8 B 群（論点-002〜007）

## §7 履歴サマリ

| 種別 | 累計 |
|---|---|
| onboard | 1（2026-07-01） |
| revise / fix / claim | 0 |
| ドリフト論点 | 17（未解消） |

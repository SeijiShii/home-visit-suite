# Home Visit Suite

## 仕様書
- `docs/wants/` にテーマ別に仕様を記載
  - 01_共通基盤.md - データ構造方針、用語定義、実行環境、データインフラ
  - 02_領域と区域.md - 領域・区域親番・区域の定義と体系
  - 03_地図機能.md - ポリゴン編集、紐付け、住宅情報
  - 04_メンバー管理と権限.md - ロール、招待・任免、承認フロー
  - 05_チェックアウト.md - チェックアウト／返却・回収／担当者／区域へのアクセス権／区域招待
  - 06_網羅管理.md - 網羅活動、進捗管理、予定管理
  - 07_通知と申請.md - 通知、申請取扱い、監査ログ、データ保持
  - 08_活動メンバー向けアプリ.md - 訪問記録、最新状況、場所データ
  - 09_継続的検討事項.md - 未決事項・実装側の積み残し
  - 10_画面設計.md - 画面構成と Binding 対応
  - 11_LinkSelf拡張要望.md - LinkSelf に必要な拡張点

## 技術決定

**2026-07-07 方針転換: 全面 PWA 化**（動機: プラットフォーム別ネイティブアプリはストア審査等の負担が大きいため）

- **アプリ形態**: 単一 PWA（React + TypeScript + Vite）+ ロール別 UI。実装場所は本リポジトリ `pwa/`（2026-07-07 決定）
  - 管理者・編集メンバー・活動メンバーの機能を権限ゲートで出し分ける（上位ロールは下位を包含する既存仕様に合わせる）
  - デスクトップ・モバイルの全プラットフォームでブラウザ／ホーム画面追加により動作
- **Wails 版（`desktop/`）は新規開発凍結・段階的廃止**
  - `desktop/frontend` の React 資産（画面・map-polygon-editor・i18n catalog・style.css）は PWA へ移植・流用する
  - 凍結中の起動手順は下記「開発環境」を参照用に残す
- **データインフラ**: LinkSelf（サーバーレスP2P）
  - https://github.com/SeijiShii/link-self
  - PWA からは **ブラウザ向け TypeScript 実装**（js-libp2p + sqlite-wasm + WebCrypto、Go 実装とワイヤ互換の第二実装）を使用する。TS 実装は link-self リポジトリ側で開発
  - ブラウザピアは着信不可のため**常時稼働ノード**（リレー／ブートストラップ／メールボックス、Go デーモン）が必要。E2E 暗号化により中身を読めない「ただの土管」であり、データがグループ外に出ない原則は維持される
  - 設計 SoT: `link-self/docs/spec/browser-pwa-support.md`
- **地図**: GSIタイル（日本）、map-polygon-editor（TypeScript実装、DOM 前提のため PWA でそのまま流用可）でポリゴン編集
- **廃止した選択肢**: 活動メンバー向けモバイルネイティブ（Expo + gomobile）、Electron

## 開発環境
- **コード編集・テスト**: WSL2 (Ubuntu) — Claude Code、VSCode Remote-WSL、vitest
- **PWA 実行（開発）**: `cd pwa && npm install && npm run dev`（Vite dev サーバー、ブラウザで http://localhost:5173/）
- PWA はブラウザで動作するため、以下の Wails 実行手順は**凍結中の参照用**（Wails 版を確認する場合のみ）
- **Wails実行（開発中）**: WSL2で `desktop/dev.sh` を実行（依存チェック・webkit2gtk-4.1対応・npm install を自動化）
  - 日本語入力不可、英字で動作確認
- **Wails実行（最終確認）**: Windows ネイティブ — IME（日本語入力）が必要な場合
  - Windows側に Go + Wails CLI をインストール
  - `D:\home-visit-suite` に git clone
  - Git Bash で `cd /d/home-visit-suite/desktop && wails dev`
  - WSL↔Windows同期: GitHub経由で push/pull
- **制約**:
  - `\\wsl$\` パス経由では Go の file lock が動作しない（`go mod tidy` 失敗）
  - `/mnt/c/`, `/mnt/d/` 経由は 9p オーバーヘッドで低速
  - WSLg + WebKitGTK では IME 入力が機能しない

## 開発方針
- **仕様変更時**: `docs/wants/` 以下の該当ドキュメントを必ず更新する
- 必要に応じて他のドキュメント（CLAUDE.md等）も変更する
- 変更内容を `.claude` 関連ファイルに記録する
- **補助ドキュメントは作らない**: `docs/wants/` の精細仕様書を単一のソース・オブ・トゥルースとする
  - 実装計画書・決定記録・進捗サマリ・設計メモ等の中間ドキュメントは新規作成しない
  - `/dev-plan` `/dev-review` 等、補助ドキュメントを生成するスキルは使用しない
  - 計画や設計判断は会話・タスクリスト・git コミットメッセージで完結させる
  - 仕様の追記・改訂が必要なら `docs/wants/` 該当ファイルへ直接反映する

## UI 実装方針

- **ネイキッド UI 禁止**: 新規コンポーネントを書くときに素の HTML 要素＋ブラウザデフォルトスタイルのまま放置しない。table・button・select・input・label など必ず適切な class を当てる
- **既存スタイル踏襲**: `desktop/frontend/src/style.css` の既存クラス命名規則（ハイフンケース、機能名 + 要素名、slate 系カラーパレット #1e293b/#475569/#64748b/#94a3b8/#cbd5e1/#e2e8f0/#f1f5f9）を踏襲する
- **共通ボタン**: `.btn` / `.btn-primary` / `.btn-sm` を使う。新規パターンが必要なら `style.css` に追加してから使う
- **インラインスタイル最小化**: `style={{ ... }}` は最終手段。繰り返し使う見た目は class 化する
- **完了前の目視確認**: 新画面・新セクションを作ったら開発サーバーで起動して目視確認する（コミット前のチェックリストとして）。PWA は Vite dev サーバー、凍結中の Wails 版は `wails dev`

## 用語
- 区域 = 運用上の最小単位（旧称: 枝番）
- 区域親番 = 枝番の集合としての上位概念（旧称: 区域）
- 識別子形式: `領域-区域親番-区域` 例: `NRT-001-05`

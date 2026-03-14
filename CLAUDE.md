# Home Visit Suite

## 仕様書
- `docs/wants.md` に全仕様を記載済み

## 技術決定
- **管理・編集スタッフ向けアプリ**: Wails (Go + Web Frontend)
  - Go側: LinkSelf統合、ビジネスロジック、データ管理
  - Web側: 地図UI（map-polygon-editor/TypeScript）、フロントエンド全般
  - Electronは不採用（Go実装のLinkSelfにサイドカーが必要になるため）
- **活動スタッフ向けアプリ**: モバイルネイティブ（iOS/Android）- 技術選定未了
- **データインフラ**: LinkSelf（Go実装、サーバーレスP2P）
  - https://github.com/SeijiShii/link-self
- **地図**: GSIタイル（日本）、map-polygon-editor（TypeScript実装）でポリゴン編集

## 開発環境
- **コード編集・テスト**: WSL2 (Ubuntu) — Claude Code、VSCode Remote-WSL、vitest
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

## 用語
- 区域 = 運用上の最小単位（旧称: 枝番）
- 区域親番 = 枝番の集合としての上位概念（旧称: 区域）
- 識別子形式: `領域-区域親番-区域` 例: `NRT-001-05`

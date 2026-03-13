# Windows ビルド手順

WSL2 で開発し、Windows ネイティブで Wails アプリを実行する手順。

## 前提条件（Windows側）

- Go 1.21+ — https://go.dev/dl/
- Node.js 18+ — https://nodejs.org/
- Git Bash — https://git-scm.com/
- Wails CLI:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```
- 環境確認:
  ```bash
  wails doctor
  ```

## 初回セットアップ

```bash
cd /d/
git clone git@github.com:SeijiShii/home-visit-suite.git
cd home-visit-suite/desktop/frontend
npm install
cd ..
wails dev
```

## 日常の同期・実行

### WSL側（コード編集後）

```bash
git add -A && git commit -m "変更内容" && git push
```

### Windows側（Git Bash）

```bash
cd /d/home-visit-suite
git pull
cd desktop/frontend
npm install   # package.json に変更があった場合のみ
cd ..
wails dev
```

## なぜ Windows で実行するか

| 項目 | WSL2 (WSLg) | Windows ネイティブ |
|------|-------------|-------------------|
| WebView | WebKitGTK | WebView2 (Chromium) |
| IME（日本語入力） | 不可 | 正常動作 |
| 開発用途 | 英字での動作確認 | 最終確認・日本語テスト |

## 注意事項

- `\\wsl$\` パス経由で `wails dev` は不可（Go の file lock が失敗する）
- `/mnt/d/` 経由の WSL アクセスは 9p オーバーヘッドで低速（Claude Code での常用は非推奨）
- `map-polygon-editor` は GitHub 参照（`github:SeijiShii/map-polygon-editor`）。`npm install` 時に `prepare` スクリプトで自動ビルドされる

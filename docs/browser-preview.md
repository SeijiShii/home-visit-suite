# ブラウザで動作確認する

`wails dev` はネイティブウィンドウと同時にブラウザ用の URL も公開する。UI だけを手早く確認したい、DevTools を使いたい、iOS/Android 実機から LAN 経由で見たい、といった場面で利用する。

## ポート一覧

| URL | 提供元 | Go バインディング | 用途 |
|-----|--------|------------------|------|
| http://localhost:34115 | `wails dev` のブリッジ | **あり**（`window.go.*` が注入される） | ブラウザで実機と同じ動作確認 |
| http://localhost:5173  | Vite 単体（`npm run dev`） | なし | UI の見た目だけ確認（Go 呼び出しは失敗） |

> Vite のポートは 5173 がデフォルト。競合時は 5174, 5175... と自動で繰り上がるので、起動ログの `Local: http://localhost:XXXX/` を確認する。

## 使い分け

### `wails dev`（推奨）
`desktop/` で以下を実行すると、ネイティブウィンドウが開くと同時に http://localhost:34115 でもアクセス可能になる。

```bash
# WSL
./dev.sh
# Windows (Git Bash)
wails dev
```

ブラウザで http://localhost:34115 を開けば、Go 側のメソッドも呼び出せるため **実機と同じ動作** を確認できる。Chrome DevTools を使いたいときはこちら。

### `npm run dev`（UI のみ）
Go を起動せず、フロントエンドだけを素早く確認したいときに使う。

```bash
cd desktop/frontend
npm run dev
# → http://localhost:5173
```

`window.go.*` を呼ぶ処理はエラーになる。モック/スタブを挟まない限り、ログインや地図データの取得など Go 依存の機能は動かない点に注意。

## WSL ↔ Windows のポート転送

WSL2 で `wails dev` を起動した場合、Windows 側のブラウザからも `http://localhost:34115` でそのままアクセスできる（WSL2 の自動ポート転送による）。逆方向（Windows 側で起動→ WSL から見る）は通常不要だが、必要なら Windows 側 IP（`ipconfig` の WSL 用アドレス）を使う。

## トラブルシュート

- **ページが開くが真っ白**: Vite のビルドエラーが出ている可能性。起動ターミナルのログを確認する。
- **`window.go is undefined`**: http://localhost:5173 側でアクセスしている。34115 に切り替える。
- **34115 が開かない**: `wails dev` がネイティブウィンドウ起動前に失敗している。`wails doctor` で環境確認。
- **ポート競合**: 別プロセスが 34115 / 5173 を握っている。`lsof -i :34115`（WSL）/ `netstat -ano | findstr 34115`（Windows）で特定して終了させる。

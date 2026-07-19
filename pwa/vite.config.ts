import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// LinkSelf TS 実装（@linkself/core）はローカル姉妹リポジトリの TS ソースを
// alias で直接参照する（build 不要・HMR 有効。docs/wants/11 / CLAUDE.md 参照）。
// パスは pwa/ の 2 つ上（=/home/seiji）配下 link-self/ts/linkself/src を指す。
const linkselfRoot = fileURLToPath(
  new URL("../../link-self/ts/linkself", import.meta.url),
);

export default defineConfig({
  // 一時診断用のビルド時刻スタンプ（PWA の SW 更新が実機へ届いているかの確認。原因特定後に削除）
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // WSL2 では localhost フォワーディング（Windows→WSL 中継）が
  // 他プロセスの localhost 大量 LISTEN 等で空応答（ERR_EMPTY_RESPONSE）に
  // なることがある。0.0.0.0 にバインドし WSL の IP で直アクセスすれば中継を回避できる。
  server: {
    host: true, // 0.0.0.0 で待ち受け（http://<WSL_IP>:5173 で直アクセス可能）
    strictPort: true, // ポートが埋まっていたら黙って移動せずエラーにする
    fs: {
      // alias 先の @linkself/core ソースと、その node_modules（sqlite-wasm の
      // wasm / OPFS worker が実行時に fetch される）を dev サーバーが配信できるよう許可。
      allow: [fileURLToPath(new URL(".", import.meta.url)), linkselfRoot],
    },
  },
  resolve: {
    alias: {
      "@linkself/core": `${linkselfRoot}/src/index.ts`,
    },
    // libp2p / multiformats 系は @linkself/core（alias 先 = link-self の
    // node_modules）と pwa 側で二重解決されると型 identity 不一致で
    // トランスポート未検出等を招くため、pwa の単一コピーに寄せる。
    dedupe: [
      "libp2p",
      "@libp2p/interface",
      "@libp2p/crypto",
      "@libp2p/peer-id",
      "@chainsafe/libp2p-noise",
      "@chainsafe/libp2p-yamux",
      "@libp2p/websockets",
      "@libp2p/circuit-relay-v2",
      "@libp2p/identify",
      "@multiformats/multiaddr",
      "multiformats",
      // 注意: "@noble/hashes" を dedupe に入れてはならない。直依存は v1 系・
      // @noble/curves@2 内部は v2 系を要求し、メジャー 2 系統の併存が正しい状態。
      // dedupe で root の v1 に強制すると curves 内の sha512 が壊れ、ed25519 の
      // 鍵導出が "Cannot read properties of undefined (reading 'slice')" で落ちる
      // （リレー設定時の実 identity 起動で顕在化）。
      "uint8arrays",
    ],
  },
  optimizeDeps: {
    // sqlite-wasm は worker / wasm 資産の解決のため prebundle から除外する
    // （@sqlite.org/sqlite-wasm 公式ガイド）。KV のみ使う現段階でも barrel
    // 経由で参照され得るため除外しておく。
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Home Visit Suite",
        short_name: "Home Visit",
        description: "訪問活動の区域・チェックアウト・網羅管理",
        lang: "ja",
        display: "standalone",
        theme_color: "#1e293b",
        background_color: "#f1f5f9",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});

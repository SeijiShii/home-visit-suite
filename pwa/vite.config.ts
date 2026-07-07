import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // WSL2 では localhost フォワーディング（Windows→WSL 中継）が
  // 他プロセスの localhost 大量 LISTEN 等で空応答（ERR_EMPTY_RESPONSE）に
  // なることがある。0.0.0.0 にバインドし WSL の IP で直アクセスすれば中継を回避できる。
  server: {
    host: true, // 0.0.0.0 で待ち受け（http://<WSL_IP>:5173 で直アクセス可能）
    strictPort: true, // ポートが埋まっていたら黙って移動せずエラーにする
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

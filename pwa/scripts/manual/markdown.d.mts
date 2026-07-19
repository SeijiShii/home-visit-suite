// markdown.mjs（ビルドスクリプト）の型定義。テストから型付きで読み込むために置く。

export function escapeHtml(text: string): string;

export interface TokenStore {
  add(html: string, kind: "block" | "inline"): string;
  isBlockToken(text: string): boolean;
  restore(text: string): string;
}

export function createTokenStore(): TokenStore;

export function renderMarkdown(
  src: string,
  opts?: { isBlockToken?: (text: string) => boolean; where?: string },
): string;

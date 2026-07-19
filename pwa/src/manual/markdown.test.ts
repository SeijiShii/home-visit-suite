// 操作マニュアルの Markdown レンダラ（scripts/manual/markdown.mjs）の回帰テスト。
// 外部の Markdown ライブラリに依存しない代わりに、記法の解釈をここで固定する。

import { describe, expect, it } from "vitest";
import {
  createTokenStore,
  renderMarkdown,
} from "../../scripts/manual/markdown.mjs";

const render = renderMarkdown;

describe("renderMarkdown", () => {
  it("段落と見出しを変換する", () => {
    expect(render("## 見出し\n\n本文です。")).toBe(
      "<h2>見出し</h2>\n<p>本文です。</p>",
    );
  });

  it("連続行を 1 つの段落にまとめる", () => {
    expect(render("あいう\nえお")).toBe("<p>あいう えお</p>");
  });

  it("箇条書きと番号付きリストを区別する", () => {
    expect(render("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(render("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("強調・インラインコード・リンクを変換する", () => {
    expect(render("**太字**と`code`と[名前](https://example.com)")).toBe(
      '<p><strong>太字</strong>と<code>code</code>と<a href="https://example.com">名前</a></p>',
    );
  });

  it("インラインコード内の ** を強調にしない", () => {
    expect(render("`a ** b`")).toBe("<p><code>a ** b</code></p>");
  });

  it("文中の HTML はエスケープする", () => {
    expect(render("本文に <b>タグ</b> を含む")).toBe(
      "<p>本文に &lt;b&gt;タグ&lt;/b&gt; を含む</p>",
    );
  });

  it("行頭の生 HTML は意図的な埋め込みとして通す", () => {
    // 本文はリポジトリ内で管理する Markdown のみで、外部入力は流れ込まない。
    expect(render('<div class="note">補足</div>')).toBe(
      '<div class="note">補足</div>',
    );
  });

  it("GFM テーブルを変換する", () => {
    expect(render("| A | B |\n|---|---|\n| 1 | 2 |")).toBe(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead>" +
        "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
  });

  it("コードブロックを変換する", () => {
    expect(render("```ts\nconst a = 1;\n```")).toBe(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
    );
  });

  it("閉じていないコードブロックはエラーにする", () => {
    expect(() => render("```\nconst a = 1;")).toThrow(/閉じられていません/);
  });

  it("# 見出しは使わせない（ページ見出しは frontmatter の title）", () => {
    expect(() => render("# タイトル")).toThrow(/# 見出しは使えません/);
  });

  it("入れ子リストは崩れずエラーになる", () => {
    expect(() => render("- a\n  - b")).toThrow(/入れ子のリスト/);
  });
});

describe("createTokenStore", () => {
  it("ブロックトークンは段落に包まず、そのまま出力する", () => {
    const tokens = createTokenStore();
    const token = tokens.add("<figure>x</figure>", "block") as string;
    const html = tokens.restore(
      render(`本文\n\n${token}\n\n続き`, { isBlockToken: tokens.isBlockToken }),
    );
    expect(html).toBe("<p>本文</p>\n<figure>x</figure>\n<p>続き</p>");
  });

  it("インライントークンは段落の中でエスケープされずに戻る", () => {
    const tokens = createTokenStore();
    const token = tokens.add('<a href="#/manual/x">X</a>', "inline") as string;
    const html = tokens.restore(
      render(`詳しくは ${token} を参照`, { isBlockToken: tokens.isBlockToken }),
    );
    expect(html).toBe('<p>詳しくは <a href="#/manual/x">X</a> を参照</p>');
  });
});

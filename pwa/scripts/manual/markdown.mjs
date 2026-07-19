// 操作マニュアル用の Markdown レンダラ（docs/wants/12_操作マニュアル.md）。
//
// 外部依存を持たない代わりに、扱える記法を意図的に絞った「厳格な」実装にしている。
// 解釈できない書き方は黙って崩れず例外になるため、生成時に気付ける。
// 対応: 見出し(## ###) / 段落 / 箇条書き(- ) / 番号付き(1. ) / GFM テーブル /
//       コードブロック(```) / 引用(> ) / 水平線(---) / 生 HTML ブロック /
//       インライン: **強調** `コード` [文字列](URL)
//
// 動作確認は pwa/src/manual/markdown.test.ts。

/** 置換トークンの目印（本文には現れない制御文字を使う）。 */
const TOKEN = "\u0000";

export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 既に HTML になっている断片をトークン化して、以降のエスケープから守る。 */
export function createTokenStore() {
  const values = [];
  return {
    /** @param {string} html @param {"block"|"inline"} kind */
    add(html, kind) {
      values.push({ html, kind });
      return `${TOKEN}${values.length - 1}${TOKEN}`;
    },
    isBlockToken(text) {
      const m = new RegExp(`^${TOKEN}(\\d+)${TOKEN}$`).exec(text.trim());
      return m ? values[Number(m[1])].kind === "block" : false;
    },
    restore(text) {
      return text.replace(
        new RegExp(`${TOKEN}(\\d+)${TOKEN}`, "g"),
        (_m, i) => values[Number(i)].html,
      );
    },
  };
}

function renderInline(text) {
  let out = escapeHtml(text);
  // コードは他の記法より先に確定させる（`**` を含んでも強調にしない）
  const CODE_TOKEN = "\u0001";
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(code);
    return `${CODE_TOKEN}${codes.length - 1}${CODE_TOKEN}`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, href) => `<a href="${href}">${label}</a>`,
  );
  out = out.replace(new RegExp(`${CODE_TOKEN}(\\d+)${CODE_TOKEN}`, "g"), (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((c) => `<th>${renderInline(c)}</th>`).join("");
  const trs = body
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/**
 * Markdown を HTML 文字列にする。
 * @param {string} src
 * @param {{ isBlockToken?: (text: string) => boolean, where?: string }} [opts]
 */
export function renderMarkdown(src, opts = {}) {
  const isBlockToken = opts.isBlockToken ?? (() => false);
  const where = opts.where ? `${opts.where}: ` : "";
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    // 生 HTML ブロック・ブロックトークン（図版など）はそのまま通す
    if (isBlockToken(trimmed)) {
      out.push(trimmed);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("<")) {
      out.push(trimmed);
      i += 1;
      continue;
    }

    // コードブロック
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i >= lines.length) {
        throw new Error(`${where}コードブロックが \`\`\` で閉じられていません`);
      }
      i += 1;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // 水平線
    if (/^-{3,}$/.test(trimmed)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    // 見出し
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) {
        throw new Error(
          `${where}# 見出しは使えません（ページ見出しは frontmatter の title が担当します）: ${trimmed}`,
        );
      }
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // テーブル
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[i + 1].trim())
    ) {
      const rows = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(rows));
      continue;
    }

    // 引用
    if (trimmed.startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        buf.push(lines[i].trim().slice(2));
        i += 1;
      }
      out.push(`<blockquote><p>${renderInline(buf.join(" "))}</p></blockquote>`);
      continue;
    }

    // 箇条書き / 番号付きリスト
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      const pattern = bullet ? /^[-*]\s+(.*)$/ : /^\d+\.\s+(.*)$/;
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur.trim() === "") break;
        if (/^\s+\S/.test(cur) && items.length) {
          // 継続行（インデント）は直前の項目に連結する。入れ子リストは非対応。
          if (pattern.test(cur.trim())) {
            throw new Error(
              `${where}入れ子のリストには対応していません: ${cur.trim()}`,
            );
          }
          items[items.length - 1] += ` ${cur.trim()}`;
          i += 1;
          continue;
        }
        const m = pattern.exec(cur.trim());
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      out.push(
        `<${tag}>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</${tag}>`,
      );
      continue;
    }

    // 段落（空行まで）
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const cur = lines[i].trim();
      if (
        cur.startsWith("<") ||
        cur.startsWith("```") ||
        /^#{1,6}\s/.test(cur) ||
        /^[-*]\s/.test(cur) ||
        /^\d+\.\s/.test(cur) ||
        isBlockToken(cur)
      ) {
        break;
      }
      buf.push(cur);
      i += 1;
    }
    out.push(`<p>${renderInline(buf.join(" "))}</p>`);
  }

  return out.join("\n");
}

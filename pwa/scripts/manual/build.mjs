// 操作マニュアルの生成パイプライン（docs/wants/12_操作マニュアル.md）。
//
// docs/manual/<locale>/*.md（Markdown + frontmatter）を読み、
// pwa/src/manual/generated/manual-data.ts を生成する。生成物には
//   - 全ページの `id` から作った ManualTopic union 型（リンク切れを tsc で落とすため）
//   - 本文の HTML・ルート対応表・stale 判定
// が含まれる。
//
// 使い方:
//   node scripts/manual/build.mjs          生成する
//   node scripts/manual/build.mjs --seal   sources の現在値で digest を固定し直す（stale 解消）

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTokenStore, escapeHtml, renderMarkdown } from "./markdown.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");
export const MANUAL_DIR = join(REPO_ROOT, "docs", "manual");
export const SHOTS_DIR = join(REPO_ROOT, "pwa", "public", "manual", "shots");
const OUT_FILE = join(
  REPO_ROOT,
  "pwa",
  "src",
  "manual",
  "generated",
  "manual-data.ts",
);

/** 執筆言語（他ロケール未訳時のフォールバック先）。 */
export const BASE_LOCALE = "ja";

// ---------------------------------------------------------------- frontmatter

function splitFrontmatter(raw, rel) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) throw new Error(`${rel}: frontmatter（--- で囲むメタ情報）がありません`);
  return { yaml: m[1], body: raw.slice(m[0].length) };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * frontmatter の YAML サブセット（`key: value` と `key:` + `- item` のみ）を解釈する。
 * 汎用 YAML は受け付けない代わりに、書き方の揺れを早期にエラーとして弾く。
 */
function parseFrontmatter(yaml, rel) {
  const out = {};
  let listKey = null;
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      if (!listKey) throw new Error(`${rel}: リスト項目に対応するキーがありません: ${line}`);
      out[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${rel}: frontmatter を解釈できません: ${line}`);
    const [, key, value] = kv;
    if (value.trim() === "") {
      out[key] = [];
      listKey = key;
    } else {
      out[key] = unquote(value);
      listKey = null;
    }
  }
  return out;
}

// -------------------------------------------------------------------- digest

/**
 * sources に挙げたファイル群の内容ハッシュ。実装や仕様が変わるとこの値がずれ、
 * 「そのマニュアルページは古いかもしれない」という機械的なフラグになる。
 */
export function computeDigest(sources) {
  const h = createHash("sha256");
  for (const rel of [...sources].sort()) {
    const abs = join(REPO_ROOT, rel);
    h.update(`${rel}\0`);
    h.update(existsSync(abs) ? readFileSync(abs) : Buffer.from("<missing>"));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

// --------------------------------------------------------------------- 読み込み

function listLocales() {
  if (!existsSync(MANUAL_DIR)) return [];
  return readdirSync(MANUAL_DIR)
    .filter((name) => statSync(join(MANUAL_DIR, name)).isDirectory())
    .filter((name) => name !== "assets")
    .sort();
}

/** docs/manual 配下を読んでページのメタ情報＋本文（未レンダリング）を返す。 */
export function loadPages() {
  const pages = [];
  for (const locale of listLocales()) {
    const dir = join(MANUAL_DIR, locale);
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const file of files) {
      const rel = `docs/manual/${locale}/${file}`;
      const raw = readFileSync(join(dir, file), "utf8");
      const { yaml, body } = splitFrontmatter(raw, rel);
      const fm = parseFrontmatter(yaml, rel);
      for (const required of ["id", "title"]) {
        if (typeof fm[required] !== "string" || !fm[required]) {
          throw new Error(`${rel}: frontmatter の必須項目 "${required}" がありません`);
        }
      }
      const sources = Array.isArray(fm.sources) ? fm.sources : [];
      pages.push({
        locale,
        file,
        rel,
        absPath: join(dir, file),
        id: fm.id,
        title: fm.title,
        route: typeof fm.route === "string" && fm.route ? fm.route : null,
        status: fm.status === "published" ? "published" : "draft",
        sources,
        digest: typeof fm.digest === "string" ? fm.digest : "",
        currentDigest: computeDigest(sources),
        body,
      });
    }
  }

  for (const locale of listLocales()) {
    const seen = new Map();
    for (const p of pages.filter((x) => x.locale === locale)) {
      if (seen.has(p.id)) {
        throw new Error(
          `トピック ID "${p.id}" が重複しています: ${seen.get(p.id)} と ${p.rel}`,
        );
      }
      seen.set(p.id, p.rel);
    }
  }
  return pages;
}

// ------------------------------------------------------------------ レンダリング

const SHOT_LINE = /^\{\{shot:([a-z0-9-]+)(?:\|(.*))?\}\}$/;
const SHOT_ANY = /\{\{shot:/;
const TOPIC_REF = /\{\{topic:([a-z0-9-]+)\}\}/g;
const ROUTE_REF = /\{\{route:([^}]+)\}\}/g;

/**
 * 本文の特殊記法を HTML に展開する。参照先が存在しないトピックはここでエラーにし、
 * 「マニュアル内のリンク切れ」をビルド時に落とす。
 */
export function renderBody(page, titleById, shotIds) {
  const missingShots = [];
  const usedShots = [];
  // 特殊記法は先に HTML 化してトークンに退避し、Markdown 側のエスケープから守る。
  const tokens = createTokenStore();

  const lines = page.body.split(/\r?\n/).map((line) => {
    const shot = SHOT_LINE.exec(line.trim());
    if (shot) {
      const [, id, rawCaption] = shot;
      const caption = (rawCaption ?? "").trim();
      const figcaption = caption
        ? `<figcaption>${escapeHtml(caption)}</figcaption>`
        : "";
      usedShots.push(id);
      if (!shotIds.has(id)) {
        // 未撮影でも本文は壊さず、撮影すれば自動で実画像に入れ替わる
        missingShots.push(id);
        return tokens.add(
          `<figure class="manual-shot manual-shot-missing"><div class="manual-shot-placeholder">${escapeHtml(
            id,
          )}</div>${figcaption}</figure>`,
          "block",
        );
      }
      return tokens.add(
        `<figure class="manual-shot"><img src="/manual/shots/${id}.png" alt="${escapeHtml(
          caption || page.title,
        )}" loading="lazy" />${figcaption}</figure>`,
        "block",
      );
    }
    if (SHOT_ANY.test(line)) {
      throw new Error(
        `${page.rel}: {{shot:...}} は行頭に単独で置いてください（見つかった行: ${line.trim()}）`,
      );
    }
    return line;
  });

  let text = lines.join("\n");

  text = text.replace(TOPIC_REF, (_m, id) => {
    const title = titleById.get(id);
    if (!title) {
      throw new Error(
        `${page.rel}: {{topic:${id}}} の参照先マニュアルページが存在しません`,
      );
    }
    return tokens.add(
      `<a class="manual-inline-link" href="#/manual/${id}">${escapeHtml(title)}</a>`,
      "inline",
    );
  });

  text = text.replace(ROUTE_REF, (_m, route) =>
    tokens.add(
      `<code class="manual-route">${escapeHtml(route.trim())}</code>`,
      "inline",
    ),
  );

  const html = tokens.restore(
    renderMarkdown(text, {
      isBlockToken: tokens.isBlockToken,
      where: page.rel,
    }),
  );
  return { html, missingShots, usedShots };
}

function listShotIds() {
  if (!existsSync(SHOTS_DIR)) return new Set();
  return new Set(
    readdirSync(SHOTS_DIR)
      .filter((name) => name.endsWith(".png"))
      .map((name) => name.slice(0, -4)),
  );
}

// ------------------------------------------------------------------------ 生成

/** ページ群を解析して生成用データにまとめる（check スクリプトからも使う）。 */
export function analyze() {
  const pages = loadPages();
  const shotIds = listShotIds();
  const titleById = new Map();
  for (const p of pages) {
    if (p.locale === BASE_LOCALE) titleById.set(p.id, p.title);
  }
  // 基準ロケールに無い ID を他ロケールが持つ場合も相互リンクを解決できるようにする。
  for (const p of pages) if (!titleById.has(p.id)) titleById.set(p.id, p.title);

  const rendered = pages.map((p) => ({
    ...p,
    ...renderBody(p, titleById, shotIds),
    stale: p.digest !== "" && p.digest !== p.currentDigest,
    unsealed: p.digest === "",
  }));
  return { pages: rendered, shotIds, titleById };
}

function generateSource({ pages }) {
  const base = pages.filter((p) => p.locale === BASE_LOCALE);
  const ids = [...new Set(pages.map((p) => p.id))].sort();
  const union = ids.length
    ? ids.map((id) => JSON.stringify(id)).join(" | ")
    : "never";

  const byLocale = {};
  for (const p of pages) {
    (byLocale[p.locale] ??= []).push(p);
  }

  const pageLiteral = (p) =>
    `    ${JSON.stringify(p.id)}: {\n` +
    `      id: ${JSON.stringify(p.id)},\n` +
    `      title: ${JSON.stringify(p.title)},\n` +
    `      route: ${p.route === null ? "null" : JSON.stringify(p.route)},\n` +
    `      status: ${JSON.stringify(p.status)},\n` +
    `      stale: ${p.stale || p.unsealed},\n` +
    `      html: ${JSON.stringify(p.html)},\n` +
    `    },`;

  const localeBlocks = Object.entries(byLocale)
    .map(
      ([locale, list]) =>
        `  ${JSON.stringify(locale)}: {\n${list.map(pageLiteral).join("\n")}\n  },`,
    )
    .join("\n");

  const routes = base
    .filter((p) => p.route)
    .map((p) => `  [${JSON.stringify(p.route)}, ${JSON.stringify(p.id)}],`)
    .join("\n");

  const order = base.map((p) => `  ${JSON.stringify(p.id)},`).join("\n");

  return `// 自動生成ファイル — 直接編集しない。
// 生成元: docs/manual/**/*.md / 生成スクリプト: pwa/scripts/manual/build.mjs
// 仕様: docs/wants/12_操作マニュアル.md

/** マニュアルのトピック ID。ページを消すとここから消え、参照側が tsc で落ちる。 */
export type ManualTopic = ${union};

export interface ManualPageData {
  id: ManualTopic;
  title: string;
  /** 対応するアプリのルート（無ければ null） */
  route: string | null;
  status: "draft" | "published";
  /** sources の変更後に本文が更新されていない可能性がある */
  stale: boolean;
  html: string;
}

/** 執筆言語。未訳ロケールはここへフォールバックする。 */
export const MANUAL_BASE_LOCALE = ${JSON.stringify(BASE_LOCALE)};

/** 目次の並び順（ファイル名順）。 */
export const MANUAL_ORDER: readonly ManualTopic[] = [
${order}
];

/** ルート → トピックの対応（":param" はワイルドカードとして照合する）。 */
export const MANUAL_ROUTE_TOPICS: readonly (readonly [string, ManualTopic])[] = [
${routes}
];

export const MANUAL_PAGES: Record<string, Partial<Record<ManualTopic, ManualPageData>>> = {
${localeBlocks}
};
`;
}

export function buildManual({ seal = false, quiet = false } = {}) {
  const result = analyze();

  if (seal) {
    for (const p of result.pages) {
      if (p.digest === p.currentDigest) continue;
      const raw = readFileSync(p.absPath, "utf8");
      const updated = raw.includes("\ndigest:")
        ? raw.replace(/\ndigest:[^\n]*/, `\ndigest: ${p.currentDigest}`)
        : raw.replace(/\n---/, `\ndigest: ${p.currentDigest}\n---`);
      writeFileSync(p.absPath, updated);
      p.digest = p.currentDigest;
      p.stale = false;
      p.unsealed = false;
    }
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const source = generateSource(result);
  const previous = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
  if (previous !== source) writeFileSync(OUT_FILE, source);

  const missing = result.pages.flatMap((p) => p.missingShots);
  if (!quiet && missing.length) {
    console.warn(
      `ⓘ マニュアル: スクリーンショット未撮影 ${missing.length} 件（npm run manual:shots）: ${[
        ...new Set(missing),
      ].join(", ")}`,
    );
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const seal = process.argv.includes("--seal");
    const result = buildManual({ seal });
    const label = seal ? "生成 + digest 固定" : "生成";
    console.log(`✔ マニュアル${label}: ${result.pages.length} ページ`);
  } catch (err) {
    console.error(`✖ マニュアル生成に失敗: ${err.message}`);
    process.exit(1);
  }
}

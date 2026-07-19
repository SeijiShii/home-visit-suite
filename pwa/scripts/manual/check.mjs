// 操作マニュアルの健全性検査（docs/wants/12_操作マニュアル.md）。
//
//   node scripts/manual/check.mjs            エラーがあれば exit 1（警告は通す）
//   node scripts/manual/check.mjs --strict   警告もエラー扱いにする
//
// 「どのページを直せばよいか」を人が探さずに済むようにするのが目的。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, REPO_ROOT, SHOTS_DIR } from "./build.mjs";

const APP_FILE = join(REPO_ROOT, "pwa", "src", "App.tsx");

/**
 * マニュアルページを持たなくてよいルート。
 * リダイレクト専用・マニュアル自身・ゲート画面など、利用者が「操作を調べる」対象でないもの。
 */
const ROUTES_WITHOUT_MANUAL = new Set([
  "/map/area/:areaId/detail", // 旧 URL のリダイレクト専用
  "/manual",
  "/manual/:topic",
]);

/** App.tsx に定義されている画面ルートを拾う。 */
function appRoutes() {
  if (!existsSync(APP_FILE)) return [];
  const src = readFileSync(APP_FILE, "utf8");
  const routes = new Set();
  if (/<Route\s+index\b/.test(src)) routes.add("/");
  for (const m of src.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)) {
    routes.add(m[1]);
  }
  return [...routes].sort();
}

/**
 * `--impact <変更ファイル...>`: 変更されたファイルを sources に持つマニュアルページを挙げる。
 * pre-commit フックが「今の変更でどのマニュアルが古くなり得るか」を提示するために使う。
 */
function reportImpact(changed) {
  const result = analyze();
  const changedSet = new Set(changed);
  const affected = result.pages.filter((p) =>
    p.sources.some((s) => changedSet.has(s)),
  );
  for (const p of affected) {
    const hits = p.sources.filter((s) => changedSet.has(s));
    console.error(`  - ${p.rel}（変更: ${hits.join(", ")}）`);
  }
  process.exit(affected.length ? 1 : 0);
}

function main() {
  const errors = [];
  const warnings = [];

  let result;
  try {
    result = analyze();
  } catch (err) {
    // frontmatter 不正・ID 重複・{{topic:}} のリンク切れはここで落ちる
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  const { pages } = result;
  const basePages = pages.filter((p) => p.locale === "ja");
  const routes = appRoutes();
  const knownRoutes = new Set(routes);

  for (const p of pages) {
    for (const rel of p.sources) {
      if (!existsSync(join(REPO_ROOT, rel))) {
        errors.push(
          `${p.rel}: sources のパスが存在しません: ${rel}（削除/改名されたなら sources を直す）`,
        );
      }
    }
    for (const m of p.body.matchAll(/\{\{route:([^}]+)\}\}/g)) {
      const route = m[1].trim();
      if (!knownRoutes.has(route)) {
        errors.push(
          `${p.rel}: {{route:${route}}} は App.tsx に存在しないルートです`,
        );
      }
    }
    if (p.unsealed) {
      warnings.push(`${p.rel}: digest が未設定です（npm run manual:seal）`);
    } else if (p.stale) {
      warnings.push(
        `${p.rel}: sources が変更されています。本文を見直してください（${p.sources.join(", ")}）`,
      );
    }
    if (p.status === "draft") {
      warnings.push(`${p.rel}: 本文が未執筆です（status: draft）`);
    }
    for (const id of [...new Set(p.missingShots)]) {
      warnings.push(`${p.rel}: スクリーンショット未撮影: ${id}`);
    }
  }

  const coveredRoutes = new Set(
    basePages.map((p) => p.route).filter((r) => r !== null),
  );
  for (const route of routes) {
    if (ROUTES_WITHOUT_MANUAL.has(route)) continue;
    if (!coveredRoutes.has(route)) {
      warnings.push(
        `ルート ${route} に対応するマニュアルページがありません（docs/manual/ja/ に追加）`,
      );
    }
  }

  const usedShots = new Set(pages.flatMap((p) => p.usedShots));
  if (existsSync(SHOTS_DIR)) {
    for (const name of readdirSync(SHOTS_DIR)) {
      if (!name.endsWith(".png")) continue;
      const id = name.slice(0, -4);
      if (!usedShots.has(id)) {
        warnings.push(`孤児スクリーンショット: pwa/public/manual/shots/${name}`);
      }
    }
  }

  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);

  const strict = process.argv.includes("--strict");
  if (errors.length || (strict && warnings.length)) {
    console.error(
      `\nマニュアル検査: エラー ${errors.length} 件 / 警告 ${warnings.length} 件`,
    );
    process.exit(1);
  }
  console.log(
    `✔ マニュアル検査: ${basePages.length} ページ・エラーなし（警告 ${warnings.length} 件）`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const impactAt = process.argv.indexOf("--impact");
  if (impactAt !== -1) {
    reportImpact(process.argv.slice(impactAt + 1));
  } else {
    main();
  }
}

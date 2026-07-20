// 操作マニュアルのスクリーンショット撮影（docs/wants/12_操作マニュアル.md）。
//
// 使い方:
//   npm run manual:shots              全ショットを撮影
//   npm run manual:shots -- --only map-overview,map-drawing
//   npm run manual:shots -- --headed  ブラウザを表示して挙動を目視する
//
// 前提: Google Maps の API キーの HTTP リファラ許可リストに
// http://localhost:5199/* が入っていること（入っていないと地図だけ白抜けになる。
// waitForMapTiles がそれを検知して撮影を失敗させる）。
//
// dev サーバーは本スクリプトが専用ポートで起動する（BASE_URL を渡した場合はそちらを使う）。
// 専用サーバーは **VITE_LINKSELF=0** で起動する。理由は 2 つ:
//   1. デモデータが localStorage のリポジトリへ直接効く（LinkSelf 有効時は SQL 側が正で、
//      「SQL が空なら旧 localStorage から移行」という間接経路に頼ることになり、移行対象外の
//      テーブルが無言で空のまま撮れてしまう）
//   2. グループ未接続でも「フィードバックを送る」フォームが出る（LinkSelf 有効かつ
//      ネットワーク未確立だと「現在送信できる宛先がありません」になり、本文が説明する
//      フォームの図が撮れない）
//
// 設計上の注意:
// デモデータは localStorage へ直接書く（seed.mjs）。アプリの保存形式が変わると
// 「空の画面を無言で撮る」という最悪の失敗をするため、各ショットの expect には
// **デモデータ由来の文言**を置く。画面に常にある固定文言（見出しやナビ項目）を
// expect にすると、中身が空でも通ってしまい検知の意味がなくなる。

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeedEntries, SEED_FIXTURES as F } from "./seed.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PWA_DIR = join(HERE, "..", "..");
const SHOTS_DIR = join(PWA_DIR, "public", "manual", "shots");
const SHOT_PORT = 5199;
const EXTERNAL_BASE_URL = process.env.BASE_URL ?? null;

/** 画面幅。地図・領域管理は狭い端末で非表示になるため広めに固定する。 */
const VIEWPORT = { width: 1440, height: 900 };

const argv = process.argv.slice(2);
const HEADED = argv.includes("--headed");
const ONLY = (() => {
  const i = argv.indexOf("--only");
  if (i === -1) return null;
  return new Set((argv[i + 1] ?? "").split(",").filter(Boolean));
})();

/** 指定ミリ秒待つ（地図タイル・アニメーションの落ち着き待ち）。 */
const settle = (page, ms = 600) => page.waitForTimeout(ms);

/**
 * 撮影対象の宣言的リスト。画面を足したらここに 1 エントリ足す。
 * - id: {{shot:...}} のトピック ID かつ出力ファイル名
 * - path: ハッシュルート（HashRouter のため "#" が要る）
 * - expect: 撮影前に表示を確認する文言。**デモデータ由来のものにする**
 * - seed: "full"（既定）= デモデータ一式 / "terms" = 同意のみ（オンボーディング用）
 * - element: 指定するとその要素だけを撮る（ページ内の特定セクションを指す図）
 * - prepare: 撮影前の操作
 */
const SHOTS = [
  {
    // 同意だけ済ませた直後の状態。identity を入れないとこの画面に来ない。
    // この画面はデータを持たないので、例外的に UI 文言で判定する。
    id: "onboarding-choose",
    path: "#/",
    seed: "terms",
    expect: "新しく ID を作成する",
  },
  {
    id: "dashboard-overview",
    path: "#/",
    expect: F.areaLabel,
  },
  {
    id: "map-overview",
    path: "#/map",
    expect: F.regionRow,
    async prepare(page) {
      await settle(page, 1200);
      await focusSeededArea(page);
    },
  },
  {
    id: "map-drawing",
    path: "#/map",
    expect: F.regionRow,
    async prepare(page) {
      await settle(page, 1200);
      await focusSeededArea(page);
      await page.locator(".sidebar-tabs").getByText("ポリゴン").click();
      await page.getByRole("button", { name: "描画開始" }).click();
      await settle(page);
    },
  },
  {
    id: "map-link-area",
    path: "#/map",
    expect: F.regionRow,
    async prepare(page) {
      await settle(page, 1200);
      await focusSeededArea(page);
      await page.locator(".sidebar-tabs").getByText("ポリゴン").click();
      await page.getByRole("button", { name: "区域と紐づけ" }).first().click();
      // 区域の行まで開いて撮る（区域親番までのツリーでは「区域を選ぶ」
      // という説明の図にならない）
      const toggles = page.locator(".area-picker-toggle");
      for (let i = 0; i < 2; i++) {
        const t = toggles.nth(i);
        if ((await t.innerText()).includes("▶")) await t.click();
        await settle(page, 200);
      }
    },
  },
  {
    id: "areas-list",
    path: "#/areas",
    expect: F.parentAreaName,
    async prepare(page) {
      // 区域親番を開いて配下の区域まで見せる
      await page.getByText(F.parentAreaName).first().click();
      await settle(page);
    },
  },
  {
    id: "areas-invite-dialog",
    path: "#/areas",
    expect: F.parentAreaName,
    async prepare(page) {
      // 招待ボタンは区域親番を開かないと現れない
      await page.getByText(F.parentAreaName).first().click();
      await settle(page);
      await page.getByRole("button", { name: "招待" }).first().click();
      await settle(page);
    },
  },
  {
    id: "visits-overview",
    path: "#/visits/ar-001-01",
    expect: F.areaLabel,
    prepare: (page) => settle(page, 1200),
  },
  {
    id: "visits-building-dialog",
    path: "#/visits/ar-001-01",
    expect: F.areaLabel,
    async prepare(page) {
      await settle(page, 1200);
      // 本文（40-visits.md）は「地図上の集合住宅のアイコンを押すと開く」と
      // 説明している。一覧の行を押すと別物（行内の展開）になるので、
      // 必ず地図上のマーカーを押す。
      await clickMapMarker(page, F.buildingBadge);
    },
  },
  {
    id: "regions-tree",
    path: "#/regions",
    expect: F.regionName,
  },
  {
    id: "users-list",
    path: "#/users",
    expect: F.memberName,
  },
  {
    id: "requests-list",
    path: "#/requests",
    expect: F.requestBody,
  },
  {
    // 本文の図は「宛先・種別・内容を入力して送るフォーム」。宛先が 1 つも
    // 使えないとフォーム自体が出ないため、その状態で撮っていないことを
    // 「グループ管理者」（宛先の選択肢）の存在で担保する。
    id: "feedback-form",
    path: "#/feedback",
    expect: "グループ管理者",
    element: ".settings-section",
  },
  {
    // 本文の図は「管理者だけに表示される受信フィードバックの一覧」。
    // シードした本文が見えることを条件にする（空一覧を撮らない）。
    id: "feedback-inbox",
    path: "#/feedback",
    expect: F.feedbackBody,
    element: ".settings-section:last-of-type",
  },
  {
    id: "settings-overview",
    path: "#/settings",
    expect: F.selfName,
  },
  {
    id: "settings-add-device",
    path: "#/settings",
    expect: F.selfName,
    async prepare(page) {
      await page.getByRole("button", { name: /端末を追加/ }).click();
      await settle(page);
    },
  },
];

/**
 * 地図上の場所マーカーを通し番号で押す。
 * Leaflet のマーカーは locator.click() では押せない（アイコン要素の
 * bounding box が 0 だったり、pointer-events を受けない）ため、座標を取って
 * 実マウスイベントを送る。
 */
async function clickMapMarker(page, badgeText) {
  const texts = page.locator(".place-number-badge-text");
  const n = await texts.count();
  for (let i = 0; i < n; i++) {
    const el = texts.nth(i);
    if ((await el.innerText()).trim() !== badgeText) continue;
    const box = await el.boundingBox();
    if (!box) break;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await settle(page, 900);
    return;
  }
  throw new Error(`地図マーカー ${badgeText} が見つかりません`);
}

/**
 * 画面に出ているヒントの吹き出しを閉じる。
 * 数秒おきに次のヒントが出るため、出なくなるまで繰り返す。撮影直前に呼ぶこと
 * （早く呼ぶと、その後に出たヒントが図に写り込む）。
 */
async function dismissTips(page) {
  for (let round = 0; round < 8; round++) {
    const links = page.getByText("このメッセージを表示しない");
    if ((await links.count()) === 0) {
      await settle(page, 900);
      if ((await links.count()) === 0) return;
    }
    for (let i = 0; i < (await links.count()); i++) {
      await links
        .first()
        .click()
        .catch(() => {});
      await settle(page, 150);
    }
  }
}

/**
 * 地図タイルが実際に描画されるまで待つ。
 *
 * 固定時間の待ちでは足りないことがある（撮影用サーバーは起動直後で Vite の
 * 変換キャッシュが冷たく、networkidle が地図の初期化前に発火する）。タイルが
 * 無いまま撮ると、ポリゴンだけが白地に浮いた図になり、しかも文言アサートは
 * 通ってしまうため無言で壊れた図が残る。実際にそれを一度出しているので、
 * 枚数が増えなくなるまで待ち、1 枚も来なければ撮影を失敗させる。
 */
async function waitForMapTiles(page) {
  const tiles = page.locator(".leaflet-tile-loaded");
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await tiles.count();
    if (n > 0 && n === last) {
      if (++stable >= 3) return;
    } else {
      stable = 0;
    }
    last = n;
    await settle(page, 400);
  }
  if ((await tiles.count()) === 0) {
    throw new Error(
      "地図タイルが読み込まれませんでした" +
        `（Google Maps の API キーは HTTP リファラ制限があり、撮影用の ` +
        `localhost:${SHOT_PORT} が許可されていない可能性が高い。` +
        "ブラウザのコンソールに RefererNotAllowedMapError が出ていれば、" +
        `Google Cloud Console でキーの許可リストに http://localhost:${SHOT_PORT}/* を追加する）`,
    );
  }
}

/** 区域ツリーを領域→区域親番→区域まで開く（畳んだ図は説明にならない）。 */
async function expandAreaTree(page) {
  for (let depth = 0; depth < 2; depth++) {
    const toggles = page.locator(".tree-toggle");
    const n = await toggles.count();
    for (let i = 0; i < n; i++) {
      const t = toggles.nth(i);
      if ((await t.innerText()).trim() === "▶") await t.click();
    }
    await settle(page, 200);
  }
}

/**
 * 区域ツリーを開き、先頭の区域を選んで地図をそこへ寄せる。
 * これをしないと地図は初期位置のままで、シードしたポリゴンが画面外になり
 * 「地図だけ写った意味のない図」になる。
 */
async function focusSeededArea(page) {
  await dismissTips(page);
  await expandAreaTree(page);
  await page.locator(".tree-row-area, .tree-leaf").first().click();
  await settle(page, 1200);
}

/** 起動前に localStorage を仕込む init script を組み立てる。 */
function seedScript(mode) {
  const all = buildSeedEntries();
  const data =
    mode === "terms"
      ? { "hvs.termsAcceptedVersion": all["hvs.termsAcceptedVersion"] }
      : all;
  return `(() => {
    try { localStorage.clear(); } catch (e) { return; }
    const data = ${JSON.stringify(data)};
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  })();`;
}

async function capture(browser, baseUrl, shot) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    // deviceScaleFactor: 2 にすると Chromium の HiDPI 合成バグで、ボタンの
    // 文字が画面左端に二重に描かれる（DOM 上の位置は正しい）。図の正確さを
    // 優先して等倍で撮る。
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  try {
    if (shot.seed !== false) {
      await context.addInitScript(seedScript(shot.seed ?? "full"));
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));

    await page.goto(`${baseUrl}/${shot.path}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 形式ドリフト検知: 想定の文言が出ないなら撮らずに失敗させる。
    const probe =
      shot.expect instanceof RegExp
        ? page.getByText(shot.expect).first()
        : page.getByText(shot.expect, { exact: false }).first();
    await probe.waitFor({ state: "visible", timeout: 15000 });

    if (shot.prepare) await shot.prepare(page);

    // 地図を含む画面はタイルの描画完了まで待つ（ショットごとの指定は不要）。
    if ((await page.locator(".leaflet-container").count()) > 0) {
      await waitForMapTiles(page);
    }

    // フォント読み込み前に撮ると文字が抜けた画像になる（DOM には文言があるので
    // アサートは通ってしまい、静かに壊れた図が残る）。必ず待つ。
    await page.evaluate(() => document.fonts.ready);
    // ヒントは待っている間にも出るため、撮る直前にもう一度払う。
    await dismissTips(page);
    await settle(page, 300);

    const target = shot.element ? page.locator(shot.element).first() : page;
    await target.screenshot({
      path: join(SHOTS_DIR, `${shot.id}.png`),
      animations: "disabled",
    });
    return { id: shot.id, ok: true, errors };
  } catch (e) {
    return { id: shot.id, ok: false, error: String(e.message).split("\n")[0] };
  } finally {
    await context.close();
  }
}

/** 撮影専用の dev サーバーを起動する（VITE_LINKSELF=0）。 */
async function startShotServer() {
  const proc = spawn(
    "npx",
    ["vite", "--port", String(SHOT_PORT), "--strictPort"],
    {
      cwd: PWA_DIR,
      env: { ...process.env, VITE_LINKSELF: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      // npx は vite を孫プロセスとして起こす。npx だけを kill すると vite が
      // 生き残ってポートを掴んだままになり、開いたパイプで本プロセスの
      // イベントループも終わらない。プロセスグループごと落とせるようにする。
      detached: true,
    },
  );
  const log = [];
  proc.stdout.on("data", (d) => log.push(String(d)));
  proc.stderr.on("data", (d) => log.push(String(d)));

  const url = `http://localhost:${SHOT_PORT}`;
  for (let i = 0; i < 60; i++) {
    if (proc.exitCode != null) {
      throw new Error(`撮影用サーバーが起動しませんでした:\n${log.join("")}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return { url, stop: () => stopTree(proc) };
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stopTree(proc);
  throw new Error(
    `撮影用サーバーが 30 秒以内に応答しませんでした:\n${log.join("")}`,
  );
}

/** 起動した dev サーバーをプロセスグループごと停止する。 */
function stopTree(proc) {
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    // すでに終了している場合など
    try {
      proc.kill("SIGTERM");
    } catch {
      // 何もできることはない
    }
  }
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });

  const targets = ONLY ? SHOTS.filter((s) => ONLY.has(s.id)) : SHOTS;
  if (targets.length === 0) {
    console.error("撮影対象がありません（--only の指定を確認してください）");
    process.exit(1);
  }

  let baseUrl = EXTERNAL_BASE_URL;
  let stopServer = () => {};
  if (baseUrl) {
    console.log(`外部サーバーを使用: ${baseUrl}`);
  } else {
    const server = await startShotServer();
    baseUrl = server.url;
    stopServer = server.stop;
    console.log(`撮影用サーバー起動: ${baseUrl}（VITE_LINKSELF=0）`);
  }

  const browser = await chromium.launch({ headless: !HEADED });
  const results = [];
  // 起動直後の Vite は変換キャッシュが冷たく、初回ページだけ極端に遅い。
  // 1 回空読みして温めておく（撮影中の待ち時間のばらつきを減らす）。
  {
    const warm = await browser.newPage();
    await warm.goto(`${baseUrl}/`, { waitUntil: "networkidle" }).catch(() => {});
    await warm.close();
  }
  try {
    for (const shot of targets) {
      const r = await capture(browser, baseUrl, shot);
      results.push(r);
      console.log(r.ok ? `  ✓ ${r.id}` : `  ✗ ${r.id}  ${r.error}`);
      if (r.ok && r.errors?.length) {
        for (const m of r.errors) console.log(`      (page error) ${m}`);
      }
    }
  } finally {
    await browser.close();
    stopServer();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n撮影 ${results.length - failed.length}/${results.length} 件成功`,
  );
  // 子プロセスのパイプが残ってイベントループが終わらないことがあるため、
  // 結果を出したら明示的に終了する。
  if (failed.length) {
    console.error("失敗したショットは既存のファイルを更新していません。");
    process.exit(1);
  }
  process.exit(0);
}

await main();

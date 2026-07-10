// 区域境界（太い色付き線）の色ベース抽出。
// docs/wants/03_地図機能.md §信頼度による分岐 / 色ベース境界抽出。
//
// vision モデルの座標推定に頼らず、アップロード画像から赤/ピンクの太線ピクセルを
// 画像処理で検出し、閉じた輪の内側を塗って外周輪郭をベクトル化する:
//   色しきい値(赤/ピンク) → 2値マスク → オープニング(細線除去) →
//   ギャップを閉じる(dilate) → 外側フラッド → 内側領域を塗る(矩形はバリアで除外) →
//   クロージング(内側の矩形が作る切り欠き・小穴を埋める) → 最大連結成分 →
//   外周輪郭追跡(Moore) → Douglas-Peucker 間引き → 0..1 比率のポリゴン
// vision は場所/ランドマーク抽出を担い、境界は本モジュールが担う。

export interface ColorBoundaryOptions {
  /** 処理解像度の最大辺(px)。大きい画像は縮小して処理（座標は比率なので影響なし）。 */
  maxDim?: number;
  /** 赤/ピンクとみなす hue 範囲（循環）: h>=hueMin または h<=hueMax。 */
  hueMin?: number;
  hueMax?: number;
  minSat?: number;
  minVal?: number;
  /**
   * オープニング（収縮→膨張）半径(px)。細い線（字界の点線・番号枠の細枠など）を
   * 除去し「太い区域境界線」だけを残す。0 で無効。
   */
  openRadius?: number;
  /** マスクのギャップを閉じる膨張半径(px)。主境界ループの途切れを橋渡しする。 */
  closeRadius?: number;
  /** Douglas-Peucker 許容距離(処理解像度px)。 */
  simplifyPx?: number;
  /** 採用する最小面積（画像全体に対する割合）。 */
  minAreaFrac?: number;
}

const DEFAULTS = {
  maxDim: 1200,
  hueMin: 320,
  hueMax: 20,
  minSat: 0.3,
  minVal: 0.35,
  openRadius: 1,
  closeRadius: 3,
  simplifyPx: 2.5,
  minAreaFrac: 0.01,
};

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** 赤/ピンクの太線色かを判定する（オレンジ建物 hue~25-45 は除外）。 */
export function isBoundaryColor(
  r: number,
  g: number,
  b: number,
  opts: ColorBoundaryOptions = {},
): boolean {
  const o = { ...DEFAULTS, ...opts };
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < o.minSat || v < o.minVal) return false;
  return h >= o.hueMin || h <= o.hueMax;
}

// --- マスク処理（純粋関数、テスト可能） ---

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = true;
      for (let dy = -r; dy <= r && all; dy++) {
        const ny = y + dy;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) {
            all = false;
            break;
          }
        }
      }
      out[y * w + x] = all ? 1 : 0;
    }
  }
  return out;
}

/** オープニング（収縮→膨張）: 幅 2r 以下の細い線を除去し、太い線だけ残す。 */
function opening(
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  if (r <= 0) return mask.slice();
  return dilate(erode(mask, w, h, r), w, h, r);
}

/**
 * クロージング（膨張→収縮）: 口幅 2r 以下の切り欠き（notch）と小穴を埋める。
 * 外周サイズは（膨張分を収縮で戻すため）ほぼ保たれる。
 */
function closing(
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  if (r <= 0) return mask.slice();
  return erode(dilate(mask, w, h, r), w, h, r);
}

function floodOutside(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (out[i] || m[i]) return;
    out[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return out;
}

function largestComponent(
  f: Uint8Array,
  w: number,
  h: number,
): Uint8Array | null {
  const label = new Int32Array(w * h);
  let cur = 0;
  let best = 0;
  let bestSize = 0;
  const stack: number[] = [];
  for (let s = 0; s < f.length; s++) {
    if (!f[s] || label[s]) continue;
    cur++;
    let size = 0;
    label[s] = cur;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      const nb = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (f[j] && !label[j]) {
          label[j] = cur;
          stack.push(j);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = cur;
    }
  }
  if (!best) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

// 時計回り 8 近傍（y 下向き）: NW,N,NE,E,SE,S,SW,W
const NBR: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
function dirIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++)
    if (NBR[i][0] === dx && NBR[i][1] === dy) return i;
  return -1;
}

/** Moore 近傍による外周輪郭追跡（時計回りの順序付き頂点列を返す）。 */
function traceOuterContour(
  m: Uint8Array,
  w: number,
  h: number,
): Array<[number, number]> {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x];
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx < 0) return [];
  const contour: Array<[number, number]> = [[sx, sy]];
  let px = sx;
  let py = sy;
  // 開始画素の左(西)は背景。そこを backtrack とする。
  let bi = dirIndex(-1, 0); // W
  let ci = (bi + 1) % 8;
  const maxSteps = 8 * w * h;
  for (let steps = 0; steps < maxSteps; steps++) {
    const cx = px + NBR[ci][0];
    const cy = py + NBR[ci][1];
    if (at(cx, cy)) {
      if (cx === sx && cy === sy) break; // 一周して開始に戻った
      contour.push([cx, cy]);
      const prevX = px;
      const prevY = py;
      px = cx;
      py = cy;
      bi = dirIndex(prevX - px, prevY - py); // 新 p から見た直前画素の方向
      ci = (bi + 1) % 8;
    } else {
      bi = ci;
      ci = (bi + 1) % 8;
    }
  }
  return contour;
}

function perpDist(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy) / len;
}

function douglasPeucker(
  pts: Array<[number, number]>,
  eps: number,
): Array<[number, number]> {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(pts[i], pts[a], pts[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx]);
      stack.push([idx, b]);
    }
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/**
 * 2 値マスク（境界色=1）から境界ポリゴン（0..1 比率）を抽出する純粋関数。
 * 閉じた輪の内側領域を塗り（矩形はバリアで除外）、内側の切り欠きを closing で埋め、
 * 最大連結成分の外周を追跡・間引きして返す。
 */
export function maskToBoundaryRings(
  mask: Uint8Array,
  w: number,
  h: number,
  opts: ColorBoundaryOptions = {},
): { x: number; y: number }[][] {
  const o = { ...DEFAULTS, ...opts };
  // 細い線（字界の点線・番号枠の細枠など）を除去し、太い区域境界線だけ残す。
  const opened = opening(mask, w, h, o.openRadius);
  // ギャップを閉じてから外側フラッド。境界のバリアとして使う。
  const closed = dilate(opened, w, h, o.closeRadius);
  const outside = floodOutside(closed, w, h);
  // 「境界線そのもの」ではなく「境界線で囲まれた内側領域」を対象にする。
  // 番号枠の矩形はバリア(closed)の一部なので内側領域から除外され、外側の矩形は
  // 突起にならない。内側で孤立した矩形は穴になり外周輪郭に影響しない。
  const insideRaw = new Uint8Array(w * h);
  for (let i = 0; i < insideRaw.length; i++)
    insideRaw[i] = !outside[i] && !closed[i] ? 1 : 0;
  // 内側に連結した矩形が作る切り欠き（＝内側への削れ）と小穴を closing で埋める。
  // 外側の矩形は依然バリアなので取り込まれず、削れだけが軽減される。
  const inside = closing(insideRaw, w, h, o.closeRadius);
  const comp = largestComponent(inside, w, h);
  if (!comp) return [];
  let area = 0;
  for (let i = 0; i < comp.length; i++) area += comp[i];
  if (area < o.minAreaFrac * w * h) return [];
  const contour = traceOuterContour(comp, w, h);
  if (contour.length < 3) return [];
  const simp = douglasPeucker(contour, o.simplifyPx);
  if (simp.length < 3) return [];
  return [simp.map(([x, y]) => ({ x: x / w, y: y / h }))];
}

// --- canvas ローダ（ブラウザ実行、jsdom では未テスト） ---

async function loadImageData(
  source: Blob | ImageBitmap,
  maxDim: number,
): Promise<ImageData> {
  const bitmap =
    source instanceof ImageBitmap ? source : await createImageBitmap(source);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), {
          width: w,
          height: h,
        });
  const ctx = (canvas as HTMLCanvasElement).getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * 画像から赤/ピンクの太線を色抽出し、境界ポリゴン（0..1 比率）群を返す。
 * 見つからなければ空配列。呼び出し側で vision 抽出へフォールバックする。
 */
export async function extractColorBoundaries(
  source: Blob | ImageBitmap,
  opts: ColorBoundaryOptions = {},
): Promise<{ x: number; y: number }[][]> {
  const o = { ...DEFAULTS, ...opts };
  const img = await loadImageData(source, o.maxDim);
  const { data, width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (isBoundaryColor(data[p], data[p + 1], data[p + 2], o)) mask[i] = 1;
  }
  return maskToBoundaryRings(mask, w, h, o);
}

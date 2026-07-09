// PDF の 1 ページ目を PNG 画像にラスタ化する（AI 地図取込の PDF 入力対応）。
// docs/wants/03_地図機能.md §入力（PDF は 1 ページ目をラスタ化して解析）。
//
// pdfjs-dist は重いため動的 import でメインバンドルから分離する。
// canvas 描画に依存するためブラウザ実行専用（jsdom では動かない）。

/** 先頭バイトが "%PDF" なら PDF とみなす。 */
export function isPdf(data: ArrayBuffer): boolean {
  const b = new Uint8Array(data);
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

/**
 * PDF の 1 ページ目を指定倍率でラスタ化し、PNG の Blob を返す。
 * @param scale レンダリング倍率（既定 2.0。高いほど鮮明だが重い）
 */
export async function rasterizePdfFirstPage(
  data: ArrayBuffer,
  scale = 2.0,
): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  // Vite: ワーカーは URL として解決する
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("rasterizePdfFirstPage: canvas 2D context を取得できません");
    }

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("rasterizePdfFirstPage: PNG 生成に失敗しました");
    return blob;
  } finally {
    void doc.destroy();
  }
}

/**
 * File を解析・表示に使える画像 Blob にする。
 * PDF なら 1 ページ目をラスタ化した PNG、それ以外は File そのもの（Blob）。
 */
export async function prepareImageBlob(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  return isPdf(buf) ? rasterizePdfFirstPage(buf) : file;
}

// テキストを QR コードとして canvas に描画する共通コンポーネント。
// 端末ペアリング（この ID に別端末を追加）の QR 表示に使う。
// 生成失敗（容量超過等）は無言で空白にせず、フォールバック文言を表示して
// URL コピー経路へ誘導する（docs/wants/01「チャネル（暫定・URL 方式）」）。

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "../contexts/I18nContext";

interface QrCodeProps {
  text: string;
  size?: number;
}

export function QrCode({ text, size = 220 }: QrCodeProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // 誤り訂正 L（最大容量 2953 バイト）: ペアリング payload はグループの
    // メンバー数に比例して伸びるため、既定 M（2331 バイト）より上限を確保する。
    QRCode.toCanvas(
      canvas,
      text,
      { width: size, margin: 1, errorCorrectionLevel: "L" },
      (err) => {
        if (err) {
          console.error("QR generate failed", err);
          setFailed(true);
        } else {
          setFailed(false);
        }
      },
    );
  }, [text, size]);

  // 失敗時も canvas は隠すだけにして残す（text が短くなれば再描画で復帰できる）。
  return (
    <>
      <canvas
        ref={ref}
        className={`qr-canvas${failed ? " qr-canvas-hidden" : ""}`}
        width={size}
        height={size}
      />
      {failed && <p className="qr-fallback">{t.devicePairing.qrTooLarge}</p>}
    </>
  );
}

// テキストを QR コードとして canvas に描画する共通コンポーネント。
// 端末ペアリング（この ID に別端末を追加）の QR 表示に使う。

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  text: string;
  size?: number;
}

export function QrCode({ text, size = 220 }: QrCodeProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, (err) => {
      if (err) console.error("QR generate failed", err);
    });
  }, [text, size]);

  return (
    <canvas ref={ref} className="qr-canvas" width={size} height={size} />
  );
}

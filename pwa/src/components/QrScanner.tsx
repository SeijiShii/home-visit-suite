// カメラ映像から QR コードを読み取る共通コンポーネント。
// 端末ペアリングで、新端末が既存端末の QR をスキャンするのに使う。
// 最初に読み取れた時点で onResult を呼び、カメラは unmount 時に停止する。

import { useEffect, useRef } from "react";
import jsQR from "jsqr";

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (e: unknown) => void;
}

export function QrScanner({ onResult, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const tick = () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code && code.data) {
          onResult(code.data);
          return; // 最初の検出で停止
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        tick();
      } catch (e) {
        onError?.(e);
      }
    };

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult, onError]);

  return (
    <video ref={videoRef} className="qr-scanner-video" playsInline muted />
  );
}

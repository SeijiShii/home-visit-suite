// 設定画面の API キーから AI 地図取込サービスを組み立てるファクトリ。
// vision=Anthropic、geocoder=GSI の実アダプタを結線する。

import { AiMapImportService } from "./ai-map-import";
import { AnthropicMapVision } from "./anthropic-map-vision";
import { GsiGeocoder } from "./gsi-geocoder";

export function buildAiMapImportService(
  apiKey: string,
  model?: string,
): AiMapImportService {
  return new AiMapImportService(
    new AnthropicMapVision({ apiKey, model }),
    new GsiGeocoder(),
  );
}

// 設定画面の API キーから AI 地図取込サービスを組み立てるファクトリ。
// vision=プロバイダ別アダプタ（Anthropic / Gemini）、geocoder=GSI を結線する。

import { AiMapImportService, type MapVisionProvider } from "./ai-map-import";
import { AnthropicMapVision } from "./anthropic-map-vision";
import { GeminiMapVision } from "./gemini-map-vision";
import { GsiGeocoder } from "./gsi-geocoder";
import { resolveModel } from "./settings-service";

function buildVision(
  provider: string,
  apiKey: string,
  model?: string,
): MapVisionProvider {
  // 保存モデルがプロバイダ不整合（切替直後など）なら既定モデルへ寄せる。
  const resolved = resolveModel(provider, model ?? "");
  switch (provider) {
    case "gemini":
      return new GeminiMapVision({ apiKey, model: resolved });
    case "anthropic":
    default:
      return new AnthropicMapVision({ apiKey, model: resolved });
  }
}

export function buildAiMapImportService(
  provider: string,
  apiKey: string,
  model?: string,
): AiMapImportService {
  return new AiMapImportService(
    buildVision(provider, apiKey, model),
    new GsiGeocoder(),
  );
}

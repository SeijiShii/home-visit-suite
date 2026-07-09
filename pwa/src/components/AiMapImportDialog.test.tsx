// AiMapImportDialog の段階遷移・信頼度分岐・取り込みのテスト。
// importService / onCommit / onGrantConsent は fake で駆動する。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import type {
  AiMapImportService,
  ImportDraft,
} from "../services/ai-map-import";
import { AiMapImportDialog } from "./AiMapImportDialog";

const EMPTY_EXTRACTION = { landmarks: [], boundaries: [], places: [] };

const HIGH_DRAFT: ImportDraft = {
  confidence: "high",
  georeference: null,
  polygons: [{ vertices: [] }, { vertices: [] }],
  places: [
    { geo: { lat: 35.7, lng: 140.3 }, number: 1, label: "", address: "" },
  ],
  matchedGcps: [],
  unmatchedLandmarks: ["謎の目印"],
  areaGuess: "成田市 成田周辺",
  extraction: EMPTY_EXTRACTION,
};

const LOW_DRAFT: ImportDraft = {
  confidence: "low",
  georeference: null,
  polygons: [],
  places: [],
  matchedGcps: [],
  unmatchedLandmarks: [],
  extraction: EMPTY_EXTRACTION,
};

function fakeService(impl: () => Promise<ImportDraft>): AiMapImportService {
  return { buildDraft: impl } as unknown as AiMapImportService;
}

function renderDialog(
  overrides: Partial<Parameters<typeof AiMapImportDialog>[0]> = {},
) {
  const props = {
    importService: fakeService(async () => HIGH_DRAFT),
    providerName: "Anthropic",
    consentGiven: true,
    onGrantConsent: vi.fn(),
    onCommit: vi.fn(async () => 2),
    onManualAlign: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <AiMapImportDialog {...props} />
    </I18nProvider>,
  );
  return props;
}

async function uploadAndAnalyze() {
  const file = new File([new Uint8Array([0x89, 0x50])], "map.png", {
    type: "image/png",
  });
  await userEvent.upload(screen.getByLabelText(/地図画像を選択/), file);
  await userEvent.click(screen.getByRole("button", { name: "解析する" }));
}

describe("AiMapImportDialog", () => {
  beforeEach(() => {
    setLocale("ja");
  });

  it("未同意なら同意画面を表示し、同意後にファイル選択へ進む", async () => {
    const props = renderDialog({ consentGiven: false });
    expect(screen.getByText("画像の外部送信について")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "同意して続行" }));

    expect(props.onGrantConsent).toHaveBeenCalledOnce();
    expect(screen.getByLabelText(/地図画像を選択/)).toBeInTheDocument();
  });

  it("高信頼: 解析結果を表示し、境界を取り込める", async () => {
    const props = renderDialog();
    await uploadAndAnalyze();

    expect(await screen.findByText(/信頼度: 高/)).toBeInTheDocument();
    expect(screen.getByText("境界ポリゴン: 2 件")).toBeInTheDocument();
    expect(screen.getByText(/成田市 成田周辺/)).toBeInTheDocument();
    expect(screen.getByText("謎の目印")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "境界を地図に取り込む" }),
    );
    expect(props.onCommit).toHaveBeenCalledWith(HIGH_DRAFT);
    expect(
      await screen.findByText("境界ポリゴン 2 件を取り込みました"),
    ).toBeInTheDocument();
  });

  it("低信頼: 手動整列の案内を表示し、取り込みボタンを出さない", async () => {
    renderDialog({ importService: fakeService(async () => LOW_DRAFT) });
    await uploadAndAnalyze();

    expect(await screen.findByText(/信頼度: 低/)).toBeInTheDocument();
    expect(screen.getByText(/オーバーレイ整列/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "境界を地図に取り込む" }),
    ).not.toBeInTheDocument();
  });

  it("低信頼: 手動整列ボタンを押すと onManualAlign を呼ぶ", async () => {
    const props = renderDialog({
      importService: fakeService(async () => LOW_DRAFT),
    });
    await uploadAndAnalyze();
    await screen.findByText(/信頼度: 低/);

    await userEvent.click(
      screen.getByRole("button", { name: "手動で位置合わせする" }),
    );
    expect(props.onManualAlign).toHaveBeenCalledOnce();
    expect(props.onManualAlign).toHaveBeenCalledWith(
      expect.any(File),
      LOW_DRAFT,
    );
  });

  it("解析エラー時はエラー画面を表示する", async () => {
    renderDialog({
      importService: fakeService(async () => {
        throw new Error("HTTP 401");
      }),
    });
    await uploadAndAnalyze();

    expect(await screen.findByText("解析に失敗しました")).toBeInTheDocument();
    expect(screen.getByText("HTTP 401")).toBeInTheDocument();
  });
});

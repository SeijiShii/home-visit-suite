// PolygonList の AI 場所取込ボタンのテスト（Phase 1.1）。
// 紐付け済みポリゴンに未確定場所がある行にのみボタンを出し、押下で取込ハンドラを呼ぶ。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PolygonID, PolygonSnapshot } from "map-polygon-editor";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import type { PolygonAreaInfo } from "../services/polygon-service";
import { PolygonList } from "./PolygonList";

function poly(id: string): PolygonSnapshot {
  return {
    id: id as unknown as PolygonID,
    edgeIds: [],
    holes: [],
    vertexIds: [],
  } as PolygonSnapshot;
}

function renderList(
  overrides: Partial<Parameters<typeof PolygonList>[0]> = {},
) {
  const props = {
    polygons: [poly("poly-A"), poly("poly-B")],
    polygonAreaMap: new Map<string, PolygonAreaInfo>([
      ["poly-A", { areaId: "NRT-001-01", areaLabel: "NRT-001-01" }],
    ]),
    tree: [],
    selectedPolygonId: null,
    onPolygonClick: vi.fn(),
    onDeletePolygon: vi.fn(),
    onToggleActive: vi.fn(),
    onToggleLocked: vi.fn(),
    onLinkPolygon: vi.fn(),
    onUnlinkPolygon: vi.fn(),
    isDrawing: false,
    aiPendingCounts: new Map<string, number>([["poly-A", 3]]),
    onImportAiPlaces: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <PolygonList {...props} />
    </I18nProvider>,
  );
  return props;
}

describe("PolygonList AI 場所取込", () => {
  beforeEach(() => setLocale("ja"));

  it("紐付け済み＋未確定場所ありの行に取込ボタンを出し、押すとハンドラを呼ぶ", async () => {
    const props = renderList();
    const btn = screen.getByRole("button", { name: "AI 場所 3 件を取込" });
    await userEvent.click(btn);
    expect(props.onImportAiPlaces).toHaveBeenCalledWith("poly-A", "NRT-001-01");
  });

  it("未確定場所が無ければボタンを出さない", () => {
    renderList({ aiPendingCounts: new Map() });
    expect(
      screen.queryByRole("button", { name: /AI 場所/ }),
    ).not.toBeInTheDocument();
  });

  it("未紐付けポリゴンには取込ボタンを出さない", () => {
    renderList({
      polygonAreaMap: new Map(),
      aiPendingCounts: new Map([["poly-A", 3]]),
    });
    expect(
      screen.queryByRole("button", { name: /AI 場所/ }),
    ).not.toBeInTheDocument();
  });
});

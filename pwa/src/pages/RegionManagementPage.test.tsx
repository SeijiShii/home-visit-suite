// RegionManagementPage の移植テスト（RegionRepository をインメモリ実装で駆動）。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { setLocale } from "../i18n/i18n-util";
import { RegionManagementPage } from "./RegionManagementPage";

async function renderRegions(
  extraSeed?: (services: AppServices) => Promise<void>,
): Promise<AppServices> {
  const services = createInMemoryServices();
  await extraSeed?.(services);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <RegionManagementPage />
      </ServicesProvider>
    </I18nProvider>,
  );
  return services;
}

describe("RegionManagementPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("領域が無いとき空表示", async () => {
    await renderRegions();
    expect(await screen.findByText("データがありません")).toBeInTheDocument();
  });

  it("領域を区域親番数付きで追加できる", async () => {
    const services = await renderRegions();
    await userEvent.click(
      await screen.findByRole("button", { name: "領域を追加" }),
    );

    const dialog = screen
      .getByText("領域を追加", { selector: ".modal-title" })
      .closest(".modal")! as HTMLElement;
    // 順序: 領域名(textbox), 記号(textbox), 区域親番数(spinbutton)
    const textboxes = within(dialog).getAllByRole("textbox");
    await userEvent.type(textboxes[0], "成田市");
    await userEvent.type(textboxes[1], "NRT");
    const countInput = within(dialog).getByRole("spinbutton");
    await userEvent.clear(countInput);
    await userEvent.type(countInput, "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "追加" }));

    expect(await screen.findByText("成田市")).toBeInTheDocument();
    expect(screen.getByText("NRT")).toBeInTheDocument();

    // リポジトリに領域 + 区域親番 3 件が保存されている
    const regions = await services.regionRepo.listRegions();
    expect(regions).toHaveLength(1);
    expect(regions[0].id).toBe("NRT");
    const pas = await services.regionRepo.listParentAreas("NRT");
    expect(pas).toHaveLength(3);
    expect(pas.map((p) => p.number).sort()).toEqual(["001", "002", "003"]);
  });

  it("領域を削除できる（名前と記号の確認入力が必要）", async () => {
    const services = await renderRegions(async (s) => {
      await s.regionRepo.saveRegion({
        id: "NRT",
        name: "成田市",
        symbol: "NRT",
        approved: false,
        geometry: null,
        order: 0,
      });
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "領域を削除" }),
    );
    const dialog = screen
      .getByText("領域を削除", { selector: ".modal-title" })
      .closest(".modal")! as HTMLElement;

    // 確認入力前は削除ボタンが無効
    const deleteBtn = within(dialog).getByRole("button", {
      name: "領域を削除",
    });
    expect(deleteBtn).toBeDisabled();

    // 順序: 領域名を入力(textbox), 記号を入力(textbox)
    const textboxes = within(dialog).getAllByRole("textbox");
    await userEvent.type(textboxes[0], "成田市");
    await userEvent.type(textboxes[1], "NRT");
    expect(deleteBtn).toBeEnabled();
    await userEvent.click(deleteBtn);

    expect(await screen.findByText("データがありません")).toBeInTheDocument();
    expect(await services.regionRepo.listRegions()).toHaveLength(0);
  });

  it("複数領域を上下移動で並べ替えできる", async () => {
    const services = await renderRegions(async (s) => {
      await s.regionRepo.saveRegion({
        id: "AAA",
        name: "エー市",
        symbol: "AAA",
        approved: false,
        geometry: null,
        order: 0,
      });
      await s.regionRepo.saveRegion({
        id: "BBB",
        name: "ビー市",
        symbol: "BBB",
        approved: false,
        geometry: null,
        order: 1,
      });
    });

    await screen.findByText("エー市");
    // 2 番目の領域（ビー市）の「上へ」を押す
    const items = screen.getAllByText(/市$/);
    const bbbRow = items[1].closest(".region-management-item")!;
    await userEvent.click(within(bbbRow as HTMLElement).getByTitle("上へ"));

    // 並び順が反転し、BBB が order 0 になる
    const regions = (await services.regionRepo.listRegions()).sort(
      (a, b) => a.order - b.order,
    );
    expect(regions[0].id).toBe("BBB");
    expect(regions[1].id).toBe("AAA");
  });
});

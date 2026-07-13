// UsersPage の移植テスト（インメモリ UserRepository で駆動）。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { GroupNetworkProvider } from "../contexts/GroupNetworkContext";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import { setLocale } from "../i18n/i18n-util";
import { LocalIdentityService } from "../services/identity-service";
import { UsersPage } from "./UsersPage";

async function renderUsers(
  seed?: (services: AppServices) => Promise<void>,
): Promise<AppServices> {
  const services = createInMemoryServices();
  await services.userRepo.saveUser({
    id: "did:dev:admin",
    name: "Alice Admin",
    role: "admin",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  });
  await services.userRepo.saveUser({
    id: "did:dev:member",
    name: "Bob Member",
    role: "member",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  });
  await seed?.(services);
  // UsersPage は GroupInviteSection（管理者専用の招待発行 UI）を含むため
  // IdentityProvider / GroupNetworkProvider が要る。ここでは identity 未作成
  // ＝ currentRole "" となり招待セクションは非表示（既存アサーションに影響しない）。
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={new LocalIdentityService(services.userRepo)}>
          <GroupNetworkProvider service={null}>
            <UsersPage />
          </GroupNetworkProvider>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
  return services;
}

describe("UsersPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("メンバー一覧がロールバッジ付きで表示される", async () => {
    await renderUsers();
    expect(await screen.findByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("Bob Member")).toBeInTheDocument();
    expect(screen.getByText("管理者")).toBeInTheDocument();
    expect(screen.getByText("活動メンバー")).toBeInTheDocument();
  });

  it("タグを作成できる", async () => {
    const services = await renderUsers();
    await userEvent.click(
      await screen.findByRole("button", { name: "タグ作成" }),
    );
    const modal = screen.getByText("タグ名").closest(".modal")! as HTMLElement;
    await userEvent.type(within(modal).getByRole("textbox"), "Aチーム");
    await userEvent.click(within(modal).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("Aチーム")).toBeInTheDocument();
    expect(await services.userRepo.listTags()).toHaveLength(1);
  });

  it("メンバーにタグを付与できる", async () => {
    const services = await renderUsers(async (s) => {
      await s.userRepo.saveTag({
        id: "tag-1",
        name: "外国語",
        color: "#3b82f6",
      });
    });

    // Bob の行の「+」からタグ付与モーダルを開く
    const bobRow = (await screen.findByText("Bob Member")).closest("tr")!;
    await userEvent.click(within(bobRow).getByText("+"));

    const modal = screen
      .getByText("タグを付与")
      .closest(".modal")! as HTMLElement;
    await userEvent.click(within(modal).getByText("外国語"));
    await userEvent.click(within(modal).getByRole("button", { name: "保存" }));

    const bob = await services.userRepo.getUser("did:dev:member");
    expect(bob?.tagIds).toEqual(["tag-1"]);
  });

  it("検索でメンバーを絞り込める", async () => {
    await renderUsers();
    await screen.findByText("Alice Admin");
    await userEvent.type(screen.getByPlaceholderText("検索"), "Bob");
    expect(screen.queryByText("Alice Admin")).toBeNull();
    expect(screen.getByText("Bob Member")).toBeInTheDocument();
  });
});

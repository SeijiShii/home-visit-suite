import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "../../domain/models/user";
import { InMemoryUserRepository } from "./inmemory-user-repository";

const alice: User = {
  id: "did:example:alice",
  name: "Alice",
  role: "editor",
  tagIds: ["t1"],
  joinedAt: "2026-01-01T00:00:00Z",
};

describe("InMemoryUserRepository", () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it("保存したユーザーを取得・一覧できる", async () => {
    await repo.saveUser(alice);
    expect(await repo.getUser(alice.id)).toEqual(alice);
    expect(await repo.listUsers()).toHaveLength(1);
  });

  it("存在しないユーザーは null", async () => {
    expect(await repo.getUser("did:example:nobody")).toBeNull();
  });

  it("削除できる", async () => {
    await repo.saveUser(alice);
    await repo.deleteUser(alice.id);
    expect(await repo.getUser(alice.id)).toBeNull();
  });

  it("取得結果を書き換えても保存済みデータに影響しない", async () => {
    await repo.saveUser(alice);
    const fetched = await repo.getUser(alice.id);
    fetched!.tagIds.push("t2");
    expect((await repo.getUser(alice.id))!.tagIds).toEqual(["t1"]);
  });

  it("タグを保存・一覧・削除できる", async () => {
    await repo.saveTag({ id: "t1", name: "Aチーム", color: "#3b82f6" });
    expect(await repo.listTags()).toHaveLength(1);
    await repo.deleteTag("t1");
    expect(await repo.listTags()).toHaveLength(0);
  });
});

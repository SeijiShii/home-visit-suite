// @vitest-environment node
// 招待の署名/検証（@linkself/core Ed25519）は jsdom の WebCrypto シムと相性が
// 悪いため node 環境で実行する（group-invite.test.ts と同様）。
import { generateIdentity, type JoinResponse } from "@linkself/core";
import { describe, expect, it, vi } from "vitest";
import { buildGroupInviteUrl } from "./group-invite";
import type { User } from "../../domain/models/user";
import {
  GroupNetworkError,
  GroupNetworkService,
  upsertJoinedMember,
  type GroupClient,
  type NetworkIdStore,
  type PendingJoin,
  type PendingJoinStore,
} from "./group-network";

function memStore(initial: string | null = null): NetworkIdStore {
  let id = initial;
  return {
    get: () => id,
    set: (v: string) => {
      id = v;
    },
  };
}

function memPendingStore(): PendingJoinStore {
  let p: PendingJoin | null = null;
  return {
    get: () => p,
    set: (v: PendingJoin) => {
      p = v;
    },
    clear: () => {
      p = null;
    },
  };
}

async function makeClient(
  overrides: Partial<GroupClient> = {},
): Promise<GroupClient> {
  const identity = await generateIdentity();
  return {
    userIdentity: identity,
    network: { create: vi.fn(async () => "net-created") },
    // 既定は「保存済み ID の実体あり」= 再利用パス（実体なしのケースは
    // 個別テストで上書きする）。
    networkStore: { getNetwork: vi.fn(async () => ({ id: "net-x" })) },
    requestJoin: vi.fn(
      async () => ({ ok: false, code: "invite_invalid" }) as JoinResponse,
    ),
    selfAddrs: () => [
      "/dns4/relay/tcp/443/wss/p2p/12D3KooWR/p2p-circuit/p2p/12D3KooWAdmin",
    ],
    depositJoinRequest: vi.fn(async () => {}),
    registerPendingJoin: vi.fn(),
    ...overrides,
  };
}

describe("ensureFoundingNetwork", () => {
  it("creates and persists once, then is idempotent", async () => {
    const client = await makeClient();
    const store = memStore();
    const svc = new GroupNetworkService(client, store);

    expect(await svc.ensureFoundingNetwork()).toBe("net-created");
    expect(store.get()).toBe("net-created");
    expect(await svc.ensureFoundingNetwork()).toBe("net-created");
    expect(client.network.create).toHaveBeenCalledTimes(1);
  });

  it("returns the existing network without creating", async () => {
    const client = await makeClient();
    const svc = new GroupNetworkService(client, memStore("net-existing"));
    expect(await svc.ensureFoundingNetwork()).toBe("net-existing");
    expect(client.network.create).not.toHaveBeenCalled();
  });

  it("recreates when the stored id has no backing network (stale id recovery)", async () => {
    const client = await makeClient({
      networkStore: { getNetwork: vi.fn(async () => null) },
    });
    const store = memStore("net-stale");
    const svc = new GroupNetworkService(client, store);
    expect(await svc.ensureFoundingNetwork()).toBe("net-created");
    expect(store.get()).toBe("net-created");
    expect(client.network.create).toHaveBeenCalledTimes(1);
  });
});

describe("issueInvite", () => {
  it("issues a 3-day #/join URL and ensures the network exists", async () => {
    const client = await makeClient();
    const store = memStore();
    const svc = new GroupNetworkService(client, store);

    const { url } = await svc.issueInvite({ baseUrl: "https://hvs.example/" });
    expect(url).toContain("#/join?i=");
    expect(store.get()).toBe("net-created");
  });

  it("fails when the node has no reachable relay address", async () => {
    const client = await makeClient({ selfAddrs: () => [] });
    const svc = new GroupNetworkService(client, memStore());
    await expect(svc.issueInvite()).rejects.toMatchObject({
      code: "no_relay_address",
    });
  });
});

describe("join", () => {
  async function validInviteUrl(): Promise<string> {
    const admin = await generateIdentity();
    const { url } = await buildGroupInviteUrl(admin, {
      networkId: "net-99",
      relays: [
        "/dns4/relay/tcp/443/wss/p2p/12D3KooWR/p2p-circuit/p2p/12D3KooWAdmin",
      ],
      baseUrl: "https://hvs.example/",
    });
    return url;
  }

  it("persists the network id on a successful join", async () => {
    const url = await validInviteUrl();
    const store = memStore();
    const requestJoin = vi.fn(async (): Promise<JoinResponse> => ({
      ok: true,
      network: {
        networkId: "net-99",
        suiteId: "home-visit-suite",
        members: ["a"],
        memberRoles: { a: "admin" },
      },
    }));
    const client = await makeClient({ requestJoin });
    const svc = new GroupNetworkService(client, store);

    const res = await svc.join(url, "Newcomer");
    expect(res.ok).toBe(true);
    expect(store.get()).toBe("net-99");
    expect(requestJoin).toHaveBeenCalledOnce();
  });

  it("rejects an expired invite before dialing", async () => {
    const admin = await generateIdentity();
    const { url } = await buildGroupInviteUrl(admin, {
      networkId: "net-99",
      relays: ["/x/p2p/12D3KooWAdmin"],
      baseUrl: "https://hvs.example/",
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const client = await makeClient();
    const svc = new GroupNetworkService(client, memStore());
    await expect(
      svc.join(url, "X", () => 1_000 + 60_001),
    ).rejects.toMatchObject({
      code: "invite_expired",
    });
    expect(client.requestJoin).not.toHaveBeenCalled();
  });

  it("surfaces an unreachable error after all relays fail", async () => {
    const url = await validInviteUrl();
    const client = await makeClient({
      requestJoin: vi.fn(async () => {
        throw new Error("dial failed");
      }),
    });
    const svc = new GroupNetworkService(client, memStore());
    await expect(svc.join(url, "X")).rejects.toBeInstanceOf(GroupNetworkError);
  });
});

describe("upsertJoinedMember", () => {
  const info = {
    networkId: "net-1",
    memberDID: "did:key:zNewcomer",
    displayName: "新人さん",
    role: "member",
  };

  function memRepo(seed: User[] = []) {
    const users = new Map(seed.map((u) => [u.id, u]));
    return {
      users,
      getUser: async (id: string) => users.get(id) ?? null,
      saveUser: async (u: User) => {
        users.set(u.id, u);
      },
    };
  }

  it("records a new member with the display name and invited role", async () => {
    const repo = memRepo();
    await upsertJoinedMember(repo, info, "2026-07-13T00:00:00.000Z");
    expect(repo.users.get("did:key:zNewcomer")).toEqual({
      id: "did:key:zNewcomer",
      name: "新人さん",
      role: "member",
      tagIds: [],
      joinedAt: "2026-07-13T00:00:00.000Z",
    });
  });

  it("keeps tags and joinedAt of an existing record (re-join)", async () => {
    const repo = memRepo([
      {
        id: "did:key:zNewcomer",
        name: "旧名",
        role: "member",
        tagIds: ["tag-1"],
        joinedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await upsertJoinedMember(repo, info, "2026-07-13T00:00:00.000Z");
    expect(repo.users.get("did:key:zNewcomer")).toMatchObject({
      name: "新人さん",
      tagIds: ["tag-1"],
      joinedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps an unknown role to member", async () => {
    const repo = memRepo();
    await upsertJoinedMember(repo, { ...info, role: "superuser" });
    expect(repo.users.get("did:key:zNewcomer")?.role).toBe("member");
  });
});

describe("非同期参加（joinAsync / restorePendingJoin / resolveAsyncDecision）", () => {
  async function inviteUrlFrom(client: GroupClient): Promise<string> {
    const issued = await buildGroupInviteUrl(client.userIdentity, {
      networkId: "net-x",
      relays: ["/dns4/relay/tcp/443/wss/p2p/12D3KooWAdmin"],
      baseUrl: "https://app.example",
    });
    return issued.url;
  }

  it("joinAsync は deposit して pending を永続する", async () => {
    const client = await makeClient();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(
      client,
      memStore(),
      undefined,
      pendingStore,
    );
    const url = await inviteUrlFrom(client);

    const pending = await svc.joinAsync(url, "新人さん");
    expect(client.depositJoinRequest).toHaveBeenCalledTimes(1);
    expect(pending.displayName).toBe("新人さん");
    expect(pendingStore.get()?.invite.nonce).toBe(pending.invite.nonce);
  });

  it("restorePendingJoin は有効な pending をクライアントに再登録する", async () => {
    const client = await makeClient();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(
      client,
      memStore(),
      undefined,
      pendingStore,
    );
    await svc.joinAsync(await inviteUrlFrom(client), "新人さん");

    expect(svc.restorePendingJoin()).toBeNull();
    expect(client.registerPendingJoin).toHaveBeenCalledTimes(1);
  });

  it("restorePendingJoin は失効した pending を破棄して失効結果を返す", async () => {
    const client = await makeClient();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(
      client,
      memStore(),
      undefined,
      pendingStore,
    );
    const pending = await svc.joinAsync(await inviteUrlFrom(client), "新人さん");

    // 招待期限（3 日）を過ぎた時刻で復元する。
    const after = pending.invite.expiresAt + 1;
    const result = svc.restorePendingJoin(() => after);
    expect(result).toEqual({
      nonce: pending.invite.nonce,
      ok: false,
      code: "invite_expired",
    });
    expect(pendingStore.get()).toBeNull();
    expect(client.registerPendingJoin).not.toHaveBeenCalled();
  });

  it("resolveAsyncDecision(ok) は networkId 永続・ロール解決・pending 解消を行う", async () => {
    const client = await makeClient();
    const store = memStore();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(client, store, undefined, pendingStore);
    const pending = await svc.joinAsync(await inviteUrlFrom(client), "新人さん");

    const selfDID = client.userIdentity.did;
    const result = svc.resolveAsyncDecision(pending.invite.nonce, {
      ok: true,
      network: {
        networkId: "net-joined",
        suiteId: "jp.hvs",
        members: [selfDID],
        memberRoles: { [selfDID]: "editor" },
      },
    });
    expect(result).toEqual({
      nonce: pending.invite.nonce,
      ok: true,
      role: "editor",
    });
    expect(store.get()).toBe("net-joined");
    expect(pendingStore.get()).toBeNull();
  });

  it("resolveAsyncDecision は知らない nonce を無視する", async () => {
    const client = await makeClient();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(
      client,
      memStore(),
      undefined,
      pendingStore,
    );
    await svc.joinAsync(await inviteUrlFrom(client), "新人さん");

    const result = svc.resolveAsyncDecision("unknown-nonce", {
      ok: false,
      code: "invite_expired",
    });
    expect(result).toBeNull();
    expect(pendingStore.get()).not.toBeNull(); // pending は維持
  });

  it("resolveAsyncDecision(ok:false) は拒否コードを結果に載せて pending を解消する", async () => {
    const client = await makeClient();
    const pendingStore = memPendingStore();
    const svc = new GroupNetworkService(
      client,
      memStore(),
      undefined,
      pendingStore,
    );
    const pending = await svc.joinAsync(await inviteUrlFrom(client), "新人さん");

    const result = svc.resolveAsyncDecision(pending.invite.nonce, {
      ok: false,
      code: "invite_expired",
    });
    expect(result).toEqual({
      nonce: pending.invite.nonce,
      ok: false,
      code: "invite_expired",
    });
    expect(pendingStore.get()).toBeNull();
  });
});

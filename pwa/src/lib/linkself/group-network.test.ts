// @vitest-environment node
// 招待の署名/検証（@linkself/core Ed25519）は jsdom の WebCrypto シムと相性が
// 悪いため node 環境で実行する（group-invite.test.ts と同様）。
import { generateIdentity, type Invite, type JoinResponse } from "@linkself/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGroupInviteUrl } from "./group-invite";
import {
  GroupNetworkError,
  GroupNetworkService,
  type GroupClient,
  type NetworkIdStore,
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

async function makeClient(overrides: Partial<GroupClient> = {}): Promise<GroupClient> {
  const identity = await generateIdentity();
  return {
    userIdentity: identity,
    network: { create: vi.fn(async () => "net-created") },
    requestJoin: vi.fn(async () => ({ ok: false, code: "invite_invalid" }) as JoinResponse),
    selfAddrs: () => ["/dns4/relay/tcp/443/wss/p2p/12D3KooWR/p2p-circuit/p2p/12D3KooWAdmin"],
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
    await expect(svc.issueInvite()).rejects.toMatchObject({ code: "no_relay_address" });
  });
});

describe("join", () => {
  async function validInviteUrl(): Promise<string> {
    const admin = await generateIdentity();
    const { url } = await buildGroupInviteUrl(admin, {
      networkId: "net-99",
      relays: ["/dns4/relay/tcp/443/wss/p2p/12D3KooWR/p2p-circuit/p2p/12D3KooWAdmin"],
      baseUrl: "https://hvs.example/",
    });
    return url;
  }

  it("persists the network id on a successful join", async () => {
    const url = await validInviteUrl();
    const store = memStore();
    const requestJoin = vi.fn(
      async (): Promise<JoinResponse> => ({
        ok: true,
        network: { networkId: "net-99", suiteId: "home-visit-suite", members: ["a"], memberRoles: { a: "admin" } },
      }),
    );
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
    await expect(svc.join(url, "X", () => 1_000 + 60_001)).rejects.toMatchObject({
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

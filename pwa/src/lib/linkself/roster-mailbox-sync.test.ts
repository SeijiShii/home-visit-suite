// @vitest-environment node
// ロスターメールボックス同期の純ロジックのテスト。
// node env: jsdom の TextEncoder は別 realm の Uint8Array を返し、@noble の
// 署名検証（instanceof チェック）が常に偽になるため（実ブラウザでは起きない）。
// docs/wants/01「ロスターメールボックス」/ link-self spec §7.6 参照。
// - メールボックスが空/新旧いずれでも最後に必ず deposit（TTL 更新）
// - メールボックスが新しい → commit で採用
// - announce 統合の割り込み（commit false）→ 最新 base でリベースして再統合
// - 統合結果に自分の tombstone → onRevoked へ委譲し deposit しない

import { describe, expect, it } from "vitest";
import {
  buildRoster,
  generateIdentity,
  withDevice,
  withoutDevice,
  type Identity,
  type SignedRoster,
} from "@linkself/core";
import {
  syncRosterWithMailbox,
  type RosterMailboxOps,
  type RosterSyncHost,
} from "./roster-mailbox-sync";

function opsOf(fetched: SignedRoster | null): RosterMailboxOps & {
  deposits: SignedRoster[];
} {
  const deposits: SignedRoster[] = [];
  return {
    deposits,
    fetchLatest: async () => fetched,
    deposit: async (r) => {
      deposits.push(r);
    },
  };
}

function hostOf(
  initial: SignedRoster,
  selfDeviceDID: string,
): RosterSyncHost & {
  current: SignedRoster;
  revoked: SignedRoster | null;
  commits: number;
} {
  const h = {
    current: initial,
    revoked: null as SignedRoster | null,
    commits: 0,
    selfDeviceDID,
    getCurrent: () => h.current,
    commit: (base: SignedRoster, merged: SignedRoster) => {
      if (h.current !== base) return false;
      h.current = merged;
      h.commits++;
      return true;
    },
    onRevoked: (merged: SignedRoster) => {
      h.revoked = merged;
    },
    isAborted: () => false,
  };
  return h;
}

async function fixture(): Promise<{
  user: Identity;
  devA: Identity;
  devB: Identity;
  mine: SignedRoster;
}> {
  const user = await generateIdentity();
  const devA = await generateIdentity();
  const devB = await generateIdentity();
  const mine = await buildRoster(user, [{ deviceDID: devA.did, label: "" }], 1);
  return { user, devA, devB, mine };
}

describe("syncRosterWithMailbox", () => {
  it("deposits the local roster when the mailbox is empty (TTL refresh)", async () => {
    const { user, devA, mine } = await fixture();
    const ops = opsOf(null);
    const host = hostOf(mine, devA.did);

    const res = await syncRosterWithMailbox(user, ops, host);

    expect(res.applied).toBeNull();
    expect(res.deposited).toBe(true);
    expect(ops.deposits).toEqual([mine]);
  });

  it("adopts a newer mailbox roster and re-deposits to refresh the TTL", async () => {
    const { user, devA, devB, mine } = await fixture();
    const newer = await withDevice(user, mine, {
      deviceDID: devB.did,
      label: "PC",
    });
    const ops = opsOf(newer);
    const host = hostOf(mine, devA.did);

    const res = await syncRosterWithMailbox(user, ops, host);

    expect(res.applied?.rev).toBe(newer.rev);
    expect(host.current.devices.map((d) => d.deviceDID)).toContain(devB.did);
    // 採用後も deposit（起動のたびの TTL 更新。spec §7.6）
    expect(ops.deposits).toEqual([newer]);
  });

  it("rebases when an announce merge advanced the roster mid-sync", async () => {
    const { user, devA, devB, mine } = await fixture();
    const mailbox = await buildRoster(
      user,
      [{ deviceDID: devB.did, label: "Tablet" }],
      1,
    );
    const ops = opsOf(mailbox);
    const host = hostOf(mine, devA.did);
    // 1 回目の commit 直前に announce 統合が currentRoster を進めた状況を再現。
    const advanced = await withDevice(user, mine, {
      deviceDID: devA.did,
      label: "PC",
    });
    const origCommit = host.commit;
    let interfered = false;
    host.commit = (base, merged) => {
      if (!interfered) {
        interfered = true;
        host.current = advanced; // 割り込み
        return origCommit(base, merged); // base 不一致 → false
      }
      return origCommit(base, merged);
    };

    const res = await syncRosterWithMailbox(user, ops, host);

    // 進んだ advanced（rev2, ラベル PC）を基準に統合し直し、巻き戻さない。
    expect(res.applied?.rev).toBe(advanced.rev + 1);
    expect(
      res.applied?.devices.find((d) => d.deviceDID === devA.did)?.label,
    ).toBe("PC");
    expect(res.applied?.devices.map((d) => d.deviceDID).sort()).toEqual(
      [devA.did, devB.did].sort(),
    );
    expect(ops.deposits).toEqual([res.applied]);
  });

  it("delegates to onRevoked and skips deposit when the merged roster tombstones this device", async () => {
    const { user, devA, devB, mine } = await fixture();
    const withB = await withDevice(user, mine, {
      deviceDID: devB.did,
      label: "",
    });
    const revoked = await withoutDevice(user, withB, devA.did); // 自分(devA)の失効
    const ops = opsOf(revoked);
    const host = hostOf(mine, devA.did);

    const res = await syncRosterWithMailbox(user, ops, host);

    expect(host.revoked?.rev).toBe(revoked.rev);
    expect(res.applied).toBeNull();
    expect(res.deposited).toBe(false);
    expect(ops.deposits).toEqual([]);
    expect(host.commits).toBe(0); // 失効ロスターは採用・永続しない
  });

  it("does nothing when aborted (wipe in progress)", async () => {
    const { user, devA, mine } = await fixture();
    const ops = opsOf(null);
    const host = hostOf(mine, devA.did);
    host.isAborted = () => true;

    const res = await syncRosterWithMailbox(user, ops, host);

    expect(res.deposited).toBe(false);
    expect(ops.deposits).toEqual([]);
  });
});

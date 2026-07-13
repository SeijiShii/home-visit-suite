// @vitest-environment node
// CP-B（疎通の実接続証明）: pwa の client-factory から、ローカルで起動した
// Go LinkSelf ノード（link-self/core の poc-wsnode）へ実際に WebSocket 接続し、
// LinkSelf auth → メッセージ echo 往復が成立することを自動検証する。
//
// ブラウザ固有部分（OPFS / crossOriginIsolation）は上流 browser-e2e で実証済み。
// 本テストが潰すのは「この pwa のコード（client-factory + libp2p 配線）から
// 実接続・認証が張れるか」というインフラ残リスク。
//
// 前提: `go` が PATH にあること（無ければ skip）。初回は poc-wsnode の
// コンパイルが走るため beforeAll に余裕を持たせている。
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { multiaddr } from "@multiformats/multiaddr";
import { generateIdentity } from "@linkself/core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLinkSelfClient } from "./client-factory";

const CORE_DIR = fileURLToPath(
  new URL("../../../../../link-self/core", import.meta.url),
);

function hasGo(): boolean {
  try {
    execSync("go version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const goAvailable = hasGo();
const testIf = goAvailable ? it : it.skip;

interface GoNodeInfo {
  role: string;
  did: string;
  wsAddr: string;
}

let goProc: ChildProcess | undefined;
let goNode: GoNodeInfo;

beforeAll(async () => {
  if (!goAvailable) return;
  goProc = spawn("go", ["run", "./cmd/poc-wsnode"], {
    cwd: CORE_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  goNode = await new Promise<GoNodeInfo>((resolve, reject) => {
    let buf = "";
    const t = setTimeout(
      () => reject(new Error("timed out waiting for Go node info")),
      90_000,
    );
    goProc!.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const line = buf.split("\n")[0];
      if (line !== undefined && line.trim() !== "") {
        clearTimeout(t);
        resolve(JSON.parse(line) as GoNodeInfo);
      }
    });
    goProc!.on("error", reject);
  });
}, 120_000);

afterAll(() => {
  goProc?.kill("SIGTERM");
});

testIf(
  "client-factory dials a Go node over WebSocket, authenticates, and echoes",
  async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const identity = await generateIdentity();
    // allowLocalDial: ローカル Go ノード(127.0.0.1)相手のため private 宛 dial を許可。
    const session = await createLinkSelfClient({ identity, allowLocalDial: true });

    const reply = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("echo timeout")), 20_000);
      session.client.node.setOnMessage((_did, payload) => {
        clearTimeout(t);
        resolve(dec.decode(payload));
      });
    });

    await session.client.node.connectToAddr(
      goNode.did,
      multiaddr(goNode.wsAddr),
    );
    await session.client.node.sendMessage(
      goNode.did,
      enc.encode("hello from pwa"),
    );

    const result = await reply;
    await session.stop();

    expect(result).toBe("echo:hello from pwa");
  },
  60_000,
);

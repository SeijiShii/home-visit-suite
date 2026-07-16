// ユーザー鍵をトランスポート鍵にした短命 libp2p 接続でメールボックスへ届く
// MailboxTransport を作る（link-self spec network-invitation.md §7.6）。
//
// メールボックスの fetch/ack は「transport 鍵由来の呼び出し元 DID 宛」に
// スコープされるため、ユーザー DID 宛のロスター封筒はユーザー鍵で接続した
// ときだけ読める（鍵の所有＝転送層認証がそのまま所有証明）。兄弟端末は全員
// ユーザー鍵を持つので、どの端末からでも同じ「抽象レイヤー DID」の箱に届く。
// outbound のみ・リレー予約なしの一往復接続なので、同一 peerId の兄弟が
// 同時にアクセスする衝突窓は実害がない。

import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";
import {
  LinkSelfNode,
  MAILBOX_PROTOCOL_ID,
  type Identity,
  type KnownPeer,
  type MailboxTransport,
} from "@linkself/core";

/**
 * ユーザー identity で常時稼働ノード（リレー兼メールボックス）へ接続し、
 * MailboxTransport を fn に渡して実行、終了後に必ず接続を畳む。
 * リレーの複数アドレスは到達できたものを使う（mailboxRequest と同じ方針）。
 */
export async function withUserMailboxTransport<T>(
  userIdentity: Identity,
  mailboxes: KnownPeer[],
  fn: (transport: MailboxTransport) => Promise<T>,
  allowLocalDial?: boolean,
): Promise<T> {
  const libp2p = await createLibp2p({
    privateKey: userIdentity.privateKey,
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    ...(allowLocalDial
      ? { connectionGater: { denyDialMultiaddr: async () => false } }
      : {}),
  });
  try {
    const node = new LinkSelfNode(libp2p, userIdentity);
    const transport: MailboxTransport = async (requestBytes) => {
      let lastErr: unknown;
      for (const mb of mailboxes) {
        for (const addr of mb.addrs) {
          try {
            return await node.request(
              multiaddr(addr),
              MAILBOX_PROTOCOL_ID,
              requestBytes,
            );
          } catch (err) {
            lastErr = err;
          }
        }
      }
      throw lastErr ?? new Error("no reachable mailbox addr");
    };
    return await fn(transport);
  } finally {
    await libp2p.stop();
  }
}

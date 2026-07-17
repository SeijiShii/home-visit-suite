// 端末ペアリング取り込み画面（`#/pair?d=...`）。
// OS のカメラアプリで QR を撮影、または URL をブラウザに入力して開くと表示される。
// 取り込みはローカル ID の有無と QR の DID の照合で分岐する:
// - 未登録端末: フラグメントの鍵素材から同一 identity を復元して登録する
//   （ID の事前作成は不要。この画面だけで紐づけまで一貫して完了する）
// - 登録済み・同一 DID: 追加登録せず登録済み ID でそのままアプリを開く（冪等）
// - 登録済み・別 DID: 確認のうえ QR の ID へ切り替えて紐づけ直せる（誤って独立 ID を
//   作ってしまった端末の救済。旧 ID のローカルなグループ状態と自己レコードは破棄する）
// - 失敗時: オンボーディング（新規 ID 作成）へは誘導せず、既存端末での QR 再発行を案内する
// 成立時はアプリを再読み込みし、実 identity で LinkSelf を配線し直す（main.tsx bootstrap）。
// 仕様: docs/wants/01_共通基盤.md「端末ペアリング」（URL 方式・冪等性と DID 照合）

import { useEffect, useMemo, useRef, useState } from "react";
import { AppBrand } from "../components/AppBrand";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import { applyPairingExtrasIfMissing } from "../lib/pairing-extras";
import {
  decodePairingPayload,
  extractPairingPayloadParam,
  validatePairing,
  type PairingPayload,
} from "../lib/pairing";

interface PairPageProps {
  /** 取り込み完了（冪等スルー/中止/退避）後にアプリへ遷移させる。 */
  onConsumed: () => void;
  /** 紐づけ成立後の再読み込み（実 identity での LinkSelf 再配線。テストで差し替え可能）。 */
  reloadApp?: () => void;
}

/** 画面状態: 取り込み中 / 別 DID の切替確認 / 失敗。 */
type Phase = "pending" | "conflict" | "error";

export function PairPage({ onConsumed, reloadApp }: PairPageProps) {
  const { t } = useI18n();
  const m = t.pair;
  const { hasIdentity, realDID, currentName, completePairing } = useIdentity();
  const { userRepo } = useServices();
  const [phase, setPhase] = useState<Phase>("pending");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  // QR ペイロード（分岐判定と切替確認の表示用）。期限検証は取り込み時に行う。
  const payload = useMemo<PairingPayload | null>(() => {
    try {
      return decodePairingPayload(
        extractPairingPayloadParam(window.location.hash),
      );
    } catch {
      return null;
    }
  }, []);

  const reload = reloadApp ?? (() => window.location.reload());

  // 鍵素材をフラグメントごと履歴から除去する。
  const cleanUp = () => {
    try {
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#/`,
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!payload) {
      setPhase("error");
      return;
    }
    if (hasIdentity) {
      if (payload.did === realDID) {
        // 冪等: 同一 ID の登録済み端末は追加登録しない。ただし v2 拡張の器
        // （グループ/ロスター）が欠けていれば取り込む——旧版でペアリング済みの
        // 端末は QR 再スキャンが同期収束の入口になる（learnings L-002）。
        const applied = applyPairingExtrasIfMissing(payload);
        cleanUp();
        if (applied) {
          reload();
        } else {
          onConsumed();
        }
      } else {
        // 別 DID: 無条件スルーせず、切り替えるかをユーザーに確認する。
        setPhase("conflict");
      }
      return;
    }
    // 未登録端末: そのまま同一 identity を復元して登録し、再読み込みで配線し直す。
    // 残骸破棄と payload 拡張の適用は completePairing（サービス側）が行う
    //（オンボーディングの手入力貼付経路と共通化）。
    void (async () => {
      try {
        await completePairing(window.location.hash);
        cleanUp();
        reload();
      } catch (e) {
        console.error("pairing failed", e);
        setPhase("error");
      }
    })();
    // 分岐材料（payload/hasIdentity/realDID）は identityReady 後にマウントされるため確定済み。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 登録済み・別 DID: 確認を経て QR の ID へ切り替えて紐づけ直す。 */
  const handleRelink = async () => {
    if (busy) return;
    setBusy(true);
    const oldDid = realDID;
    try {
      // 期限切れ等はここで弾く（後続の deleteUser=旧自己レコードの配送付き削除を
      // 実行してから completePairing が失敗する、を防ぐ）。
      validatePairing(payload!, Date.now());
      // 旧 ID の自己レコードを先に消す（completePairing が旧グループ状態を
      // purge する前＝旧名前空間がまだ生きているうちに行う）。
      try {
        await userRepo.deleteUser(oldDid);
      } catch {
        // ignore
      }
      // 残骸破棄と payload 拡張の適用（新グループ名の器も含む）は
      // completePairing（サービス側）が行う。ここで setGroupName("") を呼ぶと
      // 引き継いだばかりの新グループ名を消してしまうため呼ばない。
      await completePairing(window.location.hash);
      cleanUp();
      reload();
    } catch (e) {
      console.error("relink failed", e);
      setPhase("error");
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <AppBrand />
        <h1 className="onboarding-title">{m.title}</h1>
        {phase === "conflict" && payload ? (
          <>
            <p className="onboarding-subtitle">
              {m.conflictCurrent(currentName || realDID)}
            </p>
            <p className="onboarding-subtitle">
              {m.conflictIncoming(payload.name)}
            </p>
            <p className="onboarding-hint">{m.conflictWarn}</p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleRelink()}
                disabled={busy}
              >
                {busy ? m.pending : m.relink}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  cleanUp();
                  onConsumed();
                }}
                disabled={busy}
              >
                {m.keepCurrent}
              </button>
            </div>
          </>
        ) : phase === "error" ? (
          <>
            <p className="onboarding-error">{m.error}</p>
            <p className="onboarding-hint">{m.reissueHint}</p>
            <div className="onboarding-actions">
              {hasIdentity ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onConsumed}
                >
                  {m.openApp}
                </button>
              ) : (
                <button type="button" className="btn" onClick={onConsumed}>
                  {m.createInstead}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="onboarding-subtitle">{m.pending}</p>
        )}
      </div>
    </div>
  );
}

// AI 地図取込ダイアログ。地図画像をアップロード → 解析 → 下書きレビュー。
// docs/wants/03_地図機能.md「AI による区域地図作成」§入力/§処理フロー/§信頼度による分岐。
//
// 段階: consent（初回同意）→ select（ファイル選択）→ analyzing → result / error。
// high 信頼なら境界ポリゴンを取り込み（onCommit）、low なら手動整列へ誘導する。

import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type {
  AiMapImportService,
  ImportDraft,
} from "../services/ai-map-import";

interface AiMapImportDialogProps {
  importService: AiMapImportService;
  /** 表示用プロバイダ名（同意文言に使う）。 */
  providerName: string;
  /** 画像外部送信への同意が既に得られているか。 */
  consentGiven: boolean;
  /** 同意を永続化する。 */
  onGrantConsent: () => void | Promise<void>;
  /** 高信頼の下書きを地図へ取り込む（境界ポリゴン作成）。件数を返す。 */
  onCommit: (draft: ImportDraft) => number | Promise<number>;
  /** 手動オーバーレイ整列を開始する（低信頼フォールバック）。 */
  onManualAlign?: (file: File, draft: ImportDraft) => void;
  onClose: () => void;
}

type Stage = "consent" | "select" | "analyzing" | "result" | "error";

export function AiMapImportDialog({
  importService,
  providerName,
  consentGiven,
  onGrantConsent,
  onCommit,
  onManualAlign,
  onClose,
}: AiMapImportDialogProps) {
  const { t } = useI18n();
  const ai = t.map.aiImport;
  const [stage, setStage] = useState<Stage>(
    consentGiven ? "select" : "consent",
  );
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [committedMsg, setCommittedMsg] = useState<string>("");

  const handleConsent = async () => {
    await onGrantConsent();
    setStage("select");
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setStage("analyzing");
    setErrorMsg("");
    try {
      const buf = await file.arrayBuffer();
      const result = await importService.buildDraft(buf);
      setDraft(result);
      setStage("result");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  const handleCommit = async () => {
    if (!draft) return;
    const n = await onCommit(draft);
    setCommittedMsg(ai.committed(n));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ai-import-dialog"
        role="dialog"
        aria-label={ai.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{ai.title}</h3>

        {stage === "consent" && (
          <div className="ai-import-body">
            <h4 className="ai-import-subtitle">{ai.consentTitle}</h4>
            <p className="ai-import-note">{ai.consentBody(providerName)}</p>
            <div className="modal-actions">
              <button className="btn btn-sm" onClick={onClose}>
                {ai.cancel}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleConsent()}
              >
                {ai.consentAgree}
              </button>
            </div>
          </div>
        )}

        {stage === "select" && (
          <div className="ai-import-body">
            <label className="settings-field-label" htmlFor="ai-import-file">
              {ai.selectFile}
            </label>
            <input
              id="ai-import-file"
              className="settings-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="modal-actions">
              <button className="btn btn-sm" onClick={onClose}>
                {ai.cancel}
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!file}
                onClick={() => void handleAnalyze()}
              >
                {ai.analyze}
              </button>
            </div>
          </div>
        )}

        {stage === "analyzing" && (
          <div className="ai-import-body">
            <p role="status">{ai.analyzing}</p>
          </div>
        )}

        {stage === "error" && (
          <div className="ai-import-body">
            <h4 className="ai-import-subtitle">{ai.errorTitle}</h4>
            <p className="ai-import-error">{errorMsg}</p>
            <div className="modal-actions">
              <button className="btn btn-sm" onClick={onClose}>
                {ai.close}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setStage("select")}
              >
                {ai.retry}
              </button>
            </div>
          </div>
        )}

        {stage === "result" && draft && (
          <div className="ai-import-body">
            <h4 className="ai-import-subtitle">{ai.resultTitle}</h4>
            <p
              className={
                draft.confidence === "high"
                  ? "ai-import-confidence-high"
                  : "ai-import-confidence-low"
              }
            >
              {draft.confidence === "high"
                ? ai.confidenceHigh
                : ai.confidenceLow}
            </p>
            {draft.areaGuess && (
              <p className="ai-import-note">
                {ai.areaGuess}: {draft.areaGuess}
              </p>
            )}
            <ul className="ai-import-summary">
              <li>{ai.polygonCount(draft.polygons.length)}</li>
              <li>{ai.placeCount(draft.places.length)}</li>
            </ul>
            {draft.unmatchedLandmarks.length > 0 && (
              <div className="ai-import-unmatched">
                <span className="settings-field-label">
                  {ai.unmatchedTitle}
                </span>
                <ul>
                  {draft.unmatchedLandmarks.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.confidence === "high" ? (
              <>
                {draft.places.length > 0 && (
                  <p className="ai-import-note">{ai.placesDeferredNote}</p>
                )}
                {committedMsg ? (
                  <p className="settings-msg" role="status">
                    {committedMsg}
                  </p>
                ) : null}
                <div className="modal-actions">
                  <button className="btn btn-sm" onClick={onClose}>
                    {ai.close}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={
                      committedMsg !== "" || draft.polygons.length === 0
                    }
                    onClick={() => void handleCommit()}
                  >
                    {ai.commit}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="ai-import-note">{ai.lowConfidenceHelp}</p>
                <div className="modal-actions">
                  <button className="btn btn-sm" onClick={onClose}>
                    {ai.close}
                  </button>
                  {onManualAlign && file && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onManualAlign(file, draft)}
                    >
                      {ai.manualAlign}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

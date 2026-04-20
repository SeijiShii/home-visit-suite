import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import {
  VISIT_RESULTS,
  visitResultRequiresApplication,
  type VisitRecord,
  type VisitResult,
} from "../services/visit-service";

export interface VisitRecordSaveArgs {
  result: VisitResult;
  visitedAt: Date;
  note: string;
  applicationText: string;
}

export interface VisitRecordDialogProps {
  placeLabel: string;
  placeAddress: string;
  placeId: string;
  /** ネットワーク全体での最近「会えた」日時（無ければ null） */
  lastMetDate: Date | null;
  /** 自分の訪問履歴（時系列降順を期待） */
  myHistory: readonly VisitRecord[];
  onSave: (args: VisitRecordSaveArgs) => void;
  onCancel: () => void;
  /** 「場所情報の修正を申請」テキスト送信時 */
  onPlaceModifyRequest: (text: string) => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ONE_MONTH_DAYS = 30;
const SIX_MONTHS_DAYS = 182;

function lastMetClass(date: Date | null): string {
  if (!date) return "";
  const days = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
  if (days <= ONE_MONTH_DAYS) return "last-met-recent";
  if (days <= SIX_MONTHS_DAYS) return "last-met-mid";
  return "last-met-old";
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function visitResultLabel(
  r: VisitResult,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (r) {
    case "met":
      return t.visitRecord.resultMet;
    case "absent":
      return t.visitRecord.resultAbsent;
    case "vacant_possible":
      return t.visitRecord.resultVacantPossible;
    case "vacant_abandoned":
      return t.visitRecord.resultVacantAbandoned;
    case "refused":
      return t.visitRecord.resultRefused;
  }
}

export function VisitRecordDialog({
  placeLabel,
  placeAddress,
  lastMetDate,
  myHistory,
  onSave,
  onCancel,
  onPlaceModifyRequest,
}: VisitRecordDialogProps) {
  const { t } = useI18n();
  const [result, setResult] = useState<VisitResult>("met");
  const [visitedAtStr, setVisitedAtStr] = useState<string>(() =>
    toDatetimeLocal(new Date()),
  );
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // 申請を伴うステータス選択時のテキスト入力フロー
  const [pendingApplicationResult, setPendingApplicationResult] =
    useState<VisitResult | null>(null);
  const [applicationText, setApplicationText] = useState("");

  // 場所情報修正申請ダイアログ
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyText, setModifyText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const lastMetClassName = useMemo(() => lastMetClass(lastMetDate), [lastMetDate]);

  const handleResultChange = (next: VisitResult) => {
    if (visitResultRequiresApplication(next)) {
      // 申請を伴うステータス: 一旦選択を保留してテキスト入力ダイアログを開く
      setPendingApplicationResult(next);
      setResult(next);
      setApplicationText("");
      return;
    }
    setResult(next);
  };

  const cancelApplication = () => {
    // 申請キャンセル: 選択を met に戻す
    setPendingApplicationResult(null);
    setResult("met");
    setApplicationText("");
  };

  const confirmApplication = () => {
    // 申請内容を含めて保存
    if (applicationText.trim().length === 0) return;
    setPendingApplicationResult(null);
    onSave({
      result,
      visitedAt: new Date(visitedAtStr),
      note,
      applicationText: applicationText,
    });
  };

  const handleSave = () => {
    if (visitResultRequiresApplication(result)) {
      // 申請ステータスで普通の保存ボタンを押した場合は申請ダイアログをまだ開く
      setPendingApplicationResult(result);
      return;
    }
    onSave({
      result,
      visitedAt: new Date(visitedAtStr),
      note,
      applicationText: "",
    });
  };

  const submitModify = () => {
    if (modifyText.trim().length === 0) return;
    onPlaceModifyRequest(modifyText);
    setModifyOpen(false);
    setModifyText("");
  };

  return (
    <form
      role="dialog"
      aria-label={t.visitRecord.dialogTitle}
      className="visit-record-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <header className="visit-record-dialog-header">
        <h3>{placeLabel}</h3>
        {placeAddress && <p>{placeAddress}</p>}
        <p
          data-testid="last-met-date"
          className={`visit-record-last-met ${lastMetClassName}`}
        >
          <span>{t.visitRecord.lastMetLabel}: </span>
          {lastMetDate ? (
            <span>
              {formatDate(lastMetDate)}
              {t.visitRecord.lastMetSuffix}
            </span>
          ) : (
            <span>{t.visitRecord.lastMetNone}</span>
          )}
        </p>
      </header>

      <label className="visit-record-field">
        <span>{t.visitRecord.visitedAtLabel}</span>
        <input
          type="datetime-local"
          value={visitedAtStr}
          onChange={(e) => setVisitedAtStr(e.target.value)}
        />
      </label>

      <label className="visit-record-field">
        <span>{t.visitRecord.resultLabel}</span>
        <select
          value={result}
          onChange={(e) => handleResultChange(e.target.value as VisitResult)}
        >
          {VISIT_RESULTS.map((r) => (
            <option key={r} value={r}>
              {visitResultLabel(r, t)}
            </option>
          ))}
        </select>
      </label>

      <label className="visit-record-field">
        <span>{t.visitRecord.noteLabel}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.visitRecord.notePlaceholder}
          rows={3}
        />
      </label>

      <section className="visit-record-history">
        <button
          type="button"
          className="visit-record-history-toggle"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
        >
          {t.visitRecord.historyToggle} ({myHistory.length})
        </button>
        {historyOpen && (
          <div className="visit-record-history-list">
            {myHistory.length === 0 ? (
              <p>{t.visitRecord.historyNone}</p>
            ) : (
              <ul>
                {myHistory.map((h) => (
                  <li key={h.id} data-testid="history-row">
                    {formatDate(new Date(h.visitedAt))} —{" "}
                    {visitResultLabel(h.result, t)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!historyOpen && myHistory.length === 0 && (
          <p className="visit-record-history-empty">
            {t.visitRecord.historyNone}
          </p>
        )}
      </section>

      <div className="visit-record-actions">
        <button
          type="button"
          className="visit-record-cancel"
          onClick={onCancel}
        >
          {t.areaDetail.cancel}
        </button>
        <button type="submit" className="visit-record-save">
          {t.areaDetail.save}
        </button>
      </div>

      <button
        type="button"
        className="visit-record-modify-request"
        onClick={() => setModifyOpen(true)}
      >
        {t.visitRecord.placeModifyRequestButton}
      </button>

      {pendingApplicationResult && (
        <div
          role="dialog"
          aria-label={t.visitRecord.applicationDialogTitle}
          className="visit-record-application-dialog"
        >
          <h4>{t.visitRecord.applicationDialogTitle}</h4>
          <label>
            <span>{t.visitRecord.applicationTextLabel}</span>
            <textarea
              value={applicationText}
              onChange={(e) => setApplicationText(e.target.value)}
              placeholder={t.visitRecord.applicationTextPlaceholder}
              rows={4}
              autoFocus
            />
          </label>
          <div className="visit-record-application-actions">
            <button type="button" onClick={cancelApplication}>
              {t.visitRecord.applicationCancel}
            </button>
            <button
              type="button"
              onClick={confirmApplication}
              disabled={applicationText.trim().length === 0}
            >
              {t.visitRecord.applicationConfirmSave}
            </button>
          </div>
        </div>
      )}

      {modifyOpen && (
        <div
          role="dialog"
          aria-label={t.visitRecord.placeModifyDialogTitle}
          className="visit-record-modify-dialog"
        >
          <h4>{t.visitRecord.placeModifyDialogTitle}</h4>
          <label>
            <span>{t.visitRecord.placeModifyTextLabel}</span>
            <textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              placeholder={t.visitRecord.placeModifyTextPlaceholder}
              rows={4}
              autoFocus
            />
          </label>
          <div className="visit-record-modify-actions">
            <button type="button" onClick={() => setModifyOpen(false)}>
              {t.areaDetail.cancel}
            </button>
            <button
              type="button"
              onClick={submitModify}
              disabled={modifyText.trim().length === 0}
            >
              {t.visitRecord.placeModifySubmit}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

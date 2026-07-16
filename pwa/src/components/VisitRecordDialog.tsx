import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { lastVisitColorClass } from "../lib/visit-date-color";
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

/**
 * 編集リクエストの種別。
 * 仕様 docs/wants/07_通知と申請.md「場所操作の権限 / 申請種別」
 * - delete: 要削除（place_delete）
 * - move: 要移動（place_move）
 * - other: その他（place_info_modify、既定）
 */
export type PlaceEditRequestKind = "delete" | "move" | "other";

export const PLACE_EDIT_REQUEST_KINDS: readonly PlaceEditRequestKind[] = [
  "other",
  "move",
  "delete",
] as const;

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
  /**
   * 「編集をリクエスト」送信時。種別（要削除/要移動/その他）と詳細テキスト。
   * 仕様 docs/wants/07_通知と申請.md「場所操作の権限 / 申請種別」
   */
  onPlaceEditRequest: (kind: PlaceEditRequestKind, text: string) => void;
  /**
   * 読み取り専用モード。仕様 docs/wants/05_チェックアウト.md「アクセスモード」:
   *   入力エリアを表示せず、参考情報（場所名 / 最近会えた / 履歴）のみ表示する。
   *   保存ボタンは出さない。編集リクエストボタンは引き続き有効（仕様 Q15）。
   */
  readOnly?: boolean;
  /** 読み取り専用時のヒントメッセージ（区域 read-only / 場所 read-only で文言が異なる） */
  readOnlyHint?: string;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function editKindLabel(
  kind: PlaceEditRequestKind,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (kind) {
    case "delete":
      return t.visitRecord.placeEditKindDelete;
    case "move":
      return t.visitRecord.placeEditKindMove;
    case "other":
      return t.visitRecord.placeEditKindOther;
  }
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
  onPlaceEditRequest,
  readOnly = false,
  readOnlyHint,
}: VisitRecordDialogProps) {
  const { t } = useI18n();
  // 初期値は「留守」: 多くの訪問が留守で終わる実態と、最も無害なネットワーク共有値であることから既定とする
  const [result, setResult] = useState<VisitResult>("absent");
  const [visitedAtStr, setVisitedAtStr] = useState<string>(() =>
    toDatetimeLocal(new Date()),
  );
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // 申請を伴うステータス選択時のテキスト入力フロー
  const [pendingApplicationResult, setPendingApplicationResult] =
    useState<VisitResult | null>(null);
  const [applicationText, setApplicationText] = useState("");

  // 編集リクエスト（要削除/要移動/その他）ダイアログ
  const [editOpen, setEditOpen] = useState(false);
  const [editKind, setEditKind] = useState<PlaceEditRequestKind>("other");
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const lastMetClassName = useMemo(
    () => lastVisitColorClass(lastMetDate),
    [lastMetDate],
  );

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
    // 申請キャンセル: 選択を既定値（留守）に戻す
    setPendingApplicationResult(null);
    setResult("absent");
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

  const openEdit = () => {
    setEditKind("other");
    setEditText("");
    setEditOpen(true);
  };

  // 詳細テキストは原則必須。要削除のみ任意（仕様 docs/wants/08「編集をリクエスト」）
  const editTextRequired = editKind !== "delete";

  const submitEdit = () => {
    if (editTextRequired && editText.trim().length === 0) return;
    onPlaceEditRequest(editKind, editText.trim());
    setEditOpen(false);
    setEditText("");
  };

  return (
    <div className="dialog-backdrop">
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

        {readOnly ? (
          <p className="visit-record-readonly-hint" role="note">
            {readOnlyHint ?? t.visitRecord.placeReadOnlyHint}
          </p>
        ) : (
          <>
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
                onChange={(e) =>
                  handleResultChange(e.target.value as VisitResult)
                }
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
          </>
        )}

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
            {readOnly ? t.visitRecord.close : t.areaDetail.cancel}
          </button>
          {!readOnly && (
            <button type="submit" className="visit-record-save">
              {t.areaDetail.save}
            </button>
          )}
        </div>

        <button
          type="button"
          className="visit-record-edit-request"
          onClick={openEdit}
        >
          {t.visitRecord.placeEditRequestButton}
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

        {editOpen && (
          <div
            role="dialog"
            aria-label={t.visitRecord.placeEditDialogTitle}
            className="visit-record-edit-dialog"
          >
            <h4>{t.visitRecord.placeEditDialogTitle}</h4>
            <label className="visit-record-edit-field">
              <span>{t.visitRecord.placeEditKindLabel}</span>
              <select
                value={editKind}
                onChange={(e) =>
                  setEditKind(e.target.value as PlaceEditRequestKind)
                }
              >
                {PLACE_EDIT_REQUEST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {editKindLabel(k, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="visit-record-edit-field">
              <span>
                {t.visitRecord.placeEditTextLabel}
                {!editTextRequired && <>（{t.areaDetail.addPlaceOptional}）</>}
              </span>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder={t.visitRecord.placeEditTextPlaceholder}
                rows={4}
                autoFocus
              />
            </label>
            <div className="visit-record-edit-actions">
              <button type="button" onClick={() => setEditOpen(false)}>
                {t.areaDetail.cancel}
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={editTextRequired && editText.trim().length === 0}
              >
                {t.visitRecord.placeEditSubmit}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

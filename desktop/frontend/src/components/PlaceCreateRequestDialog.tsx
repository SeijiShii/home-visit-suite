import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";

/** 場所作成申請の種別。仕様 docs/wants/08_活動メンバー向けアプリ.md「場所作成申請ダイアログ」 */
export type PlaceCreateRequestKind = "house" | "building" | "other";

export interface PlaceCreateRequestSaveArgs {
  kind: PlaceCreateRequestKind;
  lat: number;
  lng: number;
  text: string;
}

export interface PlaceCreateRequestDialogProps {
  /** ロングタップ位置（必須） */
  lat: number;
  lng: number;
  onSave: (args: PlaceCreateRequestSaveArgs) => void;
  onCancel: () => void;
}

const KINDS: readonly PlaceCreateRequestKind[] = [
  "house",
  "building",
  "other",
] as const;

function kindLabel(
  kind: PlaceCreateRequestKind,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (kind) {
    case "house":
      return t.visitRecord.placeCreateRequestKindHouse;
    case "building":
      return t.visitRecord.placeCreateRequestKindBuilding;
    case "other":
      return t.visitRecord.placeCreateRequestKindOther;
  }
}

export function PlaceCreateRequestDialog({
  lat,
  lng,
  onSave,
  onCancel,
}: PlaceCreateRequestDialogProps) {
  const { t } = useI18n();
  const [kind, setKind] = useState<PlaceCreateRequestKind>("house");
  const [text, setText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSave = text.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({ kind, lat, lng, text });
  };

  return (
    <form
      role="dialog"
      aria-label={t.visitRecord.placeCreateRequestTitle}
      className="place-create-request-dialog"
      onSubmit={handleSubmit}
    >
      <h3>{t.visitRecord.placeCreateRequestTitle}</h3>

      <label className="place-create-request-field">
        <span>{t.visitRecord.placeCreateRequestKindLabel}</span>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as PlaceCreateRequestKind)
          }
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k, t)}
            </option>
          ))}
        </select>
      </label>

      <p className="place-create-request-coord">
        <span>{t.visitRecord.placeCreateRequestCoordLabel}: </span>
        <span>
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
      </p>

      <label className="place-create-request-field">
        <span>{t.visitRecord.placeCreateRequestTextLabel}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.visitRecord.placeCreateRequestTextPlaceholder}
          rows={4}
          autoFocus
        />
      </label>

      <div className="place-create-request-actions">
        <button type="button" onClick={onCancel}>
          {t.areaDetail.cancel}
        </button>
        <button type="submit" disabled={!canSave}>
          {t.visitRecord.placeCreateRequestSubmit}
        </button>
      </div>
    </form>
  );
}

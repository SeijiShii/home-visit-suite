import { useI18n } from '../contexts/I18nContext';

export function RequestsPage() {
  const { t } = useI18n();
  const r = t.requests;

  return (
    <>
      <h1>{r.title}</h1>
      <section>
        <h2>{r.pending}</h2>
        <p>{r.noPending}</p>
      </section>
      <section>
        <h2>{r.resolved}</h2>
        <p>{r.noResolved}</p>
      </section>
    </>
  );
}

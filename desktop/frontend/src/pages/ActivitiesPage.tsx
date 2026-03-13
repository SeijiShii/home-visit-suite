import { useI18n } from '../contexts/I18nContext';

export function ActivitiesPage() {
  const { t } = useI18n();
  const a = t.activities;

  return (
    <>
      <h1>{a.title}</h1>
      <section>
        <h2>{a.active}</h2>
        <p>{a.noActive}</p>
      </section>
      <section>
        <h2>{a.completed}</h2>
        <p>{a.noCompleted}</p>
      </section>
    </>
  );
}

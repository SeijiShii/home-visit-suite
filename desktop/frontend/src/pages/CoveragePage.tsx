import { useI18n } from '../contexts/I18nContext';

export function CoveragePage() {
  const { t } = useI18n();
  const c = t.coverage;

  return (
    <>
      <h1>{c.title}</h1>
      <section>
        <h2>{c.progress}</h2>
        <p>{c.noData}</p>
      </section>
      <section>
        <h2>{c.plans}</h2>
        <p>{c.noPlans}</p>
      </section>
    </>
  );
}

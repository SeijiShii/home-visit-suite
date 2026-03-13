import { useI18n } from '../contexts/I18nContext';

export function DashboardPage() {
  const { t } = useI18n();
  const d = t.dashboard;

  return (
    <>
      <h1>{d.title}</h1>
      <section>
        <h2>{d.notifications}</h2>
        <p>{d.noNotifications}</p>
      </section>
      <section>
        <h2>{d.assignedAreas}</h2>
        <p>{d.noAssignedAreas}</p>
      </section>
    </>
  );
}

import { useI18n } from '../contexts/I18nContext';

export function UsersPage() {
  const { t } = useI18n();
  const u = t.users;

  return (
    <>
      <h1>{u.title}</h1>
      <section>
        <h2>{u.members}</h2>
        <p>{u.noMembers}</p>
      </section>
      <section>
        <h2>{u.groups}</h2>
        <p>{u.noGroups}</p>
      </section>
    </>
  );
}

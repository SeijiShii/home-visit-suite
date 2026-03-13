import { HashRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './contexts/I18nContext';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { MapPage } from './pages/MapPage';
import { UsersPage } from './pages/UsersPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { CoveragePage } from './pages/CoveragePage';
import { RequestsPage } from './pages/RequestsPage';

export function App() {
  return (
    <HashRouter>
      <I18nProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="coverage" element={<CoveragePage />} />
            <Route path="requests" element={<RequestsPage />} />
          </Route>
        </Routes>
      </I18nProvider>
    </HashRouter>
  );
}

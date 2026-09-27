/** Finestra principale: mostra la vista di import e poi la dashboard (port di gui/app.py). */

import { useState } from 'react';
import { buildDashboardModel, type DashboardModel } from './core/dashboard';
import type { WarReport } from './core/models';
import { DashboardView } from './components/DashboardView';
import { ImportView } from './components/ImportView';
import { PortraitFilters } from './components/UnitPortrait';

export function App() {
  const [dashboard, setDashboard] = useState<DashboardModel | null>(null);

  const showDashboard = (report: WarReport) => {
    try {
      setDashboard(buildDashboardModel(report));
      window.scrollTo(0, 0);
    } catch (e) {
      // Come nell'originale: se la costruzione della dashboard fallisce resta la schermata di import
      console.error(e);
    }
  };

  return (
    <>
      <PortraitFilters />
      {dashboard ? <DashboardView model={dashboard} /> : <ImportView onImportSuccess={showDashboard} />}
    </>
  );
}

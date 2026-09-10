import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LoginScreen } from './screens/LoginScreen';
import { TimetableScreen } from './screens/TimetableScreen';
import { AbsencesScreen } from './screens/AbsencesScreen';
import { ExamsScreen } from './screens/ExamsScreen';
import { AppointmentsScreen } from './screens/AppointmentsScreen';
import { ProfileScreen } from './screens/ProfileScreen';

/**
 * HashRouter statt BrowserRouter: die Produktions-Auslieferung läuft über einen
 * simplen World4you-Webspace ohne SPA-Rewrite-Konfiguration (siehe PLAN.md/IDEEN.md B1).
 * Mit Hash-Routing (#/timetable statt /timetable) braucht der Server keine spezielle
 * Fallback-Regel für tiefe Links — jede URL landet ohnehin auf derselben index.html.
 */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route element={<AppShell />}>
          <Route path="/timetable" element={<TimetableScreen />} />
          <Route path="/absences" element={<AbsencesScreen />} />
          <Route path="/exams" element={<ExamsScreen />} />
          <Route path="/appointments" element={<AppointmentsScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/timetable" replace />} />
      </Routes>
    </HashRouter>
  );
}

import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useSessionStore } from '../state/sessionStore';
import { Button } from './components/Button';
import { ThemeToggle } from './components/ThemeToggle';

const NAV_ITEMS = [
  // "?resetToToday=1": springt beim Klick zurück zu heute, auch wenn man auf /timetable
  // bereits zu einem anderen Datum navigiert hat (Nutzerwunsch 2026-09-17) — siehe
  // TimetableScreen.tsx, das den Parameter liest und sofort wieder entfernt.
  { to: '/timetable?resetToToday=1', label: 'Stundenplan' },
  { to: '/absences', label: 'Abwesenheiten' },
  { to: '/exams', label: 'Prüfungen' },
  { to: '/settings', label: 'Einstellungen' },
];

/** Layout für alle angemeldeten Screens. Leitet unangemeldete Nutzer zum Login um. */
export function AppShell() {
  const status = useSessionStore((s) => s.status);
  const logout = useSessionStore((s) => s.logout);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-base font-semibold">BetterWebUntis</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button variant="ghost" onClick={() => void logout()}>
            Abmelden
          </Button>
        </div>
      </header>

      <nav aria-label="Hauptnavigation" className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}

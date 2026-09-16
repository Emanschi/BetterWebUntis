import { resolvesToDark, useThemeStore } from '../../state/themeStore';

/**
 * Einfacher Umschalter zwischen Hell und Dunkel — ein Icon, ein Klick.
 *
 * Beim allerersten Laden richtet sich die Seite weiterhin automatisch nach der
 * Systemeinstellung (siehe `themeStore.ts`, Startwert "system" + prefers-color-scheme
 * in index.css). Sobald hier geklickt wird, ist die Wahl explizit hell/dunkel — kein
 * separates "System"-Icon mehr, das laut Rückmeldung nur verwirrt hat.
 */
export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const isDark = resolvesToDark(preference);

  return (
    <button
      type="button"
      onClick={() => setPreference(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
      title={isDark ? 'Helles Design' : 'Dunkles Design'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-base transition-colors hover:bg-surface-hover"
    >
      <span aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
    </button>
  );
}

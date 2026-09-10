import { useThemeStore, type ThemePreference } from '../../state/themeStore';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'system', label: 'System', icon: '💻' },
  { value: 'light', label: 'Hell', icon: '☀️' },
  { value: 'dark', label: 'Dunkel', icon: '🌙' },
];

export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <div role="group" aria-label="Design" className="inline-flex rounded-lg border border-border p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setPreference(option.value)}
          aria-pressed={preference === option.value}
          title={option.label}
          className={`rounded-md px-2 py-1 text-sm transition-colors ${
            preference === option.value ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover'
          }`}
        >
          <span aria-hidden="true">{option.icon}</span>
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

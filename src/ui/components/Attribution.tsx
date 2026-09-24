const EMANSCHIGAMES_URL = 'https://emanschigames.com';

interface AttributionProps {
  className?: string;
}

/** Credit-Link zur Hauptwebseite des Entwicklers — in LoginScreen und AppShell verwendet. */
export function Attribution({ className = '' }: AttributionProps) {
  return (
    <a
      href={EMANSCHIGAMES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-fg-muted hover:text-fg hover:underline ${className}`}
    >
      Created by EmanschiGames
    </a>
  );
}

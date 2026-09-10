import { Card } from '../components/Card';

interface StubScreenProps {
  title: string;
  milestone: string;
  description: string;
}

/** Platzhalter für Screens, deren Inhalt in einem späteren Meilenstein folgt (siehe PLAN.md). */
export function StubScreen({ title, milestone, description }: StubScreenProps) {
  return (
    <Card className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-lg font-semibold text-fg">{title}</h1>
      <p className="text-sm text-fg-muted">{description}</p>
      <p className="mt-4 text-xs text-fg-muted">Kommt in {milestone} — siehe PLAN.md.</p>
    </Card>
  );
}

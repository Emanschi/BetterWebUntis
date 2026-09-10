import { useSessionStore } from '../../state/sessionStore';
import { PersonType } from '../../api/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

function personTypeLabel(personType: PersonType | undefined): string {
  if (personType === PersonType.TEACHER) return 'Lehrer:in';
  if (personType === PersonType.STUDENT) return 'Schüler:in';
  return 'Unbekannt';
}

export function ProfileScreen() {
  const username = useSessionStore((s) => s.username);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);
  const school = useSessionStore((s) => s.school);
  const logout = useSessionStore((s) => s.logout);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <h1 className="mb-4 text-lg font-semibold text-fg">Profil</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-fg-muted">Benutzername</dt>
          <dd className="text-fg">{username ?? '—'}</dd>
          <dt className="text-fg-muted">Rolle</dt>
          <dd className="text-fg">{personTypeLabel(personType)}</dd>
          <dt className="text-fg-muted">Schule</dt>
          <dd className="text-fg">{school}</dd>
          <dt className="text-fg-muted">Personen-Id</dt>
          <dd className="text-fg">{personId ?? '—'}</dd>
        </dl>
        <Button variant="danger" className="mt-6" onClick={() => void logout()}>
          Abmelden
        </Button>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-fg">Kontaktdaten & Passwort</h2>
        <p className="text-sm text-fg-muted">
          Die WebUntis JSON-RPC-API (2018) bietet keine Methode, um Kontaktdaten oder das
          Passwort zu ändern — nur die Original-WebUntis-Website kann das. Details und Optionen
          stehen in IDEEN.md (A2, A3).
        </p>
      </Card>
    </div>
  );
}

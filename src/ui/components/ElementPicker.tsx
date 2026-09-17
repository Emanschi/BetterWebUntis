import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { ElementType } from '../../api/types';
import { timetablePathFor } from '../elementRoutes';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

interface NamedEntity {
  id: number;
  name: string;
  longName: string;
}

/**
 * Auswahl "welchen Stundenplan ansehen" (Doku Abschnitt 5, `getKlassen`) — nur Klassen.
 * Lehrer-/Fach-/Raum-Suche bewusst entfernt (Nutzerwunsch 2026-09-17, siehe IDEEN.md):
 * nur der Klassenwechsel war gewollt.
 */
export function ElementPicker({ onSelect }: { onSelect?: () => void }) {
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const client = useSessionStore((s) => s.client);

  const query = useQuery<NamedEntity[]>({
    queryKey: ['element-picker', 'klasse'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getKlassen(client);
    },
  });

  const filtered = useMemo(() => {
    const list = query.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (needle === '') return list;
    return list.filter(
      (entity) => entity.name.toLowerCase().includes(needle) || entity.longName.toLowerCase().includes(needle),
    );
  }, [query.data, filter]);

  function select(id: number) {
    navigate(timetablePathFor(ElementType.KLASSE, id));
    onSelect?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Klasse suchen…"
        aria-label="Klasse suchen"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
      />

      {query.isPending && <Spinner label="Klassen werden geladen…" />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 && <li className="text-sm text-fg-muted">Keine Treffer.</li>}
          {filtered.map((entity) => (
            <li key={entity.id}>
              <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => select(entity.id)}>
                <span className="font-medium">{entity.name}</span>
                {entity.longName !== entity.name && <span className="ml-2 text-fg-muted">{entity.longName}</span>}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

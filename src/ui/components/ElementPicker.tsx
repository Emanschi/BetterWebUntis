import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPE_SEGMENTS, timetablePathFor, type ElementTypeSegment } from '../elementRoutes';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

interface NamedEntity {
  id: number;
  name: string;
  longName: string;
}

const TABS: ElementTypeSegment[] = ['klasse', 'lehrer', 'fach', 'raum'];

function useEntitiesForTab(segment: ElementTypeSegment) {
  const client = useSessionStore((s) => s.client);

  return useQuery<NamedEntity[]>({
    queryKey: ['element-picker', segment],
    enabled: client !== null,
    queryFn: async () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      switch (segment) {
        case 'klasse':
          return api.getKlassen(client);
        case 'lehrer':
          return (await api.getTeachers(client)).map((t) => ({ id: t.id, name: t.name, longName: t.longName }));
        case 'fach':
          return api.getSubjects(client);
        case 'raum':
          return api.getRooms(client);
      }
    },
  });
}

/**
 * Auswahl "welchen Stundenplan ansehen" (Doku Abschnitt 5 für getKlassen, plus
 * getTeachers/getSubjects/getRooms). Entspricht dem Klassen-/Lehrerwechsel der
 * Original-App (Projektauftrag, Pflichtfunktion 3).
 */
export function ElementPicker({ onSelect }: { onSelect?: () => void }) {
  const [tab, setTab] = useState<ElementTypeSegment>('klasse');
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const query = useEntitiesForTab(tab);

  const filtered = useMemo(() => {
    const list = query.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (needle === '') return list;
    return list.filter(
      (entity) => entity.name.toLowerCase().includes(needle) || entity.longName.toLowerCase().includes(needle),
    );
  }, [query.data, filter]);

  function select(id: number) {
    navigate(timetablePathFor(ELEMENT_TYPE_SEGMENTS[tab], id));
    onSelect?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Elementtyp" className="flex gap-1 rounded-lg border border-border p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover'
            }`}
          >
            {ELEMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`${ELEMENT_TYPE_LABELS[tab]} suchen…`}
        aria-label={`${ELEMENT_TYPE_LABELS[tab]} suchen`}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
      />

      {query.isPending && <Spinner label={`${ELEMENT_TYPE_LABELS[tab]}n werden geladen…`} />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 && <li className="text-sm text-fg-muted">Keine Treffer.</li>}
          {filtered.map((entity) => (
            <li key={entity.id}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => select(entity.id)}
              >
                <span className="font-medium">{entity.name}</span>
                {entity.longName !== entity.name && (
                  <span className="ml-2 text-fg-muted">{entity.longName}</span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

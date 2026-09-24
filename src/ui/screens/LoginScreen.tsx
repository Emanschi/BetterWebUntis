import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, type StoredSchool } from '../../state/sessionStore';
import { restApi } from '../../api/index';
import type { SchoolSearchResult } from '../../api/schoolSearchRest';
import { Attribution } from '../components/Attribution';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';

type SearchStatus = 'idle' | 'searching' | 'error';

/** Ab wie vielen Zeichen die Schulsuche losgeht — verhindert eine Anfrage pro Tastendruck bei 1 Zeichen. */
const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 400;

export function LoginScreen() {
  const status = useSessionStore((s) => s.status);
  const errorMessage = useSessionStore((s) => s.errorMessage);
  const storedSchool = useSessionStore((s) => s.school);
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();

  const [schoolQuery, setSchoolQuery] = useState(storedSchool?.displayName ?? '');
  const [selectedSchool, setSelectedSchool] = useState<StoredSchool | null>(storedSchool);
  const [searchResults, setSearchResults] = useState<SchoolSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [showSelectSchoolHint, setShowSelectSchoolHint] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') navigate('/timetable', { replace: true });
  }, [status, navigate]);

  // Schulsuche: per Tastendruck debounced. Ist bereits eine Schule ausgewaehlt und der Text
  // seither unveraendert (genau der Fall direkt nach einem Klick auf ein Suchergebnis, das
  // schoolQuery selbst setzt), wird nicht erneut gesucht.
  useEffect(() => {
    if (selectedSchool !== null && schoolQuery === selectedSchool.displayName) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }

    const term = schoolQuery.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }

    setSearchStatus('searching');
    const timer = setTimeout(() => {
      void restApi
        .searchSchools(term)
        .then((results) => {
          setSearchResults(results);
          setSearchStatus('idle');
        })
        .catch(() => {
          setSearchResults([]);
          setSearchStatus('error');
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [schoolQuery, selectedSchool]);

  function handleSchoolInputChange(value: string) {
    setSchoolQuery(value);
    setShowSelectSchoolHint(false);
    if (selectedSchool !== null && value !== selectedSchool.displayName) {
      setSelectedSchool(null);
    }
  }

  function handleSelectResult(result: SchoolSearchResult) {
    setSelectedSchool({ server: result.server, loginName: result.loginName, displayName: result.displayName });
    setSchoolQuery(result.displayName);
    setSearchResults([]);
    setShowSelectSchoolHint(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSchool === null) {
      setShowSelectSchoolHint(true);
      return;
    }
    void login(selectedSchool, user, password, remember);
  }

  const authenticating = status === 'authenticating';
  const showResults = selectedSchool === null && searchResults.length > 0;
  const showNoResults =
    selectedSchool === null &&
    searchStatus === 'idle' &&
    searchResults.length === 0 &&
    schoolQuery.trim().length >= MIN_SEARCH_LENGTH;

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-bg bg-cover bg-center p-6"
      style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(/login-bg.webp)' }}
    >
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-fg">BetterWebUntis</h1>
        <Attribution className="mb-3 block text-xs" />
        <p className="mb-6 text-sm text-fg-muted">Melde dich mit deinem WebUntis-Konto an.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="relative flex flex-col gap-1.5">
            <TextField
              label="Schule"
              name="school"
              value={schoolQuery}
              onChange={(e) => handleSchoolInputChange(e.target.value)}
              placeholder="Name oder Ort deiner Schule"
              autoComplete="off"
              required
            />

            {searchStatus === 'searching' && <p className="text-xs text-fg-muted">Suche…</p>}
            {searchStatus === 'error' && (
              <p role="alert" className="text-xs text-danger">
                Schulsuche fehlgeschlagen. Bitte erneut versuchen.
              </p>
            )}
            {showNoResults && <p className="text-xs text-fg-muted">Keine Schule gefunden.</p>}

            {showResults && (
              <ul className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {searchResults.map((result) => (
                  <li key={`${result.server}-${result.loginName}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectResult(result)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-bg"
                    >
                      <span className="text-fg">{result.displayName}</span>
                      <span className="text-xs text-fg-muted">{result.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <TextField
            label="Benutzername"
            name="user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            required
          />
          <TextField
            label="Passwort"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Angemeldet bleiben, bis ich mich abmelde oder Browserdaten lösche
          </label>

          {showSelectSchoolHint && (
            <p role="alert" className="text-sm text-danger">
              Bitte zuerst eine Schule aus der Liste auswählen.
            </p>
          )}
          {status === 'error' && errorMessage !== undefined && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}

          <Button type="submit" disabled={authenticating} className="mt-2 w-full">
            {authenticating ? <Spinner label="Melde an…" /> : 'Anmelden'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

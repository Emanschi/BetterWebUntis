import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';

export function LoginScreen() {
  const status = useSessionStore((s) => s.status);
  const errorMessage = useSessionStore((s) => s.errorMessage);
  const storedSchool = useSessionStore((s) => s.school);
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();

  const [school, setSchool] = useState(storedSchool);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (status === 'authenticated') navigate('/timetable', { replace: true });
  }, [status, navigate]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login(school, user, password);
  }

  const authenticating = status === 'authenticating';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-fg">BetterWebUntis</h1>
        <p className="mb-6 text-sm text-fg-muted">Melde dich mit deinem WebUntis-Konto an.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Schule"
            name="school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="z. B. htlstp"
            autoComplete="organization"
            required
          />
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

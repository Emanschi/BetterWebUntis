/**
 * Startet den Mock-Server für manuelles Testen: `npm run mock`.
 */
import { ACCOUNTS } from '../src/mock/accounts';
import { createMockHttpServer, JSONRPC_PATH } from '../src/mock/server';

const port = Number(process.env['MOCK_PORT'] ?? 4001);
const server = createMockHttpServer();

server.listen(port, () => {
  console.log(`Mock-WebUntis-Server läuft auf http://localhost:${port}${JSONRPC_PATH}\n`);
  console.log('Test-Logins:');
  for (const account of ACCOUNTS) {
    const kind = account.personType === 5 ? 'Schüler' : 'Lehrer';
    console.log(`  ${account.user} / ${account.password}  (${kind}, personId ${account.personId})`);
  }
  console.log('\nZum Verwenden im Dev-Server:');
  console.log(`  VITE_WEBUNTIS_SERVER=http://localhost:${port} npm run dev\n`);
});

/**
 * Wird vor jeder Testdatei geladen (siehe vitest.config.ts). Ergänzt Vitests `expect`
 * um die DOM-Matcher von @testing-library/jest-dom (z. B. `toBeInTheDocument()`).
 * Für reine .ts-Tests (Node-Umgebung, kein DOM) hat das keine Wirkung.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest hat kein automatisches RTL-Cleanup wie Jest — ohne das haengen Komponenten
// aus einem Test im DOM des naechsten und getByLabelText() findet doppelte Treffer.
afterEach(() => {
  cleanup();
});

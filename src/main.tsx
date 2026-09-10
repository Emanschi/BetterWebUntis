import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('#root nicht gefunden');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

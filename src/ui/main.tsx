import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { moveLegacyPreferences } from './legacy';

moveLegacyPreferences();
createRoot(document.getElementById('root')!).render(<App />);

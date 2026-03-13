import { createRoot } from 'react-dom/client';
import './style.css';
import 'leaflet/dist/leaflet.css';
import { App } from './App';

createRoot(document.getElementById('app')!).render(<App />);

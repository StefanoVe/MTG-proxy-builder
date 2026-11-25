import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { I18nProvider } from './i18n.js';
import { UpdateNotice } from './UpdateNotice.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(<I18nProvider><App /><UpdateNotice /></I18nProvider>);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './context/SessionContext';
import { WorkspacePreferences } from './context/WorkspacePreferences';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><SessionProvider><WorkspacePreferences><App /></WorkspacePreferences></SessionProvider></React.StrictMode>);

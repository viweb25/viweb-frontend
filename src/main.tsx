import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { SessionProvider } from './context/SessionContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ToastProvider } from './ui/common';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <ToastProvider>
    <SessionProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </SessionProvider>
  </ToastProvider>
</React.StrictMode>);

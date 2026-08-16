import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@digdir/designsystemet-css';
import '@digdir/designsystemet-css/theme';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 
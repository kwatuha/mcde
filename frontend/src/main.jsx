// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Import the main App component
import './index.css'; // Assuming you have a global CSS file for basic styles
import { clearChunkReloadFlag } from './utils/lazyWithRetry';

clearChunkReloadFlag();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App /> {/* Render the App component which now handles AuthProvider internally */}
  </React.StrictMode>,
);

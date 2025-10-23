/*
 * JiraMetricsDashboard - main.jsx
 *
 * This is the root of the React application.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
// Import the correct App component
import App from './App';
// Tailwind styles are loaded via CDN in index.html

// --- React App Entry Point ---
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
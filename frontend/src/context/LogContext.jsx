/*
 * JiraMetricsDashboard - LogContext.jsx
 *
 * Provides a global context for logging transactional messages
 * from anywhere in the app to be displayed in the TransactionalConsole.
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// 1. Create the context
export const LogContext = createContext(null);

// 2. Create the provider component
export function LogProvider({ children }) {
  const [logs, setLogs] = useState([]);

  /**
   * Adds a new log message.
   * @param {'info' | 'warn' | 'error'} level - The severity level of the log.
   * @param {string} message - The log message content.
   */
  const addLog = useCallback((level, message) => {
    const newLog = {
      timestamp: new Date(),
      level,
      message,
    };
    setLogs((prevLogs) => [...prevLogs, newLog]);
  }, []);

  /**
   * Clears all logs from the console.
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Use useMemo to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    logs,
    addLog,
    clearLogs,
  }), [logs, addLog, clearLogs]);

  return (
    <LogContext.Provider value={value}>
      {children}
    </LogContext.Provider>
  );
}

// 3. Create a custom hook for easy consumption
export const useLogs = () => {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogs must be used within a LogProvider');
  }
  return context;
};
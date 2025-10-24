/*
 * JiraMetricsDashboard - TransactionalConsole.jsx
 *
 * Displays a running log of transactional messages from the LogContext
 * within a modal pop-up.
 */
import React, { useRef, useEffect } from 'react';
import { useLogs } from '../context/LogContext.jsx'; // Adjust path as needed

// Helper to determine text color based on log level
const getLevelColor = (level) => {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-yellow-400';
    case 'info':
    default:
      return 'text-green-400';
  }
};

// --- NEW: Props for modal control ---
function TransactionalConsole({ isOpen, onClose }) {
  const { logs, clearLogs } = useLogs();
  const logContainerRef = useRef(null);

  // Auto-scroll to the bottom when new logs are added
  useEffect(() => {
    if (isOpen && logContainerRef.current) {
      // Use setTimeout to ensure scrolling happens after render
      setTimeout(() => {
         if (logContainerRef.current) { // Check again inside timeout
             logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
         }
      }, 0);
    }
  }, [logs, isOpen]); // Also run when modal opens

  // --- NEW: Return null if modal is not open ---
  if (!isOpen) {
    return null;
  }

  // --- NEW: Modal wrapper ---
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm"
      onClick={onClose} // Close modal if clicking outside the content
    >
        {/* --- Prevent closing when clicking inside the console itself --- */}
      <div
        className="relative flex flex-col w-full max-w-3xl h-[80vh] rounded-lg bg-gray-900 text-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()} // Stop click propagation
      >
        {/* --- Header with Close Button --- */}
        <div className="flex items-center justify-between border-b border-gray-700 p-3 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-200">
            Transactional Log
          </h3>
          <div className="flex items-center space-x-2">
              <button
                onClick={clearLogs}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white"
                title="Clear logs"
              >
                Clear
              </button>
              <button
                onClick={onClose}
                className="rounded border border-gray-600 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900 hover:text-white"
                title="Close Log"
              >
                 {/* Simple X icon */}
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                 </svg>
              </button>
          </div>
        </div>

        {/* --- Log Content Area --- */}
        <div
          ref={logContainerRef}
          className="flex-1 space-y-2 overflow-y-auto p-3 font-mono text-sm"
        >
          {logs.length === 0 && (
            <p className="text-gray-500">Log console initialized. Waiting for actions...</p>
          )}
          {logs.map((log, index) => (
            <div key={index} className="flex">
              <span className="mr-2 text-gray-500">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span className={`mr-2 font-bold ${getLevelColor(log.level)}`}>
                [{log.level.toUpperCase()}]
              </span>
              <span className="flex-1 break-words text-gray-300">
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TransactionalConsole;
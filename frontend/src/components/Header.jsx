/*
 * JiraMetricsDashboard - Header.jsx
 *
 * A simple header component with a logo and the Project Key input.
 */

import React, { useState } from 'react';

function Header({ onProjectChange }) {
  const [projectKey, setProjectKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onProjectChange(projectKey.toUpperCase());
  };

  return (
    <header className="bg-white shadow-md">
      <nav className="container mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-col items-center justify-between sm:flex-row">
          <div className="flex items-center space-x-2">
            <svg
              className="h-8 w-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"
              />
            </svg>
            <h1 className="text-2xl font-bold text-gray-800">
              JiraMetricsDashboard
            </h1>
          </div>
          <form
            onSubmit={handleSubmit}
            className="mt-2 flex w-full max-w-xs sm:mt-0"
          >
            <input
              type="text"
              className="block w-full min-w-0 flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Enter Project Key (e.g., PROJ)"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              aria-label="Jira Project Key"
            />
            <button
              type="submit"
              className="-ml-px relative inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              Load
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}

export default Header;
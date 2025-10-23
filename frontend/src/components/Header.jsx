/*
 * JiraMetricsDashboard - Header.jsx
 *
 * Header component with logo, Project Key input, and Save/Load/Delete view controls using backend API.
 */

import React, { useState, useEffect } from 'react';

function Header({
  projectKey: currentProjectKey, // Renamed prop
  onProjectChange,
  // --- Props for Saved Views ---
  savedViews,       // Array: [{ _id: '...', name: '...' }]
  isLoadingViews,   // Boolean
  onSaveView,       // function(name)
  onLoadView,       // function(viewId) -> Now expects ID
  onDeleteView,     // function(viewId, viewName) -> Expects ID and Name
}) {
  // Local state for the project key input field
  const [projectKeyInput, setProjectKeyInput] = useState(currentProjectKey || '');
  // Local state for the selected view ID in the dropdown
  const [selectedViewId, setSelectedViewId] = useState('');

  // Effect to update the input field if the projectKey prop changes externally (e.g., view loaded)
  useEffect(() => {
    setProjectKeyInput(currentProjectKey || '');
  }, [currentProjectKey]);

  // Handle submitting the project key from the input field
  const handleProjectSubmit = (e) => {
    e.preventDefault();
    const keyToSubmit = projectKeyInput.trim().toUpperCase();
    // Only trigger if input is valid and different from current, or if current is empty
    if (keyToSubmit && (keyToSubmit !== currentProjectKey || !currentProjectKey)) {
        onProjectChange(keyToSubmit);
    }
  };

  // --- Handle Save View Click ---
  const handleSaveClick = () => {
    // Check if a project is loaded before allowing save
    if (!currentProjectKey) {
        alert("Please load a project before saving a view.");
        return;
    }
    const viewName = prompt('Enter a name for this view:');
    if (viewName) {
      onSaveView(viewName.trim());
      // No need to manually update selectedViewId here, list will refresh
    }
  };

  // --- Handle Load View Dropdown Change ---
  const handleLoadChange = (e) => {
    const viewId = e.target.value;
    setSelectedViewId(viewId); // Update local state for dropdown selection
    if (viewId) {
      onLoadView(viewId); // Call App's handler with the selected ID
    }
  };

  // --- Handle Delete View Click ---
  const handleDeleteClick = () => {
    if (!selectedViewId) {
      alert('Please select a view to delete from the dropdown first.');
      return;
    }
    // Find the name corresponding to the selected ID for the confirmation dialog
    const selectedView = savedViews.find(v => v._id === selectedViewId);
    if (selectedView) {
      onDeleteView(selectedViewId, selectedView.name); // Call App's handler with ID and Name
      setSelectedViewId(''); // Reset dropdown after delete attempt
    } else {
        alert("Selected view not found in the list. Please refresh."); // Should not happen ideally
    }
  };

  return (
    <header className="bg-white shadow-md">
      <nav className="container mx-auto max-w-7xl px-4 py-3">
        {/* Top Row: Logo & Project Input */}
        <div className="flex flex-col items-center justify-between gap-y-3 sm:flex-row sm:gap-x-4">
          {/* Logo */}
          <div className="flex flex-shrink-0 items-center space-x-2">
            <svg /* Your SVG */ className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"/></svg>
            <h1 className="text-xl font-bold text-gray-800 md:text-2xl">
              JiraMetricsDashboard
            </h1>
          </div>
          {/* Project Input Form */}
          <form
            onSubmit={handleProjectSubmit}
            className="flex w-full max-w-xs flex-shrink" // Added flex-shrink
          >
            <input
              type="text"
              className="block w-full min-w-0 flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Project Key (e.g., PROJ)"
              value={projectKeyInput}
              onChange={(e) => setProjectKeyInput(e.target.value)}
              aria-label="Jira Project Key"
            />
            <button
              type="submit"
              className="-ml-px relative inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" // Adjusted padding
            >
              Load
            </button>
          </form>
        </div>

        {/* --- NEW: Second Row for View Management --- */}
        <div className="mt-3 flex flex-col items-center justify-end gap-x-2 gap-y-2 border-t border-gray-200 pt-3 sm:flex-row">
           <span className="text-sm font-medium text-gray-600">Saved Views:</span>
           <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
               {/* Load Dropdown */}
               <select
                 value={selectedViewId}
                 onChange={handleLoadChange}
                 disabled={isLoadingViews || savedViews.length === 0}
                 className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:w-48 sm:text-sm" // Adjusted width
                 aria-label="Load Saved View"
               >
                 <option value="">{isLoadingViews ? 'Loading...' : '-- Load View --'}</option>
                 {savedViews.map((view) => (
                   <option key={view._id} value={view._id}>
                     {view.name}
                   </option>
                 ))}
               </select>

               {/* Save Button */}
                <button
                    onClick={handleSaveClick}
                    disabled={!currentProjectKey} // Disable if no project loaded
                    className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                    title={!currentProjectKey ? "Load a project first" : "Save current filters as a view"}
                >
                    Save Current View
                </button>

               {/* Delete Button */}
               <button
                 onClick={handleDeleteClick}
                 disabled={!selectedViewId || isLoadingViews} // Disable if no view selected or loading
                 className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                 title={!selectedViewId ? "Select a view to delete" : "Delete selected view"}
               >
                 Delete View
               </button>
           </div>
        </div>
      </nav>
    </header>
  );
}

export default Header;
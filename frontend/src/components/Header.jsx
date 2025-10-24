/*
 * JiraMetricsDashboard - Header.jsx
 *
 * Header component with logo, Project Key input, Save/Load/Delete view controls,
 * Log modal toggle, Metrics Explanation modal toggle, and Export button.
 */

import React, { useState, useEffect } from 'react';

// Export Icon SVG (Example - replace with a better one if available)
const ExportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75v6.75m0 0-3-3m3 3 3-3m-8.25 6a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
    </svg>
);


function Header({
  projectKey: currentProjectKey,
  onProjectChange,
  // Saved Views
  savedViews,
  isLoadingViews,
  onSaveView,
  onLoadView,
  onDeleteView,
  // Modals
  onToggleLogModal,
  onToggleExplanationModal,
  onExportData, // <-- New Prop for Export
  // --- NEW: Prop to disable export ---
  canExport,
}) {
  const [projectKeyInput, setProjectKeyInput] = useState(currentProjectKey || '');
  const [selectedViewId, setSelectedViewId] = useState('');

  useEffect(() => { setProjectKeyInput(currentProjectKey || ''); }, [currentProjectKey]);
  const handleProjectSubmit = (e) => { e.preventDefault(); const key=projectKeyInput.trim().toUpperCase(); if(key && (key!==currentProjectKey || !currentProjectKey)){onProjectChange(key);} };
  const handleSaveClick = () => { if (!currentProjectKey) { alert("Load project first."); return; } const name = prompt('View name:'); if (name) onSaveView(name.trim()); };
  const handleLoadChange = (e) => { const id = e.target.value; setSelectedViewId(id); if (id) onLoadView(id); };
  const handleDeleteClick = () => { if (!selectedViewId) { alert('Select view first.'); return; } const view = savedViews?.find(v => v._id === selectedViewId); if (view) { if (window.confirm(`Delete "${view.name}"?`)) { onDeleteView(selectedViewId, view.name); setSelectedViewId(''); } } else { alert("View not found."); } };

  return (
    <header className="bg-white shadow-md sticky top-0 z-40">
      <nav className="container mx-auto max-w-7xl px-4 py-3">
        {/* Top Row: Logo & Project Input */}
        <div className="flex flex-col items-center justify-between gap-y-3 sm:flex-row sm:gap-x-4">
            {/* Logo */}
             <div className="flex flex-shrink-0 items-center space-x-2">
                <svg /* Your SVG */ className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"/></svg>
                <h1 className="text-xl font-bold text-gray-800 md:text-2xl">JiraMetricsDashboard</h1>
            </div>
            {/* Project Input Form */}
             <form onSubmit={handleProjectSubmit} className="flex w-full max-w-xs flex-shrink">
                <input type="text" className="block w-full min-w-0 flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" placeholder="Project Key (e.g., PROJ)" value={projectKeyInput} onChange={(e) => setProjectKeyInput(e.target.value)} aria-label="Jira Project Key" />
                <button type="submit" className="-ml-px relative inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">Load</button>
            </form>
        </div>

        {/* --- Second Row: Views & Action Buttons --- */}
        <div className="mt-3 flex flex-col items-center justify-between gap-x-2 gap-y-2 border-t border-gray-200 pt-3 sm:flex-row">
            {/* Saved Views Section */}
           <div className="flex items-center gap-x-2">
               <span className="text-sm font-medium text-gray-600">Saved Views:</span>
               <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                   <select value={selectedViewId} onChange={handleLoadChange} disabled={isLoadingViews || !savedViews || savedViews.length === 0} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:w-48 sm:text-sm" aria-label="Load Saved View"> <option value="">{isLoadingViews ? 'Loading...' : '-- Load View --'}</option> {(savedViews || []).map((view) => ( <option key={view?._id} value={view?._id}> {view?.name} </option> ))} </select>
                   <button onClick={handleSaveClick} disabled={!currentProjectKey} className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400" title={!currentProjectKey ? "Load a project first" : "Save current filters as a view"}>Save</button>
                   <button onClick={handleDeleteClick} disabled={!selectedViewId || isLoadingViews} className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" title={!selectedViewId ? "Select a view to delete" : "Delete selected view"}>Delete</button>
               </div>
           </div>

            {/* --- Action Buttons (Logs, Help, Export) --- */}
            <div className="flex items-center space-x-2">
                {/* --- Log Button --- */}
                <button onClick={onToggleLogModal} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Show/Hide Transactional Log">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                     Logs
                </button>
                {/* --- Metrics Explanation Button --- */}
                 <button onClick={onToggleExplanationModal} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Show Metrics Explanations">
                    <HelpIcon />
                     Help
                </button>
                {/* --- NEW: Export Button --- */}
                 <button
                    onClick={onExportData} // Call the new handler
                    disabled={!canExport} // Disable if no processed data
                    className="inline-flex items-center rounded-md border border-transparent bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                    title={!canExport ? "Load data before exporting" : "Export Configuration and Metrics for AI"}
                >
                    <ExportIcon />
                     Export for AI
                </button>
            </div>
        </div>
      </nav>
    </header>
  );
}

// Ensure HelpIcon is defined
const HelpIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
);

export default Header;
/*
 * JiraMetricsDashboard - FilterPanel.jsx
 *
 * This component provides two key functions:
 * 1. Standard JQL filters (Issue Type, Priority, Dates).
 * 2. The critical "Status Grouping" UI.
 *
 * The Status Grouping UI allows a user to assign a custom "Group Name"
 * to each raw Jira status.
 * State for standard filters (dates, types, priorities) is managed in App.jsx.
 */

import React, { useState, useEffect } from 'react';

function FilterPanel({
  metadata,
  statusGroups,
  onStatusGroupsChange,
  onFilterSubmit, // This now triggers the submit in App.jsx
  isLoading,
  // Date props
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  // Standard Filter props
  standardFilters,
  onStandardFiltersChange,
}) {
  // State for the status grouping UI remains local to this component
  const [groupNameMap, setGroupNameMap] = useState({});

  // Effect for updating groupNameMap remains the same
  useEffect(() => {
    if (metadata && Array.isArray(metadata.statuses)) {
      const newMap = {};
      metadata.statuses.forEach((s) => {
         if (s && s.id != null) {
           newMap[String(s.id)] = s.name || '';
         }
      });
      if (Array.isArray(statusGroups)) {
          statusGroups.forEach((group) => {
            if (group && group.name != null && Array.isArray(group.statuses)) {
              group.statuses.forEach((statusId) => {
                if (statusId != null) {
                    newMap[String(statusId)] = group.name;
                }
              });
            }
          });
       } else {
            console.warn('[FilterPanel useEffect] statusGroups prop is not an array:', statusGroups);
       }
      setGroupNameMap(newMap);
    } else {
       setGroupNameMap({});
    }
  }, [metadata, statusGroups]);


  // Handle changes to the standard filter dropdowns (Issue Types, Priorities)
  const handleFilterChange = (filterName, selectedOptions) => {
    const values = Array.from(selectedOptions)
      .filter((option) => option.selected)
      .map((option) => option.value);
    // Use the callback prop to update state in App.jsx
    onStandardFiltersChange((prev) => ({ ...prev, [filterName]: values }));
  };

  // Handle "Apply Filters" button click
  const handleSubmitFilters = (e) => {
    e.preventDefault();
    // Simply call the onFilterSubmit prop - App.jsx handles JQL generation
    onFilterSubmit();
  };

  // Handle typing in one of the "Group Name" input fields
  const handleGroupNameChange = (statusId, newName) => {
    setGroupNameMap((prev) => ({
      ...prev,
      [String(statusId)]: newName, // Use string ID
    }));
  };

  // Handle "Save Groups" button click
  const handleSaveGroups = () => {
    // Convert the { statusId: 'groupName' } map back into the
    // { id, name, statuses: [...] } array structure.
    const groups = {}; // { 'Queue': ['1', '2'], 'In Dev': ['3'] }

    Object.entries(groupNameMap).forEach(([statusId, groupName]) => {
      // Ensure groupName is treated as a string and trim whitespace
      const trimmedGroupName = String(groupName || '').trim();
       if (!trimmedGroupName) {
           console.warn(`[FilterPanel] Status ID ${statusId} has an empty or invalid group name. Skipping.`);
           return; // Skip if group name is empty
       }

      if (!groups[trimmedGroupName]) {
        groups[trimmedGroupName] = [];
      }
      groups[trimmedGroupName].push(statusId); // statusId is already a string key from the map
    });

    // Convert map to final array
    const newStatusGroups = Object.entries(groups).map(([name, statuses], i) => ({
      // Use a more robust ID generation if needed, but this is likely okay
      id: `group-${i}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`, // Sanitize name for ID
      name, // Use the trimmed name
      statuses, // Array of string status IDs
    }));

    // Pass the new group definitions up to App.jsx
    onStatusGroupsChange(newStatusGroups);
  };

  return (
    <aside className="sticky top-6 space-y-6">
      {/* --- Standard Filters --- */}
      <form
        onSubmit={handleSubmitFilters}
        className="rounded-lg bg-white p-4 shadow-lg"
      >
        <h3 className="mb-4 border-b pb-2 text-lg font-semibold text-gray-800">
          Filters
        </h3>
        <div className="space-y-4">
           {/* Date Filters */}
           <div>
            <label
              htmlFor="filter-startDate"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Created After (Optional)
            </label>
            <input
              type="date"
              id="filter-startDate"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              disabled={isLoading || !metadata}
            />
          </div>
          <div>
            <label
              htmlFor="filter-endDate"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Created Before (Optional)
            </label>
            <input
              type="date"
              id="filter-endDate"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              disabled={isLoading || !metadata}
            />
          </div>

          {/* Issue Types Filter */}
          <div>
            <label
              htmlFor="filter-issueTypes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Issue Types
            </label>
            <select
              id="filter-issueTypes"
              multiple
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={standardFilters.issueTypes} // Use value from props
              onChange={(e) => handleFilterChange('issueTypes', e.target.options)}
               disabled={!metadata || !Array.isArray(metadata.issueTypes) || isLoading}
            >
              {metadata?.issueTypes?.map((it) => (
                 it && it.id != null ? (
                    <option key={it.id} value={it.id}>
                    {it.name || `Type ${it.id}`}
                    </option>
                 ) : null
              ))}
            </select>
          </div>

          {/* Priorities Filter */}
          <div>
            <label
              htmlFor="filter-priorities"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Priorities
            </label>
            <select
              id="filter-priorities"
              multiple
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={standardFilters.priorities} // Use value from props
              onChange={(e) => handleFilterChange('priorities', e.target.options)}
               disabled={!metadata || !Array.isArray(metadata.priorities) || isLoading}
            >
              {metadata?.priorities?.map((p) => (
                 p && p.id != null ? (
                    <option key={p.id} value={p.id}>
                    {p.name || `Priority ${p.id}`}
                    </option>
                 ) : null
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !metadata}
            className="w-full rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isLoading ? 'Loading...' : 'Apply Filters'}
          </button>
        </div>
      </form>

      {/* --- Status Grouping --- */}
      <div className="rounded-lg bg-white p-4 shadow-lg">
        <h3 className="mb-4 border-b pb-2 text-lg font-semibold text-gray-800">
          Status Groups
        </h3>
        <p className="mb-3 text-sm text-gray-600">
          Assign raw statuses to a custom group. Click "Save Groups" to apply changes.
        </p>
         {metadata?.statuses && Array.isArray(metadata.statuses) && metadata.statuses.length > 0 ? (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {metadata.statuses.map((status) => (
               status && status.id != null ? (
                <div
                    key={status.id}
                    className="grid grid-cols-2 items-center gap-2"
                >
                    <span className="truncate text-sm text-gray-700" title={status.name}>
                    {status.name || 'Unnamed Status'}
                    </span>
                    <input
                    type="text"
                    value={groupNameMap[String(status.id)] || ''}
                    onChange={(e) => handleGroupNameChange(status.id, e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                     disabled={isLoading}
                    />
                </div>
               ) : null
            ))}
          </div>
         ) : (
          <p className="text-sm text-gray-500">
             {isLoading ? 'Loading statuses...' : 'No statuses loaded for grouping.'}
          </p>
         )}
        <button
          onClick={handleSaveGroups}
          disabled={isLoading || !metadata || !Array.isArray(metadata.statuses) || metadata.statuses.length === 0}
          className="mt-4 w-full rounded-md border border-transparent bg-green-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          Save Groups & Re-Process
        </button>
      </div>
    </aside>
  );
}

export default FilterPanel;
/*
 * JiraMetricsDashboard - FilterPanel.jsx
 *
 * This component provides two key functions:
 * 1. Standard JQL filters (Issue Type, Priority).
 * 2. The critical "Status Grouping" UI.
 *
 * The Status Grouping UI allows a user to assign a custom "Group Name"
 * to each raw Jira status.
 */

import React, { useState, useEffect } from 'react';

function FilterPanel({
  metadata,
  statusGroups,
  onStatusGroupsChange,
  onFilterSubmit,
  isLoading,
}) {
  // --- State ---
  // State for standard filters
  const [localFilters, setLocalFilters] = useState({
    issueTypes: [],
    priorities: [],
  });

  // State for the status grouping UI.
  // We store a simple map of { statusId: 'groupName' } for the inputs.
  const [groupNameMap, setGroupNameMap] = useState({});

  // --- Effects ---
  // When metadata or the canonical statusGroups (from App.jsx) change,
  // we rebuild the local groupNameMap for the input fields.
  useEffect(() => {
    if (metadata && metadata.statuses) {
      const newMap = {};
      // First, map all statuses to a default group name (their own name)
      metadata.statuses.forEach((s) => {
        newMap[s.id] = s.name;
      });
      // Then, overwrite with the custom group names from props
      statusGroups.forEach((group) => {
        group.statuses.forEach((statusId) => {
          newMap[statusId] = group.name;
        });
      });
      setGroupNameMap(newMap);
    }
  }, [metadata, statusGroups]);

  // --- Handlers ---

  // Handle changes to the standard filter dropdowns
  const handleFilterChange = (filterName, selectedOptions) => {
    const values = Array.from(selectedOptions)
      .filter((option) => option.selected)
      .map((option) => option.value);
    setLocalFilters((prev) => ({ ...prev, [filterName]: values }));
  };

  // Handle "Apply Filters" button click
  const handleSubmitFilters = (e) => {
    e.preventDefault();
    // 1. Build the JQL filter string
    const jqlParts = [];
    if (localFilters.issueTypes.length > 0) {
      jqlParts.push(`issueType in (${localFilters.issueTypes.map(id => `"${id}"`).join(',')})`);
    }
    if (localFilters.priorities.length > 0) {
      jqlParts.push(`priority in (${localFilters.priorities.map(id => `"${id}"`).join(',')})`);
    }
    
    // 2. Pass JQL string to App.jsx
    onFilterSubmit(jqlParts.join(' AND '));
  };

  // Handle typing in one of the "Group Name" input fields
  const handleGroupNameChange = (statusId, newName) => {
    setGroupNameMap((prev) => ({
      ...prev,
      [statusId]: newName,
    }));
  };

  // Handle "Save Groups" button click
  const handleSaveGroups = () => {
    // Convert the { statusId: 'groupName' } map back into the
    // { id, name, statuses: [...] } array structure.
    const groups = {}; // { 'Queue': ['1', '2'], 'In Dev': ['3'] }

    Object.entries(groupNameMap).forEach(([statusId, groupName]) => {
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(statusId);
    });

    // Convert map to final array
    const newStatusGroups = Object.entries(groups).map(([name, statuses], i) => ({
      id: `group-${i}-${name.replace(/\s+/g, '-')}`, // Create a stable-ish ID
      name,
      statuses,
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
              value={localFilters.issueTypes}
              onChange={(e) => handleFilterChange('issueTypes', e.target.options)}
            >
              {metadata?.issueTypes?.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
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
              value={localFilters.priorities}
              onChange={(e) => handleFilterChange('priorities', e.target.options)}
            >
              {metadata?.priorities?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
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
          Assign raw statuses to a custom group. (e.g., assign "In Review" and
          "In QA" to a group named "Review").
        </p>
        <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
          {metadata?.statuses?.map((status) => (
            <div
              key={status.id}
              className="grid grid-cols-2 items-center gap-2"
            >
              <span className="truncate text-sm text-gray-700" title={status.name}>
                {status.name}
              </span>
              <input
                type="text"
                value={groupNameMap[status.id] || ''}
                onChange={(e) => handleGroupNameChange(status.id, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSaveGroups}
          disabled={isLoading}
          className="mt-4 w-full rounded-md border border-transparent bg-green-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          Save Groups & Re-Process
        </button>
      </div>
    </aside>
  );
}

export default FilterPanel;

/*
 * JiraMetricsDashboard - App.jsx
 *
 * This is the main React component. It manages the global state for:
 * - projectKey
 * - filter metadata (statuses, priorities, etc.)
 * - user-defined status groups
 * - fetched issues and processed metrics
 *
 * It coordinates the Header, FilterPanel, and MetricsDashboard components.
 */

import React, { useState, useEffect, useCallback } from 'react';
// --- Removed axios import, using native fetch ---
// import axios from 'axios';
// Imports for components are removed, as they will be inlined in this file.
// import Header from './components/Header';
// import FilterPanel from './components/FilterPanel';
// import MetricsDashboard from './components/MetricsDashboard';
// import { processMetrics } from './utils/dataProcessor';

// The backend API URL
const API_BASE_URL = 'http://localhost:3001/api/jira';
console.log('[App] API_BASE_URL:', API_BASE_URL); // Log the base URL on load

// --- Simple Error Boundary Component ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("[ErrorBoundary] Caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="container mx-auto mt-4 max-w-7xl p-4">
             <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow" role="alert">
                 <strong className="font-bold">Rendering Error:</strong>
                 <p>Something went wrong while rendering the dashboard content.</p>
                 <pre className="mt-2 text-sm whitespace-pre-wrap">
                     {this.state.error?.message || 'Unknown error'}
                     {/* In development, you might want to show the stack trace */}
                     {/* {this.state.error?.stack} */}
                 </pre>
             </div>
        </div>
      );
    }

    return this.props.children;
  }
}


// --- INLINED: dataProcessor.js ---

/**
 * Main processing function.
 * @param {Array} issues - Array of raw issue objects from Jira API.
 * @param {Array} statusGroups - Array of { id, name, statuses: [id1, ...] }
 * @returns {Object} - { distribution, timeInStatusTable }
 */
function processMetrics(issues, statusGroups) {
  // Add a console log to see when this function runs and with what data
  console.log('[processMetrics] Running with issues (count):', issues?.length, 'and groups (count):', statusGroups?.length); // Log counts

  // --- ADDED: More robust initial checks ---
  if (!Array.isArray(issues) || issues.length === 0) {
    console.warn('[processMetrics] Invalid or empty issues array provided.');
    return null;
  }
  if (!Array.isArray(statusGroups) || statusGroups.length === 0) {
    console.warn('[processMetrics] Invalid or empty statusGroups array provided.');
    return null; // Need groups to process
  }


  // --- 1. Create Lookup Maps ---
  const statusToGroupMap = new Map();
  const groupTimeCounters = new Map();
  const groupIssueCounters = new Map();

  // --- ADDED: Check each group during initialization ---
  statusGroups.forEach((group) => {
    // Check if group is valid and has a name and statuses array
    if (group && group.name && Array.isArray(group.statuses)) {
        group.statuses.forEach((statusId) => {
            // Ensure statusId is not null/undefined before setting
            if (statusId != null) {
                statusToGroupMap.set(String(statusId), group.name); // Ensure keys are strings
            } else {
                console.warn('[processMetrics] Found null/undefined statusId in group:', group.name);
            }
        });
        groupTimeCounters.set(group.name, 0);
        groupIssueCounters.set(group.name, 0);
    } else {
       console.warn('[processMetrics] Invalid status group structure found:', group);
    }
  });


  // --- 2. Calculate Status Distribution (Current Status) ---
  issues.forEach((issue) => {
    // Basic check for expected structure
    if (issue && issue.fields && issue.fields.status && issue.fields.status.id != null) { // Check id is not null/undefined
      const currentStatusId = String(issue.fields.status.id); // Ensure ID is string for map lookup
      const groupName = statusToGroupMap.get(currentStatusId);
      if (groupName) {
        // Check if groupName exists in counters before incrementing
        if (groupIssueCounters.has(groupName)) {
            groupIssueCounters.set(groupName, groupIssueCounters.get(groupName) + 1);
        } else {
             // This warning might indicate an issue with group initialization or status mapping
             console.warn(`[processMetrics] Status ID ${currentStatusId} maps to group '${groupName}', but this group is not initialized in counters.`);
        }
      } else {
        // Log statuses that don't belong to any defined group, might be useful
        // console.log(`[processMetrics] Status ID ${currentStatusId} (${issue.fields.status.name || 'N/A'}) does not belong to any defined group.`); // Reduced verbosity
      }
    } else {
       console.warn('[processMetrics] Issue structure is missing expected fields for status distribution:', issue?.key || issue);
    }
  });


  const totalIssues = issues.length;
  // --- ADDED: Filter out groups with potentially NaN percentage if totalIssues is 0 ---
  const distribution = Array.from(groupIssueCounters.entries()).map(
    ([name, count]) => ({
      name,
      count,
      percentage: totalIssues > 0 ? (count / totalIssues) * 100 : 0,
    }),
  );

  // --- 3. Calculate Time In Status ---
  const timeInGroupMs = calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters);

  // --- 4. Format Final Table Data ---
  // --- ADDED: Check result of calculateTimeInStatus ---
  if (!(timeInGroupMs instanceof Map)) {
      console.error('[processMetrics] calculateTimeInStatus did not return a Map.');
      return { distribution, timeInStatusTable: [] }; // Return empty table data
  }

  const timeInStatusTable = Array.from(timeInGroupMs.entries()).map(
    ([groupName, ms]) => ({
      groupName,
      totalMs: ms || 0, // Default to 0 if ms is undefined/null
      totalHours: (ms || 0) / (1000 * 60 * 60),
      totalDays: (ms || 0) / (1000 * 60 * 60 * 24),
    }),
  );

  const result = { distribution, timeInStatusTable };
  // console.log('[processMetrics] Finished processing. Result:', result); // Reduced verbosity
  return result;
}

/**
 * Calculates the total time spent in each status *group*.
 * @param {Array} issues - Raw issues.
 * @param {Map} statusToGroupMap - { statusId -> 'GroupName' }
 * @param {Map} groupTimeCounters - { 'GroupName' -> 0 } Initialized counters
 * @returns {Map} - { 'GroupName' -> totalMs }
 */
function calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters) {
  // Clone the initialized map to ensure we start fresh for each calculation
  const timeInGroup = new Map(groupTimeCounters);
   // Ensure all group names from the initial counters are present (defensive)
  groupTimeCounters.forEach((_, groupName) => {
    if (!timeInGroup.has(groupName)) {
      timeInGroup.set(groupName, 0);
    }
  });

  for (const issue of issues) {
     // Check if issue and necessary fields exist
     // --- MODIFIED: Check changelog existence more carefully ---
     if (!issue || !issue.fields || !issue.fields.created) {
       console.warn('[calculateTimeInStatus] Issue is missing fields or created date:', issue?.key || issue);
       continue; // Skip this issue if basic fields are missing
     }
      // Check for changelog, but don't fail immediately if missing, log later
      const hasChangelog = issue.changelog && Array.isArray(issue.changelog.histories);


    // 1. Get all *status* changes from the changelog
    // --- MODIFIED: Handle missing changelog gracefully ---
    const statusChanges = hasChangelog ? issue.changelog.histories
      .flatMap((history) => {
          // Check if history and items exist
          if (!history || !Array.isArray(history.items)) return [];
          return history.items
            .filter((item) => item && item.field === 'status' && item.from != null && item.to != null) // Check item, field, from/to exist
            .map((item) => ({
                timestamp: new Date(history.created), // Assume history.created exists if histories does
                fromId: String(item.from), // Ensure string IDs
                toId: String(item.to),     // Ensure string IDs
            }));
        })
      .sort((a, b) => a.timestamp - b.timestamp) // Sort by date, ascending
      : []; // Default to empty array if no changelog


    // 2. Build a complete issue timeline
    const timeline = [];

    // Add the "Creation" event as the first entry
    // The initial status is the 'from' status of the *first* status change event.
    const firstChange = statusChanges[0];
    const createdStatusId = firstChange ? firstChange.fromId : null; // Already ensured fromId exists


    // Only process if we have a valid creation status derived from the changelog
    if (createdStatusId) {
      timeline.push({
        timestamp: new Date(issue.fields.created),
        statusId: createdStatusId, // Initial status ID
      });

      // Add all subsequent changes
      statusChanges.forEach((change) => {
            // Already ensured toId exists in filter
            timeline.push({
                timestamp: change.timestamp,
                statusId: change.toId, // Status ID after the change
            });
      });

      // 3. Iterate the timeline and sum durations by *group*
      for (let i = 0; i < timeline.length; i++) {
        const startEvent = timeline[i];
        // Ensure startEvent and statusId are valid
        if (!startEvent || startEvent.statusId == null) { // Check statusId presence
           console.warn('[calculateTimeInStatus] Invalid startEvent in timeline (missing statusId):', startEvent, 'Issue:', issue.key);
           continue;
        }

        const endEvent = timeline[i + 1] || { timestamp: new Date() }; // Use "now" as the end for the *last* status

        // Ensure timestamps are valid dates
        const startTimestamp = startEvent.timestamp instanceof Date ? startEvent.timestamp.getTime() : null;
        const endTimestamp = endEvent.timestamp instanceof Date ? endEvent.timestamp.getTime() : null;

        if (startTimestamp === null || endTimestamp === null) {
            console.warn('[calculateTimeInStatus] Invalid timestamp found in timeline event:', { startEvent, endEvent }, 'Issue:', issue.key);
            continue; // Skip this interval if timestamps are invalid
        }


        const groupName = statusToGroupMap.get(startEvent.statusId); // statusId already ensured to be string


        // If the status belongs to a group we care about
        if (groupName) {
          const durationMs = endTimestamp - startTimestamp;


          // Ensure duration is non-negative and groupName exists in the map
          if (durationMs >= 0 && timeInGroup.has(groupName)) { // Allow durationMs === 0
            timeInGroup.set(
              groupName,
              timeInGroup.get(groupName) + durationMs,
            );
          } else if (!timeInGroup.has(groupName)) {
             console.warn(`[calculateTimeInStatus] Status ID ${startEvent.statusId} maps to group '${groupName}', but this group is not initialized in time counters.`);
          } else if (durationMs < 0) {
             console.warn('[calculateTimeInStatus] Calculated negative duration:', { durationMs, startEvent, endEvent }, 'Issue:', issue.key);
          }


        }
      }
    } else {
        // Log if changelog was present but yielded no status changes, or if changelog was missing
        if(hasChangelog) {
           // console.log(`[calculateTimeInStatus] Issue ${issue.key || 'UNKNOWN'} had changelog but no valid status changes found or initial status missing. Skipping time calculation.`); // Reduced verbosity
        } else {
           // console.log(`[calculateTimeInStatus] Issue ${issue.key || 'UNKNOWN'} is missing changelog data. Skipping time calculation.`); // Reduced verbosity
        }
    }
  }
  return timeInGroup;
}


// --- INLINED: components/Header.jsx ---
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

// --- INLINED: components/FilterPanel.jsx ---
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
    // --- ADDED: Log when this effect runs ---
    // console.log('[FilterPanel useEffect] Updating groupNameMap based on metadata or statusGroups change.'); // Reduced verbosity
    if (metadata && Array.isArray(metadata.statuses)) {
      const newMap = {};
      // First, map all statuses to a default group name (their own name)
      metadata.statuses.forEach((s) => {
         // Ensure status and id exist and are valid types
         if (s && s.id != null) { // Check id is not null/undefined
           newMap[String(s.id)] = s.name || ''; // Use string ID as key
         }
      });
      // Then, overwrite with the custom group names from props
       // Check statusGroups validity
      if (Array.isArray(statusGroups)) {
          statusGroups.forEach((group) => {
            // Ensure group and statuses array exist
            if (group && group.name != null && Array.isArray(group.statuses)) { // Check name exists
              group.statuses.forEach((statusId) => {
                 // Ensure statusId exists and is not null/undefined before assigning
                if (statusId != null) {
                    newMap[String(statusId)] = group.name; // Use string ID as key
                }
              });
            }
          });
       } else {
           console.warn('[FilterPanel useEffect] statusGroups prop is not an array:', statusGroups);
       }
      setGroupNameMap(newMap);
       // console.log('[FilterPanel useEffect] groupNameMap updated:', newMap); // Reduced verbosity
    } else {
       // console.log('[FilterPanel useEffect] No metadata.statuses found, clearing groupNameMap.'); // Reduced verbosity
       setGroupNameMap({}); // Clear map if no statuses
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
    // console.log('[FilterPanel] Apply Filters clicked. Local filters:', localFilters); // Reduced verbosity
    // 1. Build the JQL filter string
    const jqlParts = [];
    if (localFilters.issueTypes.length > 0) {
      jqlParts.push(`issueType in (${localFilters.issueTypes.map(id => `"${id}"`).join(',')})`);
    }
    if (localFilters.priorities.length > 0) {
      jqlParts.push(`priority in (${localFilters.priorities.map(id => `"${id}"`).join(',')})`);
    }
    const finalJql = jqlParts.join(' AND ');
     // console.log('[FilterPanel] Submitting JQL:', finalJql); // Reduced verbosity
    // 2. Pass JQL string to App.jsx
    onFilterSubmit(finalJql);
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
     // console.log('[FilterPanel] Save Groups clicked. Current groupNameMap:', groupNameMap); // Reduced verbosity
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

     // console.log('[FilterPanel] Saving new status groups:', newStatusGroups); // Reduced verbosity
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
              // Add check for metadata existence & array type
               disabled={!metadata || !Array.isArray(metadata.issueTypes) || isLoading}
            >
               {/* ADDED: Check array before mapping */}
              {metadata?.issueTypes?.map((it) => (
                 // Add check for item validity
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
              value={localFilters.priorities}
              onChange={(e) => handleFilterChange('priorities', e.target.options)}
              // Add check for metadata existence & array type
               disabled={!metadata || !Array.isArray(metadata.priorities) || isLoading}
            >
               {/* ADDED: Check array before mapping */}
              {metadata?.priorities?.map((p) => (
                 // Add check for item validity
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
            disabled={isLoading || !metadata} // Also disable if no metadata
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
          "In QA" to a group named "Review"). Click "Save Groups" to apply changes.
        </p>
         {/* Check if statuses exist and is an array before mapping */}
         {metadata?.statuses && Array.isArray(metadata.statuses) && metadata.statuses.length > 0 ? (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {metadata.statuses.map((status) => (
               // Ensure status and id exist and are not null/undefined before rendering row
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
                    // Use string ID for map lookup
                    value={groupNameMap[String(status.id)] || ''}
                    onChange={(e) => handleGroupNameChange(status.id, e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                     disabled={isLoading} // Disable input while loading
                    />
                </div>
               ) : null // Don't render if status or id is missing
            ))}
          </div>
         ) : (
          <p className="text-sm text-gray-500">
             {/* Differentiate between loading and no data */}
             {isLoading ? 'Loading statuses...' : 'No statuses loaded for grouping.'}
          </p>
         )}
        <button
          onClick={handleSaveGroups}
           // Disable if loading or if statuses array doesn't exist or is empty
          disabled={isLoading || !metadata || !Array.isArray(metadata.statuses) || metadata.statuses.length === 0}
          className="mt-4 w-full rounded-md border border-transparent bg-green-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          Save Groups & Re-Process
        </button>
      </div>
    </aside>
  );
}


// --- INLINED: components/TimeInStatusTable.jsx ---
function TimeInStatusTable({ data, totalIssues }) {
    // Add checks for data integrity
   if (!data || !Array.isArray(data) || data.length === 0) {
    return <p className="text-gray-500">No time-in-status data available.</p>;
   }
    // Ensure totalIssues is a non-negative number
   const validTotalIssues = Math.max(0, totalIssues || 0);


  // Calculate averages, ensuring validTotalIssues is used
   const tableData = data.map((row) => {
     // Check if row and necessary properties exist
     const totalHours = row && typeof row.totalHours === 'number' ? row.totalHours : 0;
     const totalDays = row && typeof row.totalDays === 'number' ? row.totalDays : 0;
     return {
       ...row,
       // Use validTotalIssues for division, handle division by zero
       avgHours: validTotalIssues > 0 ? totalHours / validTotalIssues : 0,
       avgDays: validTotalIssues > 0 ? totalDays / validTotalIssues : 0,
       // Ensure totalHours and totalDays are numbers for display
       totalHours: totalHours,
       totalDays: totalDays,
       groupName: (row && row.groupName) || 'Unnamed Group' // Provide default name
     };
    });


  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-hidden rounded-lg border shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Status Group
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Avg. Time (Hours)
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Avg. Time (Days)
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Total Time (Hours)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tableData.map((row, index) => (
                 // Use groupName and index for a more robust key
                 <tr key={`${row.groupName}-${index}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                     {/* Display default name if groupName is missing */}
                    {row.groupName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                     {/* Ensure avgHours is a number before calling toFixed */}
                    {(typeof row.avgHours === 'number' ? row.avgHours : 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                     {/* Ensure avgDays is a number before calling toFixed */}
                    {(typeof row.avgDays === 'number' ? row.avgDays : 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                     {/* Ensure totalHours is a number before calling toFixed */}
                    {(typeof row.totalHours === 'number' ? row.totalHours : 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// --- INLINED: components/MetricsDashboard.jsx ---

// A simple loading spinner component
const LoadingSpinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div
      className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  </div>
);

// A simple card component for displaying stats
const StatCard = ({ title, value, subtext }) => (
  <div className="flex-1 rounded-lg bg-white p-4 shadow">
    <div className="text-sm font-medium text-gray-500">{title}</div>
    <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
    {subtext && <div className="text-sm text-gray-400">{subtext}</div>}
  </div>
);

function MetricsDashboard({ processedData, isLoading, error, totalIssues }) {
   // Ensure totalIssues is a non-negative number
  const validTotalIssues = Math.max(0, totalIssues || 0);


  if (isLoading) {
    // console.log('[MetricsDashboard] Rendering LoadingSpinner.'); // Reduced verbosity
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
     console.log('[MetricsDashboard] Rendering error message:', error);
    return (
      <div
        className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow-lg"
        role="alert"
      >
        <strong className="font-bold">Error: </strong>
         {/* Safely display error message */}
         <span className="block sm:inline">{String(error)}</span>
      </div>
    );
  }

   // Check specifically if processedData is null or lacks expected structure
  // --- MODIFIED: Adjusted condition to show message even if isLoading is false ---
  if (!processedData || !Array.isArray(processedData.distribution) || !Array.isArray(processedData.timeInStatusTable)) {
     // console.log('[MetricsDashboard] Rendering placeholder message. ProcessedData:', processedData, 'TotalIssues:', validTotalIssues); // Reduced verbosity
    return (
      <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-lg">
        {validTotalIssues === 0 // Show "0 issues found" only if totalIssues is confirmed 0
          ? 'Found 0 issues matching your criteria. Adjust your filters and try again.'
          : 'Please apply filters or wait for data to load metrics.'} {/* Default message */}
      </div>
    );
  }

  // --- ADDED: Log successful rendering ---
  // console.log('[MetricsDashboard] Rendering metrics. ProcessedData:', processedData); // Reduced verbosity

  const { distribution, timeInStatusTable } = processedData;

   // Check if timeInStatusTable is an array before reducing
  const totalHours = Array.isArray(timeInStatusTable)
    ? timeInStatusTable.reduce((acc, row) => acc + ( (row && typeof row.totalHours === 'number') ? row.totalHours : 0), 0) // Add check for row and totalHours
    : 0;
    // Use validTotalIssues for average calculation
  const avgHours = validTotalIssues > 0 ? (totalHours / validTotalIssues).toFixed(2) : '0.00';


  return (
    <div className="space-y-6">
      {/* --- Stat Cards --- */}
      <div className="flex flex-col gap-4 sm:flex-row">
         {/* Use validTotalIssues */}
        <StatCard title="Total Issues" value={validTotalIssues} />
        <StatCard
          title="Avg. Time (All Groups)"
          value={`${avgHours}h`}
          subtext="Total hours / Total issues"
        />
      </div>

      {/* --- Status Distribution --- */}
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Current Status Distribution
        </h2>
         {/* Check if distribution is an array and has items */}
        {Array.isArray(distribution) && distribution.length > 0 ? (
          <div className="space-y-3">
            {distribution.map((group) => (
                // Add checks for group properties
               group && group.name != null ? ( // Check name existence
                <div key={group.name}>
                  <div className="mb-1 flex justify-between text-sm font-medium">
                    <span className="text-gray-700">{group.name}</span>
                    <span className="text-gray-500">
                       {/* Ensure count and percentage are numbers, default to 0 */}
                       {typeof group.count === 'number' ? group.count : 0} issues (
                       {typeof group.percentage === 'number' ? group.percentage.toFixed(1) : '0.0'}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                       // Ensure percentage is a number for style, default to 0
                      style={{ width: `${typeof group.percentage === 'number' ? group.percentage : 0}%` }}
                    ></div>
                  </div>
                </div>
               ) : null // Skip rendering if group or name is missing
            ))}
          </div>
         ) : (
          <p className="text-gray-500">No distribution data available.</p>
         )}
      </div>


      {/* --- Time In Status Table --- */}
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Average Time Spent in Status (per Issue)
        </h2>
         {/* Pass validTotalIssues to the table */}
        <TimeInStatusTable data={timeInStatusTable} totalIssues={validTotalIssues} />
      </div>
    </div>
  );
}


// --- Main App Component ---
function App() {
  // --- State ---
  const [projectKey, setProjectKey] = useState('');
  const [metadata, setMetadata] = useState(null); // { statuses: [], issueTypes: [], ... }
  const [statusGroups, setStatusGroups] = useState([]); // { id, name, statuses: [id1, id2] }
  const [issues, setIssues] = useState([]); // Ensure initialized as array
  const [processedData, setProcessedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Combined loading state for tickets & processing
  const [error, setError] = useState(null); // Combined error state
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState(null);

  // --- Handlers ---

  // Called from Header when a new project key is submitted
  const handleProjectKeyChange = useCallback(async (key) => {
    if (!key) return;
    console.log(`[App] handleProjectKeyChange called with key: ${key}`);
    setProjectKey(key);
    setIsMetadataLoading(true);
    setMetadataError(null);
    setMetadata(null); // Clear previous metadata
    setIssues([]); // Clear issues
    setProcessedData(null); // Clear processed data
    setStatusGroups([]); // Clear status groups
    setError(null); // Clear general errors

    try {
      const response = await axios.get(`${API_BASE_URL}/metadata?projectKey=${key}`);
      const meta = response.data;
       console.log('[App] Metadata fetched successfully:', meta);
       // Add basic validation for expected metadata structure
       if (meta && Array.isArray(meta.statuses) && Array.isArray(meta.issueTypes) && Array.isArray(meta.priorities)) { // ADDED: Check all expected arrays
          setMetadata(meta);

          // CRITICAL: Create the *default* status groups,
          // where every status is in its own group.
          const defaultGroups = meta.statuses
           .filter(s => s && s.id != null && s.name != null) // Filter out invalid statuses more strictly
           .map((s) => ({
             id: s.id, // Use status ID as unique group ID for default
             name: s.name,
             statuses: [String(s.id)], // Ensure status ID is a string in the array
           }));
           console.log('[App] Setting default status groups:', defaultGroups);
           setStatusGroups(defaultGroups);
       } else {
           console.error('[App] Metadata fetched but has unexpected structure:', meta);
           setMetadataError(`Received invalid metadata structure for project '${key}'.`);
           setMetadata(null); // Ensure metadata is null if structure is wrong
           setStatusGroups([]); // Ensure groups are empty
       }

    } catch (err) {
      console.error('[App] Failed to fetch metadata:', err);
       // Attempt to parse Jira error message
      const errorMessage = err.response?.data?.errorMessages?.join(' ') || err.response?.data?.error || err.message || 'Unknown error';
      setMetadataError(
        `Failed to load project '${key}'. Error: ${errorMessage}. Check project key and backend connection.`,
      );
       setMetadata(null); // Ensure metadata is null on error
       setStatusGroups([]); // Ensure groups are empty on error
    } finally {
      setIsMetadataLoading(false);
       console.log('[App] Metadata loading finished.');
    }
  }, []); // Empty dependency array is correct here

  // Called from FilterPanel when the user saves new group definitions
  const handleStatusGroupsChange = (newGroups) => {
     // console.log('[App] handleStatusGroupsChange called with:', newGroups); // Reduced verbosity
     // --- ADDED: Basic validation for newGroups ---
     if (Array.isArray(newGroups)) {
         setStatusGroups(newGroups);
         // Re-processing is handled by the useEffect hook
     } else {
         console.error('[App] handleStatusGroupsChange received non-array:', newGroups);
         setError("Failed to update status groups due to invalid format.");
     }
  };


  // Called from FilterPanel when "Apply Filters" is clicked
  const handleFilterSubmit = useCallback(
    (jqlFilter) => { // Using native fetch
       console.log(`[App] handleFilterSubmit called with jqlFilter: ${jqlFilter}`); // Log entry point
      if (!projectKey) {
          console.warn('[App] handleFilterSubmit aborted: No projectKey set.');
          setError("Please load a project first.");
          return;
      }
       if (!metadata) {
           console.warn('[App] handleFilterSubmit aborted: Metadata not loaded yet.');
           setError("Project metadata is still loading or failed to load.");
           return;
       }

      setIsLoading(true);
      setError(null);
      setProcessedData(null);
      setIssues([]);

      const requestUrl = `${API_BASE_URL}/tickets`;
      const requestPayload = { projectKey, jqlFilter };

      console.log('[App] Attempting fetch POST to:', requestUrl, 'with payload:', requestPayload);

      fetch(requestUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              // Add any other necessary headers (like auth if needed, though backend handles Jira auth)
          },
          body: JSON.stringify(requestPayload),
          // No explicit timeout with fetch easily, relies on browser defaults or AbortController
      })
      .then(response => {
          console.log('[App] fetch SUCCEEDED. Status:', response.status, 'Ok:', response.ok); // Log basic response info
          if (!response.ok) {
              // Handle HTTP errors (4xx, 5xx)
              console.error(`[App] fetch failed with HTTP status: ${response.status}`);
              // Attempt to parse error response body if available
              return response.json().then(errorData => {
                  console.error('[App] fetch error response body:', errorData);
                  throw new Error(errorData.error || `Request failed with status ${response.status}`);
              }).catch(parseError => {
                  // If parsing JSON fails, throw a generic error
                  console.error('[App] Failed to parse error response JSON:', parseError);
                  throw new Error(`Request failed with status ${response.status} and couldn't parse error response.`);
              });
          }
          return response.json(); // Parse the successful JSON response
      })
      .then(data => {
          console.log('[App] fetch JSON response received:', data); // Log the parsed JSON data

          if (data && Array.isArray(data.issues)) {
              const rawIssuesArray = data.issues;
              console.log(`[App] Fetched ${rawIssuesArray.length} issues successfully via fetch. Calling setIssues.`);
              console.log('[App] About to call setIssues via fetch with (first issue):', rawIssuesArray[0]);
              setIssues(rawIssuesArray);
              // Let useEffect handle processing
          } else {
              console.error('[App] Invalid JSON response structure received from /tickets (fetch):', data);
              setError('Received an invalid response structure from the server (fetch).');
              setIssues([]);
              setIsLoading(false); // Stop loading if response structure is bad
          }
      })
      .catch(err => {
          // Catches network errors, CORS errors (sometimes), and errors thrown from .then blocks
          console.error('[App] fetch FAILED - FULL ERROR OBJECT:', err);
          let errMsg = 'Failed to load ticket data. ';
          if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
              // This often indicates a Network error or CORS issue
               errMsg += 'Network error or CORS issue. Check browser console & network tab for details (e.g., Access-Control-Allow-Origin).';
          } else {
              errMsg += err.message || 'Unknown fetch error';
          }
          setError(errMsg.trim());
          setIssues([]);
          setIsLoading(false); // Stop loading on fetch error
      })
      .finally(() => {
          // --- ADDED: finally block ---
          console.log('[App] fetch promise settled (either resolved or rejected).');
          // Note: setIsLoading(false) is handled in .catch and useEffect after processing
          // Adding it here might stop loading too early if processing is needed.
          // Let's rely on the useEffect logic to manage the final loading state off.
      });

       console.log('[App] fetch request initiated...'); // Log after initiating the call

    },
    [projectKey, metadata],
  );

   // --- Effects ---

   // Effect to process metrics whenever issues or statusGroups change
  useEffect(() => {
     // --- ADDED: Log right at the start of the effect callback ---
    console.log('[App useEffect] Callback entered.');

     // --- ADDED: More detailed logs inside useEffect ---
    console.log('[App useEffect] Checking conditions...');
    console.log(`[App useEffect]   - issues isArray: ${Array.isArray(issues)}, length: ${issues?.length}`);
    console.log(`[App useEffect]   - statusGroups isArray: ${Array.isArray(statusGroups)}, length: ${statusGroups?.length}`);


    if (Array.isArray(issues) && issues.length > 0 && Array.isArray(statusGroups) && statusGroups.length > 0) {
      console.log('[App useEffect] Conditions MET. Processing metrics...');
      setIsLoading(true); // Set loading for the processing phase
      setError(null); // Clear previous processing errors
      try {
         console.time('[App useEffect] processMetrics duration'); // Start timer
         const metrics = processMetrics(issues, statusGroups);
         console.timeEnd('[App useEffect] processMetrics duration'); // End timer

         if (metrics === null) {
             console.warn('[App useEffect] processMetrics returned null. Clearing processedData.');
             setProcessedData(null);
         } else {
             console.log('[App useEffect] Metrics processed successfully, setting processedData:', metrics);
             setProcessedData(metrics);
         }
      } catch (err) {
        console.error('[App useEffect] Error during processMetrics execution:', err);
        setError('Failed to process ticket data. Check console for details.');
        setProcessedData(null); // Clear data on error
      } finally {
        setIsLoading(false); // Processing finished (success or error)
         console.log('[App useEffect] Metrics processing phase finished.');
      }
    } else {
       console.log('[App useEffect] Conditions NOT MET. Clearing processedData and ensuring loading is false.');
       setProcessedData(null); // Clear metrics if conditions aren't met
       // Ensure loading stops if effect runs because issues became empty
       if (isLoading && (!Array.isArray(issues) || issues.length === 0)) {
           // --- ADDED: Log why isLoading is being set to false here ---
           console.log('[App useEffect] Conditions not met, ensuring isLoading is set to false because issues array is empty/invalid.');
           setIsLoading(false);
       }
    }
  }, [issues, statusGroups]); // Dependencies are correct


  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <Header onProjectChange={handleProjectKeyChange} />

      {/* --- Metadata Loading/Error --- */}
       {isMetadataLoading && (
         <div className="container mx-auto mt-4 max-w-7xl p-4">
          <div className="flex items-center justify-center rounded-lg bg-blue-100 p-4 text-blue-700 shadow">
             <LoadingSpinner />
            <span className="ml-3 font-medium">Loading project metadata...</span>
          </div>
         </div>
       )}
      {metadataError && !isMetadataLoading && ( // Show error only when not loading metadata
        <div className="container mx-auto mt-4 max-w-7xl">
          <div
            className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow"
            role="alert"
          >
            <strong className="font-bold">Metadata Error: </strong>
            <span className="block sm:inline">{metadataError}</span>
          </div>
        </div>
      )}


      {/* --- Main Content Area (Filters & Dashboard) --- */}
       {/* Render main content only after metadata is successfully loaded AND there's no metadata error */}
       {/* --- WRAPPED in ErrorBoundary --- */}
       <ErrorBoundary>
          {metadata && !isMetadataLoading && !metadataError ? (
            <main className="container mx-auto grid max-w-7xl grid-cols-1 gap-6 p-4 pt-6 md:grid-cols-4">
              {/* Filter Panel */}
              <div className="col-span-1 md:col-span-1">
                <FilterPanel
                  metadata={metadata}
                  statusGroups={statusGroups}
                  onStatusGroupsChange={handleStatusGroupsChange}
                  onFilterSubmit={handleFilterSubmit}
                  // Pass combined loading state: true if metadata OR tickets/processing are loading
                  isLoading={isMetadataLoading || isLoading}
                />
              </div>
              {/* Metrics Dashboard */}
              <div className="col-span-1 md:col-span-3">
                {/* Pass 'isLoading' (ticket fetching & processing state) */}
                {/* Pass 'error' (combined error state) */}
                {/* --- ADDED: Log props passed to MetricsDashboard --- */}
                {/* console.log('[App Render] Passing props to MetricsDashboard:', { processedData, isLoading, error, issuesLength: issues?.length }) */} {/* Reduced verbosity */}
                <MetricsDashboard
                  processedData={processedData}
                  isLoading={isLoading} // Loading state for tickets/processing
                  error={error}       // Error state for tickets/processing
                  // Ensure issues is an array before passing length
                  totalIssues={Array.isArray(issues) ? issues.length : 0}
                />
              </div>
            </main>
          ) : // Show placeholder only if NOT loading metadata AND there is NO metadata error
            (!isMetadataLoading && !metadataError && (
                <div className="container mx-auto mt-6 max-w-7xl p-4 text-center text-gray-500">
                    Please enter a project key above and click "Load" to begin.
                </div>
            ))
          }
       </ErrorBoundary>
    </div>
  );
}

export default App;
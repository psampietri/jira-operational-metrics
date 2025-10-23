/*
 * JiraMetricsDashboard - main.jsx
 *
 * This is the root of the React application.
 * All components have been inlined into this single file to resolve build-time import errors.
 */
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
// import './index.css'; // Imports all Tailwind styles
// ^-- This import was removed to fix a build error.
// Please ensure Tailwind styles are loaded, for example,
// by linking the CSS file directly in your index.html.

// The backend API URL
const API_BASE_URL = 'http://localhost:3001/api/jira';

// --- INLINED: dataProcessor.js ---

/**
 * Main processing function.
 * @param {Array} issues - Array of raw issue objects from Jira API.
 * @param {Array} statusGroups - Array of { id, name, statuses: [id1, ...] }
 * @returns {Object} - { distribution, timeInStatusTable }
 */
function processMetrics(issues, statusGroups) {
  if (!issues || issues.length === 0 || !statusGroups || statusGroups.length === 0) {
    return null;
  }

  // --- 1. Create Lookup Maps ---
  // Create a map for { statusId -> 'GroupName' }
  const statusToGroupMap = new Map();
  // Create a map for { 'GroupName' -> 0 } to initialize counters
  const groupTimeCounters = new Map();
  const groupIssueCounters = new Map();

  statusGroups.forEach((group) => {
    group.statuses.forEach((statusId) => {
      statusToGroupMap.set(statusId, group.name);
    });
    groupTimeCounters.set(group.name, 0);
    groupIssueCounters.set(group.name, 0);
  });

  // --- 2. Calculate Status Distribution (Current Status) ---
  issues.forEach((issue) => {
    const currentStatusId = issue.fields.status.id;
    const groupName = statusToGroupMap.get(currentStatusId);
    if (groupName) {
      groupIssueCounters.set(groupName, groupIssueCounters.get(groupName) + 1);
    }
  });

  const totalIssues = issues.length;
  const distribution = Array.from(groupIssueCounters.entries()).map(
    ([name, count]) => ({
      name,
      count,
      percentage: (count / totalIssues) * 100,
    }),
  );

  // --- 3. Calculate Time In Status ---
  const timeInGroupMs = calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters);

  // --- 4. Format Final Table Data ---
  const timeInStatusTable = Array.from(timeInGroupMs.entries()).map(
    ([groupName, ms]) => ({
      groupName,
      totalMs: ms,
      totalHours: ms / (1000 * 60 * 60),
      totalDays: ms / (1000 * 60 * 60 * 24),
    }),
  );

  return { distribution, timeInStatusTable };
}

/**
 * Calculates the total time spent in each status *group*.
 * @param {Array} issues - Raw issues.
 * @param {Map} statusToGroupMap - { statusId -> 'GroupName' }
 * @param {Map} groupTimeCounters - { 'GroupName' -> 0 }
 * @returns {Map} - { 'GroupName' -> totalMs }
 */
function calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters) {
  const timeInGroup = new Map(groupTimeCounters); // Clone the initialized map

  for (const issue of issues) {
    // 1. Get all *status* changes from the changelog
    const statusChanges = issue.changelog.histories
      .flatMap((history) =>
        history.items
          .filter((item) => item.field === 'status')
          .map((item) => ({
            timestamp: new Date(history.created),
            fromId: item.from,
            toId: item.to,
          })),
      )
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by date, ascending

    // 2. Build a complete issue timeline
    const timeline = [];

    // Add the "Creation" event as the first entry
    // We find the *first* status from the first changelog item.
    // If no changelog, we sadly can't process time.
    const firstChange = statusChanges[0];
    const createdStatusId = firstChange ? firstChange.fromId : null;

    // Only process if we have a valid creation status
    if (createdStatusId) {
      timeline.push({
        timestamp: new Date(issue.fields.created),
        statusId: createdStatusId,
      });

      // Add all subsequent changes
      statusChanges.forEach((change) => {
        timeline.push({
          timestamp: change.timestamp,
          statusId: change.toId,
        });
      });

      // 3. Iterate the timeline and sum durations by *group*
      for (let i = 0; i < timeline.length; i++) {
        const startEvent = timeline[i];
        const endEvent = timeline[i + 1] || { timestamp: new Date() }; // Use "now" as the end for the *last* status

        const groupName = statusToGroupMap.get(startEvent.statusId);

        // If the status belongs to a group we care about
        if (groupName) {
          const durationMs =
            endEvent.timestamp.getTime() - startEvent.timestamp.getTime();

          if (durationMs > 0) {
            timeInGroup.set(
              groupName,
              timeInGroup.get(groupName) + durationMs,
            );
          }
        }
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

// --- INLINED: components/TimeInStatusTable.jsx ---
function TimeInStatusTable({ data, totalIssues }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-500">No time-in-status data to display.</p>;
  }

  // Calculate averages
  const tableData = data.map((row) => ({
    ...row,
    avgHours: row.totalHours / totalIssues,
    avgDays: row.totalDays / totalIssues,
  }));

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
              {tableData.map((row) => (
                <tr key={row.groupName} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {row.groupName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {row.avgHours.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {row.avgDays.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {row.totalHours.toFixed(2)}
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
  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow-lg"
        role="alert"
      >
        <strong className="font-bold">Error: </strong>
        <span className="block sm:inline">{error}</span>
      </div>
    );
  }

  if (!processedData) {
    return (
      <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-lg">
        {totalIssues === 0
          ? 'Found 0 issues matching your criteria. Adjust your filters and try again.'
          : 'Please apply filters to load metrics.'}
      </div>
    );
  }

  const { distribution, timeInStatusTable } = processedData;

  return (
    <div className="space-y-6">
      {/* --- Stat Cards --- */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <StatCard title="Total Issues" value={totalIssues} />
        <StatCard
          title="Avg. Time (All Groups)"
          value={`${(
            timeInStatusTable.reduce((acc, row) => acc + row.totalHours, 0) /
            totalIssues
          ).toFixed(2)}h`}
          subtext="Total hours / Total issues"
        />
      </div>

      {/* --- Status Distribution --- */}
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Current Status Distribution
        </h2>
        <div className="space-y-3">
          {distribution.map((group) => (
            <div key={group.name}>
              <div className="mb-1 flex justify-between text-sm font-medium">
                <span className="text-gray-700">{group.name}</span>
                <span className="text-gray-500">
                  {group.count} issues ({group.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-blue-500"
                  style={{ width: `${group.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Time In Status Table --- */}
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Average Time Spent in Status (per Issue)
        </h2>
        <TimeInStatusTable data={timeInStatusTable} totalIssues={totalIssues} />
      </div>
    </div>
  );
}

// --- INLINED: App.jsx (Main App Component) ---
function App() {
  // --- State ---
  const [projectKey, setProjectKey] = useState('');
  const [metadata, setMetadata] = useState(null); // issue types, priorities, statuses
  const [issues, setIssues] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for status grouping.
  // This is the "source of truth" for the group definitions.
  // Default: Each status is its own group.
  const [statusGroups, setStatusGroups] = useState([]);

  // --- Callbacks ---

  // Fetches base metadata (issue types, priorities, statuses)
  const fetchMetadata = useCallback(async (key) => {
    if (!key) return;
    console.log('Fetching metadata for:', key);
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/metadata`, {
        params: { projectKey: key },
      });
      setMetadata(response.data);

      // IMPORTANT: Initialize default status groups
      // By default, every status is its own group.
      const defaultGroups = response.data.statuses.map((status) => ({
        id: status.id,
        name: status.name,
        statuses: [status.id], // A group of one
      }));
      setStatusGroups(defaultGroups);
    } catch (err) {
      console.error('Error fetching metadata:', err);
      setError(
        err.response?.data?.error || 'Failed to fetch project metadata.',
      );
      setMetadata(null);
      setStatusGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetches tickets based on project key and JQL filter
  const fetchTickets = useCallback(
    async (jqlFilter) => {
      if (!projectKey) {
        setError('Please enter a project key first.');
        return;
      }
      console.log('Fetching tickets with JQL:', jqlFilter);
      setIsLoading(true);
      setError(null);
      setProcessedData(null); // Clear old data
      setIssues([]);

      try {
        const response = await axios.post(`${API_BASE_URL}/tickets`, {
          projectKey,
          jqlFilter,
        });
        setIssues(response.data);
      } catch (err) {
        console.error('Error fetching tickets:', err);
        setError(err.response?.data?.error || 'Failed to fetch tickets.');
        setIssues([]);
      } finally {
        setIsLoading(false);
      }
    },
    [projectKey],
  );

  // Handler for when the "Load" button is clicked in the Header
  const handleProjectChange = (newProjectKey) => {
    setProjectKey(newProjectKey);
    setMetadata(null);
    setIssues([]);
    setProcessedData(null);
    setError(null);
    fetchMetadata(newProjectKey);
  };

  // Handler for when the "Save Groups" button is clicked
  const handleStatusGroupsChange = (newGroups) => {
    console.log('New status groups defined:', newGroups);
    setStatusGroups(newGroups);
    // Re-process existing issue data with the new groups
    if (issues.length > 0) {
      console.log('Re-processing metrics with new groups...');
      const metrics = processMetrics(issues, newGroups);
      setProcessedData(metrics);
    }
  };

  // --- Effects ---

  // Re-process metrics whenever the raw issues or status groups change
  useEffect(() => {
    if (issues.length > 0 && statusGroups.length > 0) {
      console.log('Processing metrics...');
      try {
        const metrics = processMetrics(issues, statusGroups);
        setProcessedData(metrics);
      } catch (err) {
        console.error('Error processing metrics:', err);
        setError('Failed to process ticket data. Check console for details.');
      }
    } else {
      setProcessedData(null); // Clear metrics if no issues
    }
  }, [issues, statusGroups]);

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-100">
      <Header onProjectChange={handleProjectChange} />

      <main className="container mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* --- Left Column: Filters --- */}
          <div className="lg:col-span-1">
            <FilterPanel
              metadata={metadata}
              statusGroups={statusGroups}
              onStatusGroupsChange={handleStatusGroupsChange}
              onFilterSubmit={fetchTickets}
              isLoading={isLoading}
            />
          </div>

          {/* --- Right Column: Dashboard --- */}
          <div className="lg:col-span-3">
            <MetricsDashboard
              processedData={processedData}
              isLoading={isLoading && !processedData} // Show loading only if no data is present
              error={error}
              totalIssues={issues.length}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// --- React App Entry Point ---
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);


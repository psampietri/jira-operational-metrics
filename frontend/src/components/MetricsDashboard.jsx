/*
 * JiraMetricsDashboard - MetricsDashboard.jsx
 *
 * This component displays the calculated metrics:
 * - Status Distribution (as percentages)
 * - The detailed Time In Status Table
 *
 * It also handles the loading and error states for the dashboard area.
 */

import React from 'react';
// import TimeInStatusTable from './TimeInStatusTable'; // This will be inlined

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

export default MetricsDashboard;


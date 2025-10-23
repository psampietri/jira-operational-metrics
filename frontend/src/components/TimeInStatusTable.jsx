/*
 * JiraMetricsDashboard - TimeInStatusTable.jsx
 *
 * Displays the detailed time-in-status metrics in a table format.
 */

import React from 'react';

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
                    {row.groupName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {(typeof row.avgHours === 'number' ? row.avgHours : 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {(typeof row.avgDays === 'number' ? row.avgDays : 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
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

export default TimeInStatusTable;
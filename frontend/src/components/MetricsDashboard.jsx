/*
 * JiraMetricsDashboard - MetricsDashboard.jsx
 *
 * Displays metrics in tabs: Summary Cards, Flow Metrics, Current State.
 * Passes detailed data to TimeInStatusTable for drilldown.
 */

import React, { useState } from 'react';
import TimeInStatusTable from './TimeInStatusTable.jsx'; // Ensure correct path
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, AreaChart, Area,
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// --- Helper Components ---
// Defined properly now

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

const StatCard = ({ title, value, subtext }) => (
    <div className="flex-1 rounded-lg bg-white p-4 shadow min-w-[150px]"> {/* Added min-width */}
        <div className="text-sm font-medium text-gray-500 truncate">{title}</div> {/* Added truncate */}
        <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
        {subtext && <div className="text-sm text-gray-400">{subtext}</div>}
    </div>
);

// --- Charting Helpers ---

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF',
  '#FF1919', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#6EE7B7', '#FCD34D', '#F87171'
];

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded border bg-white p-2 text-sm shadow">
        <p className="font-bold">{data.name}</p>
        <p className="text-blue-600">{`Count: ${data.count}`}</p>
        <p className="text-gray-600">{`Percentage: ${data.percentage?.toFixed(1) ?? 0}%`}</p> {/* Added optional chaining and default */}
      </div>
    );
  }
  return null;
};

const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded border bg-white p-2 text-sm shadow">
        <p className="font-bold">{label}</p>
        {payload.map((entry, index) => (
          <p
            key={`item-${index}`}
            style={{ color: entry.color || entry.fill }}
          >
            {/* Added check for entry.value */}
            {`${entry.name}: ${
              typeof entry.value === 'number' && entry.value.toFixed ? entry.value.toFixed(2) : entry.value ?? 'N/A'
            }`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const RADIAN = Math.PI / 180;
const renderCustomizedPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if ((percent ?? 0) * 100 < 5) { // Added default for percent
        return null;
    }
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight="bold">
            {`${((percent ?? 0) * 100).toFixed(0)}%`}
        </text>
    );
};
// --- End Helper Components & Charting Helpers ---


function MetricsDashboard({
    processedData,
    isLoading,
    error,
    groupOrder = [], // Added default empty array
    statusMap,
    statusGroups
}) {
  const [activeTab, setActiveTab] = useState('flow');

  // Loading State
  if (isLoading) {
      return (
          <div className="rounded-lg bg-white p-6 shadow-lg">
              <LoadingSpinner />
          </div>
      );
  }

  // Error State (only show if not loading)
  if (error && !isLoading) {
      return (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow-lg" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{String(error)}</span>
          </div>
      );
  }

  // Initial/Empty State (only show if not loading and no error)
  if (!processedData && !isLoading && !error) {
      return (
          <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-lg">
              Please load a project, configure status groups/flow points, and click "Load Ticket Data".
          </div>
      );
   }

  // Data Loaded State - Proceed only if processedData is valid
  if (!processedData) return null; // Should be covered above, but safe fallback

  const {
    distribution, // { byStatus, byGroup }
    timeInStatus, // { byStatus, byGroup }
    cycleTimeData = {}, // Provide defaults
    throughputData = [], // Provide defaults
    cfdData = [], // Provide defaults
    summaryStats = {}, // Provide defaults
    supportMetrics = {}, // Provide defaults
  } = processedData;

  // Helper to get color
  const getGroupColor = (groupName) => {
      const index = groupOrder.indexOf(groupName);
      // Fallback color if groupOrder is empty or name not found
      return index > -1 ? COLORS[index % COLORS.length] : '#8884d8';
  };

  return (
    <div className="space-y-6">
      {/* --- Stat Cards --- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {/* Use optional chaining and provide defaults */}
        <StatCard title="MTTA" value={`${(supportMetrics.avgMttaHours ?? 0).toFixed(1)}h`} subtext="Mean Time to Acknowledge"/>
        <StatCard title="MTTR" value={`${(supportMetrics.avgMttrHours ?? 0).toFixed(1)}h`} subtext="Mean Time to Resolution"/>
        <StatCard title="Avg Cycle (Work)" value={`${(summaryStats.avgCycleTime ?? 0).toFixed(1)}d`} subtext="In Progress to Resolved"/>
        <StatCard title="Median Cycle (Work)" value={`${(summaryStats.p50CycleTime ?? 0).toFixed(1)}d`} subtext="50% finish within (days)"/>
        <StatCard title="85th % Cycle (Work)" value={`${(summaryStats.p85CycleTime ?? 0).toFixed(1)}d`} subtext="85% finish within (days)"/>
        <StatCard title="Current WIP" value={summaryStats.currentWIP ?? 0} subtext="Issues In Progress"/>
      </div>

      {/* --- Tab Navigation --- */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
           <button onClick={() => setActiveTab('flow')} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${ activeTab === 'flow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' }`} > Flow & Cycle Time </button>
           <button onClick={() => setActiveTab('current')} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${ activeTab === 'current' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' }`} > Current State </button>
        </nav>
      </div>

      {/* --- Tab Content --- */}
      <div className="space-y-6">
        {/* --- Flow Metrics Tab --- */}
        {activeTab === 'flow' && (
          <>
            {/* CFD */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Cumulative Flow Diagram</h2>
                {cfdData && cfdData.length > 0 ? (
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cfdData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" fontSize={12} />
                                <YAxis label={{ value: 'Issue Count', angle: -90, position: 'insideLeft' }} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend />
                                {groupOrder.map((groupName) => (
                                    <Area key={groupName} type="monotone" dataKey={groupName} name={groupName} stackId="1"
                                          stroke={getGroupColor(groupName)} fill={getGroupColor(groupName)} fillOpacity={0.7} connectNulls={false} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : ( <p className="text-gray-500">No CFD data available. Check date range and group configuration.</p> )}
            </div>

            {/* Cycle Time Histogram */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Cycle Time Histogram (Work: Start to End Point)</h2>
                {cycleTimeData?.histogram && cycleTimeData.histogram.length > 0 ? (
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cycleTimeData.histogram} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="range" fontSize={12} />
                                <YAxis allowDecimals={false} label={{ value: 'Issue Count', angle: -90, position: 'insideLeft' }} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Bar dataKey="count" name="Issues" fill="#3B82F6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : ( <p className="text-gray-500">No cycle time data available. Ensure Start/End points are configured and issues completed the cycle.</p> )}
            </div>

            {/* Throughput */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Throughput (Completed Issues per Day)</h2>
                {throughputData && throughputData.length > 0 ? (
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={throughputData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" fontSize={12} />
                                <YAxis allowDecimals={false} label={{ value: 'Issues Completed', angle: -90, position: 'insideLeft' }}/>
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend />
                                <Line type="monotone" dataKey="count" name="Completed" stroke="#10B981" strokeWidth={2} dot={true} activeDot={{ r: 6 }}/>
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : ( <p className="text-gray-500">No throughput data available. Ensure End point is configured and issues were completed in the date range.</p> )}
            </div>
          </>
        )}

        {/* --- Current State Tab --- */}
        {activeTab === 'current' && (
          <>
            {/* Distribution Pie Chart (Uses Group Data) */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">
                Current Status Distribution (by Group)
              </h2>
              {distribution?.byGroup && distribution.byGroup.some(d => d.count > 0) ? (
                <div style={{ width: '100%', height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution.byGroup.filter((d) => d.count > 0)}
                        cx="50%" cy="50%" labelLine={false} label={renderCustomizedPieLabel}
                        outerRadius={150} fill="#8884d8" dataKey="count" nameKey="name"
                      >
                        {distribution.byGroup
                            .filter((d) => d.count > 0)
                            .map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getGroupColor(entry.name)}/>
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                      <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{paddingTop: '20px'}}/> {/* Adjusted Legend */}
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : ( <p className="text-gray-500">No distribution data available.</p> )}
            </div>

            {/* Time In Status Table */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">
                Average Time Spent in Status (per Issue)
              </h2>
              {/* Ensure necessary props are passed, provide defaults */}
              <TimeInStatusTable
                timeData={timeInStatus} // Pass object { byStatus, byGroup }
                totalIssues={summaryStats?.totalIssues ?? 0}
                statusMap={statusMap ?? new Map()} // Pass map or empty map
                statusGroups={statusGroups ?? []} // Pass groups or empty array
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MetricsDashboard;
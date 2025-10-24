/*
 * JiraMetricsDashboard - MetricsDashboard.jsx
 *
 * Displays metrics in tabs: Overall Metrics, Flow Metrics, Current State.
 * Includes improved Stat Cards with tooltips.
 */

import React, { useState } from 'react';
import TimeInStatusTable from './TimeInStatusTable.jsx';
import StatCardWithTooltip from './StatCardWithTooltip.jsx'; // Using the updated card
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  Legend, AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// --- Helper Components ---
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

// --- Charting Helpers ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1919', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6EE7B7', '#FCD34D', '#F87171'];
const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="rounded border bg-white p-2 text-sm shadow">
                <p className="font-bold">{data.name}</p>
                <p className="text-blue-600">{`Count: ${data.count}`}</p>
                <p className="text-gray-600">{`Percentage: ${data.percentage?.toFixed(1) ?? 0}%`}</p>
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
                    <p key={`item-${index}`} style={{ color: entry.color || entry.fill }}>
                        {`${entry.name}: ${typeof entry.value === 'number' && entry.value.toFixed ? entry.value.toFixed(2) : entry.value ?? 'N/A'}`}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};
const RADIAN = Math.PI / 180;
const renderCustomizedPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if ((percent ?? 0) * 100 < 5) { return null; }
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
    groupOrder = [],
    statusMap,
    statusGroups
}) {
  const [activeTab, setActiveTab] = useState('overall');

  // Loading State
  if (isLoading) { return ( <div className="rounded-lg bg-white p-6 shadow-lg"><LoadingSpinner /></div> ); }

  // Error State
  if (error && !isLoading) { return ( <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow-lg" role="alert"><strong className="font-bold">Error: </strong><span className="block sm:inline">{String(error)}</span></div> ); }

  // Initial/Empty State
  if (!processedData && !isLoading && !error) { return ( <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-lg">Please load a project...</div> ); }

  // Data Loaded State
  if (!processedData) return null;

  const {
    distribution, timeInStatus, cycleTimeData = {}, throughputData = [],
    cfdData = [], summaryStats = {}, supportMetrics = {},
  } = processedData;

  console.log('[MetricsDashboard] Rendering with:', { summaryStats, supportMetrics });

  const getGroupColor = (groupName) => {
       const index = groupOrder.indexOf(groupName);
      return index > -1 ? COLORS[index % COLORS.length] : '#8884d8';
  };
  const minChartHeight = 200;

  // Tooltip Text Definitions
  const tooltipTexts = {
      mtta: "Mean Time to Acknowledge (MTTA): Average time from issue creation until it moves out of the configured 'Triage/New' status/group.",
      mttr: "Mean Time to Resolution (MTTR): Average time from issue creation until it first enters the configured 'Resolution' status/group.",
      avgCycle: "Average Cycle Time (Work): Average time from first entering the configured 'Work Start' status/group until first entering the configured 'Resolution' status/group.",
      p50Cycle: "Median Cycle Time (Work): 50% of issues that completed the work cycle finished within this many days (P50). Calculated between 'Work Start' and 'Resolution' points.",
      p85Cycle: "85th Percentile Cycle Time (Work): 85% of issues that completed the work cycle finished within this many days (P85). Calculated between 'Work Start' and 'Resolution' points.",
      // currentWip: "Current Work In Progress (WIP): Count of issues currently in any status *not* included in the 'Triage/New', 'Work Start', or 'Resolution' configurations." // Removed
  };

  const formatValue = (value, unit, decimals = 1) => {
      const num = Number(value);
       if (value === null || value === undefined || isNaN(num)) {
          return `0${unit}`;
      }
      return `${num.toFixed(decimals)}${unit}`;
  };

  return (
    <div className="space-y-6">
      {/* --- Tab Navigation --- */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
           <button onClick={() => setActiveTab('overall')} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${ activeTab === 'overall' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' }`} > Overall Metrics </button>
           <button onClick={() => setActiveTab('flow')} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${ activeTab === 'flow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' }`} > Flow & Cycle Time </button>
           <button onClick={() => setActiveTab('current')} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${ activeTab === 'current' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' }`} > Current State </button>
        </nav>
      </div>

      {/* --- Tab Content --- */}
      <div className="space-y-6">

        {/* --- Overall Metrics Tab Content --- */}
        {activeTab === 'overall' && (
             // --- Use flex column for sections ---
             <div className="flex flex-col space-y-6">

                {/* --- Operations Metrics Section --- */}
                <div>
                    <h3 className="mb-3 text-lg font-semibold text-gray-700 border-b pb-1">
                        Operational Metrics 🛠️
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <StatCardWithTooltip
                            title="MTTA"
                            value={formatValue(supportMetrics.avgMttaHours, 'h')}
                            subtext="Mean Time to Acknowledge"
                            tooltipText={tooltipTexts.mtta}
                            iconPlaceholder="⏱️"
                        />
                        <StatCardWithTooltip
                            title="MTTR"
                            value={formatValue(supportMetrics.avgMttrHours, 'h')}
                            subtext="Mean Time to Resolution"
                            tooltipText={tooltipTexts.mttr}
                            iconPlaceholder="✅"
                        />
                         {/* Add more operational cards here if needed */}
                    </div>
                </div>

                {/* --- Cycle Time Metrics Section --- */}
                 <div>
                    <h3 className="mb-3 text-lg font-semibold text-gray-700 border-b pb-1">
                        Work Cycle Time 🔄
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                         <StatCardWithTooltip
                            title="Avg Cycle (Work)"
                            value={formatValue(summaryStats.avgCycleTime, 'd')}
                            subtext="In Progress to Resolved"
                            tooltipText={tooltipTexts.avgCycle}
                            iconPlaceholder="⏳"
                        />
                        <StatCardWithTooltip
                            title="Median Cycle (Work)"
                            value={formatValue(summaryStats.p50CycleTime, 'd')}
                            subtext="50% finish within (days)"
                            tooltipText={tooltipTexts.p50Cycle}
                            iconPlaceholder="📊"
                        />
                        <StatCardWithTooltip
                            title="85th % Cycle (Work)"
                            value={formatValue(summaryStats.p85CycleTime, 'd')}
                            subtext="85% finish within (days)"
                            tooltipText={tooltipTexts.p85Cycle}
                            iconPlaceholder="📈"
                        />
                    </div>
                </div>

                 {/* --- REMOVED Current WIP Card --- */}

             </div>
        )}

        {/* --- Flow Metrics Tab --- */}
        {activeTab === 'flow' && (
          <>
            {/* CFD */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Cumulative Flow Diagram</h2>
                {cfdData && cfdData.length > 0 ? ( <div style={{ width: '100%', height: 400 }}> <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={minChartHeight}> <AreaChart data={cfdData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}> <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="date" fontSize={12} /> <YAxis label={{ value: 'Issue Count', angle: -90, position: 'insideLeft' }} /> <RechartsTooltip content={<CustomChartTooltip />} /> <Legend /> {groupOrder.map((groupName) => ( <Area key={groupName} type="monotone" dataKey={groupName} name={groupName} stackId="1" stroke={getGroupColor(groupName)} fill={getGroupColor(groupName)} fillOpacity={0.7} connectNulls={false} /> ))} </AreaChart> </ResponsiveContainer> </div> ) : ( <p className="text-gray-500">No CFD data available.</p> )}
            </div>
            {/* Cycle Time Histogram */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Cycle Time Histogram (Work: Start to End Point)</h2>
                {cycleTimeData?.histogram && cycleTimeData.histogram.length > 0 ? ( <div style={{ width: '100%', height: 300 }}> <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={minChartHeight}> <BarChart data={cycleTimeData.histogram} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}> <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="range" fontSize={12} /> <YAxis allowDecimals={false} label={{ value: 'Issue Count', angle: -90, position: 'insideLeft' }} /> <RechartsTooltip content={<CustomChartTooltip />} /> <Bar dataKey="count" name="Issues" fill="#3B82F6" /> </BarChart> </ResponsiveContainer> </div> ) : ( <p className="text-gray-500">No cycle time data available.</p> )}
            </div>
            {/* Throughput */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">Throughput (Completed Issues per Day)</h2>
                {throughputData && throughputData.length > 0 ? ( <div style={{ width: '100%', height: 300 }}> <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={minChartHeight}> <LineChart data={throughputData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}> <CartesianGrid strokeDasharray="3 3" /> <XAxis dataKey="date" fontSize={12} /> <YAxis allowDecimals={false} label={{ value: 'Issues Completed', angle: -90, position: 'insideLeft' }}/> <RechartsTooltip content={<CustomChartTooltip />} /> <Legend /> <Line type="monotone" dataKey="count" name="Completed" stroke="#10B981" strokeWidth={2} dot={true} activeDot={{ r: 6 }}/> </LineChart> </ResponsiveContainer> </div> ) : ( <p className="text-gray-500">No throughput data available.</p> )}
            </div>
          </>
        )}

        {/* --- Current State Tab --- */}
        {activeTab === 'current' && (
          <>
            {/* Distribution Pie Chart */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">Current Status Distribution (by Group)</h2>
              {distribution?.byGroup && distribution.byGroup.some(d => d.count > 0) ? ( <div style={{ width: '100%', height: 400 }}> <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={minChartHeight}> <PieChart> <Pie data={distribution.byGroup.filter((d) => d.count > 0)} cx="50%" cy="50%" labelLine={false} label={renderCustomizedPieLabel} outerRadius={150} fill="#8884d8" dataKey="count" nameKey="name"> {distribution.byGroup .filter((d) => d.count > 0) .map((entry, index) => ( <Cell key={`cell-${index}`} fill={getGroupColor(entry.name)}/> ))} </Pie> <RechartsTooltip content={<CustomPieTooltip />} /> <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{paddingTop: '20px'}}/> </PieChart> </ResponsiveContainer> </div> ) : ( <p className="text-gray-500">No distribution data available.</p> )}
            </div>
            {/* Time In Status Table */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">Average Time Spent in Status (per Issue)</h2>
              <TimeInStatusTable timeData={timeInStatus} totalIssues={summaryStats?.totalIssues ?? 0} statusMap={statusMap ?? new Map()} statusGroups={statusGroups ?? []} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MetricsDashboard;
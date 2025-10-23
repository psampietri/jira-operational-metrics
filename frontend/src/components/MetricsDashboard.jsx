/*
 * JiraMetricsDashboard - MetricsDashboard.jsx
 *
 * This component displays the calculated metrics:
 * - Status Distribution (as a pie chart)
 * - The detailed Time In Status Table
 *
 * It also handles the loading and error states for the dashboard area.
 */

import React from 'react';
import TimeInStatusTable from './TimeInStatusTable';
// --- UPDATED: Import Recharts components for Pie Chart ---
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell, // Needed for coloring slices
    Tooltip,
    Legend
} from 'recharts';

// A simple loading spinner component
// ... (LoadingSpinner component remains the same)
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
// ... (StatCard component remains the same)
const StatCard = ({ title, value, subtext }) => (
    <div className="flex-1 rounded-lg bg-white p-4 shadow">
        <div className="text-sm font-medium text-gray-500">{title}</div>
        <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
        {subtext && <div className="text-sm text-gray-400">{subtext}</div>}
    </div>
);


// --- ADDED: Colors for Pie Chart Slices ---
// (You can expand this list or use a color generation library for more groups)
const COLORS = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF',
    '#FF1919', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#6EE7B7', '#FCD34D', '#F87171'
];

// --- ADDED: Custom Tooltip for Pie Chart ---
const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload; // Access the full data point for the slice
        return (
            <div className="rounded border bg-white p-2 text-sm shadow">
                <p className="font-bold">{data.name}</p> {/* Status Group Name */}
                <p className="text-blue-600">{`Count: ${data.count}`}</p>
                <p className="text-gray-600">{`Percentage: ${data.percentage.toFixed(1)}%`}</p>
            </div>
        );
    }
    return null;
};

// --- ADDED: Custom Label for Pie Chart Slices ---
const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, count }) => {
    // Only show labels for slices > a certain percentage to avoid clutter
    if (percent * 100 < 3) {
        return null;
    }
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5; // Position label halfway
    // Use slightly larger radius for label line end
    const radiusLineEnd = innerRadius + (outerRadius - innerRadius) * 0.7;
    const x = cx + radiusLineEnd * Math.cos(-midAngle * RADIAN);
    const y = cy + radiusLineEnd * Math.sin(-midAngle * RADIAN);
    const xLabel = cx + (outerRadius + 15) * Math.cos(-midAngle * RADIAN); // Position text outside
    const yLabel = cy + (outerRadius + 15) * Math.sin(-midAngle * RADIAN);
    const textAnchor = xLabel > cx ? 'start' : 'end';

    return (
        <g>
            {/* Line from slice towards label */}
            <path d={`M${cx},${cy}L${x},${y}`} stroke="#6b7280" fill="none" />
            <circle cx={x} cy={y} r={2} fill="#6b7280" stroke="none" />
            {/* Text Label */}
            <text x={xLabel} y={yLabel} fill="#374151" textAnchor={textAnchor} dominantBaseline="central" fontSize={12}>
                {`${name} (${(percent * 100).toFixed(0)}%)`}
            </text>
        </g>

    );
};


function MetricsDashboard({ processedData, isLoading, error, totalIssues }) {
    // Ensure totalIssues is a non-negative number
    const validTotalIssues = Math.max(0, totalIssues || 0);

    if (isLoading) {
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
                <span className="block sm:inline">{String(error)}</span>
            </div>
        );
    }

    // Check specifically if processedData is null or lacks expected structure
    if (!processedData || !Array.isArray(processedData.distribution) || !Array.isArray(processedData.timeInStatusTable)) {
        return (
            <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-lg">
                {validTotalIssues === 0 && !isLoading
                    ? 'Found 0 issues matching your criteria. Adjust your filters and try again.'
                    : 'Please apply filters or wait for data to load metrics.'}
            </div>
        );
    }

    const { distribution, timeInStatusTable } = processedData;

    // No sorting needed for pie chart data generally, unless you want consistent slice order

    // Calculate total hours safely
    const totalHours = Array.isArray(timeInStatusTable)
        ? timeInStatusTable.reduce((acc, row) => acc + ((row && typeof row.totalHours === 'number') ? row.totalHours : 0), 0)
        : 0;
    // Calculate average hours safely
    const avgHours = validTotalIssues > 0 ? (totalHours / validTotalIssues).toFixed(2) : '0.00';


    return (
        <div className="space-y-6">
            {/* --- Stat Cards --- */}
            <div className="flex flex-col gap-4 sm:flex-row">
                <StatCard title="Total Issues" value={validTotalIssues} />
                <StatCard
                    title="Avg. Time (All Groups)"
                    value={`${avgHours}h`}
                    subtext="Total hours / Total issues"
                />
            </div>

            {/* --- Status Distribution (Pie Chart) --- */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">
                    Current Status Distribution
                </h2>
                {Array.isArray(distribution) && distribution.length > 0 ? (
                    // --- REPLACED Bar Chart with Pie Chart ---
                    <div style={{ width: '100%', height: 400 }}> {/* Adjust height as needed */}
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={distribution}
                                    cx="50%" // Center X
                                    cy="50%" // Center Y
                                    labelLine={false} // Disable default label lines, using custom
                                    label={renderCustomizedLabel} // Use custom label function
                                    outerRadius={120} // Adjust size of pie
                                    fill="#8884d8"
                                    dataKey="count" // Size slices based on count
                                    nameKey="name" // Use group name for labels/tooltips
                                >
                                    {distribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomPieTooltip />} />
                                {/* Optional Legend: Can be cluttered. Consider removing if too many items */}
                                {/* <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: '12px' }}/> */}
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-gray-500">No distribution data available.</p>
                )}
                {/* --- END Pie Chart Replacement --- */}
            </div>


            {/* --- Time In Status Table --- */}
            <div className="rounded-lg bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-xl font-semibold text-gray-800">
                    Average Time Spent in Status (per Issue)
                </h2>
                <TimeInStatusTable data={timeInStatusTable} totalIssues={validTotalIssues} />
            </div>
        </div>
    );
}

export default MetricsDashboard;
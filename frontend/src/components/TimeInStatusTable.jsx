/*
 * JiraMetricsDashboard - TimeInStatusTable.jsx
 *
 * Displays time-in-status metrics, aggregated by Group,
 * with expandable rows to show details per individual Status.
 */

import React, { useState, useMemo } from 'react';

// Simple arrow icon for expand/collapse
const ExpandIcon = ({ expanded }) => (
    <svg className={`inline-block h-4 w-4 transform transition-transform duration-150 ${expanded ? 'rotate-90' : 'rotate-0'}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
);


function TimeInStatusTable({
    timeData, // Expects { byStatus: [...], byGroup: [...] }
    totalIssues,
    statusMap, // Map<string, string> statusId -> statusName (for lookup)
    statusGroups // Array<{ name: string, statuses: string[] }> (for finding statuses in a group)
}) {
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    // --- Input Validation ---
    if (!timeData || !Array.isArray(timeData.byGroup) || !Array.isArray(timeData.byStatus)) {
        return <p className="text-gray-500">No time-in-status data available.</p>;
    }
    const { byGroup, byStatus } = timeData;
    if (byGroup.length === 0 && byStatus.length === 0) {
       return <p className="text-gray-500">No time-in-status data processed.</p>;
    }

    // --- Data Preparation ---
    // Create a quick lookup map: groupName -> [statusId1, statusId2, ...]
    const groupToStatusIdsMap = useMemo(() => {
        const map = new Map();
        if (Array.isArray(statusGroups)) {
            statusGroups.forEach(group => {
                if (group.name && Array.isArray(group.statuses)) {
                    map.set(group.name, new Set(group.statuses.map(String))); // Ensure IDs are strings
                }
            });
        }
        return map;
    }, [statusGroups]);

    // Create a map for quick lookup of status data by ID
    const statusDataMap = useMemo(() => {
        const map = new Map();
        byStatus.forEach(status => {
            map.set(String(status.id), status); // Ensure key is string
        });
        return map;
    }, [byStatus]);

    // --- Handlers ---
    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }
            return next;
        });
    };

    // --- Rendering ---
    const renderRow = (item, isGroup, isExpanded = false, indent = false) => {
        const name = isGroup ? item.groupName : item.name;
        const avgHours = (typeof item.avgHours === 'number' ? item.avgHours : 0).toFixed(2);
        const avgDays = (typeof item.avgDays === 'number' ? item.avgDays : 0).toFixed(2);
        const totalHours = (typeof item.totalHours === 'number' ? item.totalHours : 0).toFixed(2);
        const key = isGroup ? `group-${name}` : `status-${item.id}`;

        return (
            <tr key={key} className={indent ? "bg-gray-50 hover:bg-gray-100" : "hover:bg-gray-50"}>
                {/* Name Column with Indent and Expander */}
                <td className={`whitespace-nowrap px-6 py-3 text-sm ${indent ? 'pl-10' : 'pl-6'} ${isGroup ? 'font-medium text-gray-900 cursor-pointer' : 'text-gray-700'}`}
                    onClick={isGroup ? () => toggleGroup(name) : undefined}
                    title={isGroup ? `Click to ${isExpanded ? 'collapse' : 'expand'}` : name}
                    >
                    {isGroup && (
                        <ExpandIcon expanded={isExpanded} />
                    )}
                    <span className={isGroup ? "ml-1" : ""}>{name || (isGroup ? 'Unnamed Group' : 'Unnamed Status')}</span>
                </td>
                {/* Metric Columns */}
                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700">{avgHours}</td>
                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700">{avgDays}</td>
                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">{totalHours}</td>
            </tr>
        );
    };

    return (
        <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-lg border shadow">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 w-1/3"> {/* Added width hint */}
                                    Status Group / Status
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                    Avg. Time (Hours)
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                    Avg. Time (Days)
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                    Total Time (Hours)
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {byGroup.map((group) => {
                                const isExpanded = expandedGroups.has(group.groupName);
                                const groupStatusIds = groupToStatusIdsMap.get(group.groupName) || new Set();
                                const childStatuses = byStatus.filter(s => groupStatusIds.has(String(s.id)));

                                return (
                                    <React.Fragment key={`fragment-${group.groupName}`}>
                                        {renderRow(group, true, isExpanded, false)}
                                        {isExpanded && childStatuses.map(status => (
                                            renderRow(status, false, false, true) // Render child status rows with indent
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                             {/* Optionally render statuses that didn't belong to any group */}
                             {/* {byStatus.filter(s => !statusToGroupMap.has(String(s.id))).map(status => (
                                renderRow(status, false, false, false) // Render ungrouped statuses without indent
                             ))} */}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default TimeInStatusTable;
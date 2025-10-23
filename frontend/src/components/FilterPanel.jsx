/*
 * JiraMetricsDashboard - FilterPanel.jsx
 *
 * Provides standard filters, status grouping UI, and flow/support metric configuration
 * allowing selection by Status Group OR individual Status.
 */

import React, { useState, useEffect, useMemo } from 'react'; // Import useEffect here

// --- Helper Component for Flow Config Section ---
const FlowConfigSelector = ({
    label,
    config, // { type: 'group' | 'status', value: string }
    onConfigChange,
    availableGroups, // [{ name: string }]
    availableStatuses, // [{ id: string, name: string }]
    isLoading,
    groupLabel = "Select Group",
    statusLabel = "Select Status"
}) => {
    const handleTypeChange = (e) => {
        onConfigChange({ type: e.target.value, value: '' }); // Reset value when type changes
    };

    const handleValueChange = (e) => {
        onConfigChange({ ...config, value: e.target.value });
    };

    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <fieldset className="mt-1">
                <legend className="sr-only">Selection Type</legend>
                <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                        <input
                            id={`${label}-type-group`}
                            name={`${label}-type`}
                            type="radio"
                            value="group"
                            checked={config.type === 'group'}
                            onChange={handleTypeChange}
                            disabled={isLoading}
                            className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`${label}-type-group`} className="ml-2 block text-sm text-gray-900">
                            By Group
                        </label>
                    </div>
                    <div className="flex items-center">
                        <input
                            id={`${label}-type-status`}
                            name={`${label}-type`}
                            type="radio"
                            value="status"
                            checked={config.type === 'status'}
                            onChange={handleTypeChange}
                            disabled={isLoading || !availableStatuses || availableStatuses.length === 0}
                            className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`${label}-type-status`} className="ml-2 block text-sm text-gray-900">
                            By Status
                        </label>
                    </div>
                </div>
            </fieldset>
            <select
                id={`${label}-value`}
                className="input-std mt-2 block w-full" // Use input-std class
                value={config.value}
                onChange={handleValueChange}
                disabled={isLoading || (config.type === 'group' && availableGroups.length === 0) || (config.type === 'status' && (!availableStatuses || availableStatuses.length === 0))}
            >
                {config.type === 'group' ? (
                    <>
                        <option value="">-- {groupLabel} --</option>
                        {availableGroups.map((g) => (
                            <option key={`group-${g.name}`} value={g.name}>
                                {g.name}
                            </option>
                        ))}
                    </>
                ) : (
                    <>
                        <option value="">-- {statusLabel} --</option>
                        {(availableStatuses || []).map((s) => (
                             s && s.id != null ? ( // Added check for valid status object
                                <option key={`status-${s.id}`} value={s.id}>
                                    {s.name || `Status ${s.id}`}
                                </option>
                            ) : null
                        ))}
                    </>
                )}
            </select>
        </div>
    );
};
// --- End Helper Component ---


function FilterPanel({
  metadata, // Now includes allStatuses: [{id, name}]
  statusGroups, // [{ name, statuses: [id] }]
  onStatusGroupsChange,
  onFilterSubmit,
  isLoading,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  standardFilters,
  onStandardFiltersChange,
  triageConfig,
  onTriageConfigChange,
  cycleStartConfig,
  onCycleStartConfigChange,
  cycleEndConfig,
  onCycleEndConfigChange,
}) {
  const [groupNameMap, setGroupNameMap] = useState({});

  // --- MOVED: CSS Styles Definition (as constants) ---
  const inputStdClass = "block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm";
  const baseButtonClass = "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const buttonPrimaryClass = `${baseButtonClass} border-transparent bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
  const buttonSuccessClass = `${baseButtonClass} border-transparent bg-green-600 text-white hover:bg-green-700 focus:ring-green-500`;
  // --- END MOVED ---

  // Effect to manage local status-to-groupName mapping for the grouping UI
  useEffect(() => {
     if (metadata?.statuses && Array.isArray(metadata.statuses)) {
      const newMap = {};
      metadata.statuses.forEach((s) => {
        if (s && s.id != null) {
          newMap[String(s.id)] = s.name || ''; // Default to original name
        }
      });
      if (Array.isArray(statusGroups)) {
        statusGroups.forEach((group) => {
          if (group && group.name != null && Array.isArray(group.statuses)) {
            group.statuses.forEach((statusId) => {
              if (statusId != null && newMap.hasOwnProperty(String(statusId))) {
                newMap[String(statusId)] = group.name;
              }
            });
          }
        });
      }
      setGroupNameMap(newMap);
    } else {
      setGroupNameMap({});
    }
  }, [metadata, statusGroups]);


  // Handle standard filter changes (Issue Types, Priorities)
  const handleFilterChange = (filterName, selectedOptions) => {
    const values = Array.from(selectedOptions)
      .filter((option) => option.selected)
      .map((option) => option.value);
    onStandardFiltersChange((prev) => ({ ...prev, [filterName]: values }));
  };

  // Handle "Load Ticket Data" button click
  const handleSubmitFilters = (e) => {
    e.preventDefault();
    onFilterSubmit();
  };

  // Handle typing in a "Group Name" input field
  const handleGroupNameChange = (statusId, newName) => {
    setGroupNameMap((prev) => ({
      ...prev,
      [String(statusId)]: newName,
    }));
  };

  // Handle "Save Groups" button click
  const handleSaveGroups = () => {
     const groups = {};
    Object.entries(groupNameMap).forEach(([statusId, groupName]) => {
      const trimmedGroupName = String(groupName || '').trim();
       if (!trimmedGroupName) {
           return; // Skip empty group names
       }
      if (!groups[trimmedGroupName]) {
        groups[trimmedGroupName] = [];
      }
       // Ensure status ID is valid according to metadata before adding
       if (metadata?.statusesMap?.has(statusId)) {
        groups[trimmedGroupName].push(statusId);
       }
    });

    const newStatusGroups = Object.entries(groups).map(([name, statuses], i) => ({
      id: `group-${i}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`,
      name,
      statuses,
    }));
    onStatusGroupsChange(newStatusGroups);
  };


  // --- Memoize options for dropdowns ---
  const availableGroupsForSelect = useMemo(() => {
    if (!Array.isArray(statusGroups)) return [];
    return statusGroups.map(g => ({ name: g.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [statusGroups]);

  const availableStatusesForSelect = useMemo(() => {
      if (!metadata?.statuses || !Array.isArray(metadata.statuses)) return [];
      return [...metadata.statuses].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [metadata]);
  // --- End Memoize ---


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
            <label htmlFor="filter-startDate" className="mb-1 block text-sm font-medium text-gray-700"> Start Date </label>
            <input type="date" id="filter-startDate" className={inputStdClass} value={startDate} onChange={(e) => onStartDateChange(e.target.value)} disabled={isLoading || !metadata} />
          </div>
          <div>
            <label htmlFor="filter-endDate" className="mb-1 block text-sm font-medium text-gray-700"> End Date </label>
            <input type="date" id="filter-endDate" className={inputStdClass} value={endDate} onChange={(e) => onEndDateChange(e.target.value)} disabled={isLoading || !metadata} />
          </div>
          {/* Issue Types Filter */}
          <div>
            <label htmlFor="filter-issueTypes" className="mb-1 block text-sm font-medium text-gray-700"> Issue Types </label>
            <select id="filter-issueTypes" multiple className={`${inputStdClass} h-24`} value={standardFilters.issueTypes} onChange={(e) => handleFilterChange('issueTypes', e.target.options)} disabled={!metadata?.issueTypes || isLoading}>
              {(metadata?.issueTypes || []).map((it) => it && it.id != null ? (<option key={it.id} value={it.id}>{it.name || `Type ${it.id}`}</option>) : null )}
            </select>
          </div>
          {/* Priorities Filter */}
          <div>
            <label htmlFor="filter-priorities" className="mb-1 block text-sm font-medium text-gray-700"> Priorities </label>
            <select id="filter-priorities" multiple className={`${inputStdClass} h-24`} value={standardFilters.priorities} onChange={(e) => handleFilterChange('priorities', e.target.options)} disabled={!metadata?.priorities || isLoading}>
              {(metadata?.priorities || []).map((p) => p && p.id != null ? (<option key={p.id} value={p.id}>{p.name || `Priority ${p.id}`}</option>) : null)}
            </select>
          </div>

          {/* Submit Button */}
          <button type="submit" disabled={isLoading || !metadata} className={`${buttonPrimaryClass} w-full`}>
            {isLoading ? 'Loading...' : 'Load Ticket Data'}
          </button>
        </div>
      </form>

      {/* --- Status Grouping --- */}
      <div className="rounded-lg bg-white p-4 shadow-lg">
        <h3 className="mb-4 border-b pb-2 text-lg font-semibold text-gray-800">
          Status Groups
        </h3>
        <p className="mb-3 text-sm text-gray-600">
          Assign raw statuses to a custom group name. Leave blank to use original name.
        </p>
        {availableStatusesForSelect && availableStatusesForSelect.length > 0 ? (
          <div className="max-h-60 space-y-2 overflow-y-auto pr-2">
            {availableStatusesForSelect.map((status) =>
              status && status.id != null ? (
                <div key={status.id} className="grid grid-cols-2 items-center gap-2">
                  <span className="truncate text-sm text-gray-700" title={status.name}>
                    {status.name || 'Unnamed Status'}
                  </span>
                  <input
                    type="text"
                    value={groupNameMap[String(status.id)] || ''}
                    onChange={(e) => handleGroupNameChange(status.id, e.target.value)}
                    className={inputStdClass}
                    disabled={isLoading}
                    placeholder="Enter Group Name..."
                  />
                </div>
              ) : null
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading statuses...' : 'No statuses loaded.'}
          </p>
        )}
        <button onClick={handleSaveGroups} disabled={isLoading || !metadata?.statuses} className={`${buttonSuccessClass} mt-4 w-full`}>
          Save Groups & Re-Process
        </button>
      </div>


      {/* --- Flow & Support Metrics Configuration --- */}
      <div className="rounded-lg bg-white p-4 shadow-lg">
        <h3 className="mb-4 border-b pb-2 text-lg font-semibold text-gray-800">
          Flow & Support Metrics Config
        </h3>
        <p className="mb-3 text-sm text-gray-600">
          Define the points for calculating MTTA, MTTR, and Cycle Time.
        </p>
        <div className="space-y-4">
          <FlowConfigSelector
            label="Triage/New Point (for MTTA Start)"
            config={triageConfig}
            onConfigChange={onTriageConfigChange}
            availableGroups={availableGroupsForSelect}
            availableStatuses={availableStatusesForSelect}
            isLoading={isLoading || !metadata}
            groupLabel="Select Triage Group"
            statusLabel="Select Triage Status"
          />
          <FlowConfigSelector
            label="Work Start Point (for Cycle Time Start)"
            config={cycleStartConfig}
            onConfigChange={onCycleStartConfigChange}
            availableGroups={availableGroupsForSelect}
            availableStatuses={availableStatusesForSelect}
            isLoading={isLoading || !metadata}
            groupLabel="Select Work Start Group"
            statusLabel="Select Work Start Status"
          />
           <FlowConfigSelector
            label="Resolution Point (for MTTR & Cycle Time End)"
            config={cycleEndConfig}
            onConfigChange={onCycleEndConfigChange}
            availableGroups={availableGroupsForSelect}
            availableStatuses={availableStatusesForSelect}
            isLoading={isLoading || !metadata}
            groupLabel="Select Resolution Group"
            statusLabel="Select Resolution Status"
          />
        </div>
      </div>
    </aside>
  );
}

// --- REMOVED: Simple Input/Select/Button styling components ---
// Using className strings directly with Tailwind instead.

// --- REMOVED: useEffect for injecting styles ---
// Assuming Tailwind is properly configured via build process or CDN.

export default FilterPanel;
// frontend/src/hooks/useStatusGroups.js
import { useState, useCallback } from 'react';

export function useStatusGroups(initialGroups = [], addLog, resetInvalidFlowConfigs) {
  const [statusGroups, setStatusGroups] = useState(initialGroups);

  // Set default groups based on metadata, ONLY if current groups are empty
  const setDefaultStatusGroups = useCallback((metadata) => {
    if (statusGroups.length === 0 && metadata?.statuses) {
      addLog('info', '[Groups] Setting default status groups based on metadata.');
      const defaultGroups = metadata.statuses
        .filter(s => s?.id != null && s?.name != null)
        .map(s => ({ id: s.id, name: s.name, statuses: [String(s.id)] }));
      setStatusGroups(defaultGroups);
    }
  }, [statusGroups.length, addLog]); // Rerun if statusGroups becomes empty

  // Handle changes from FilterPanel
  const handleStatusGroupsChange = useCallback((newGroups) => {
     if (!Array.isArray(newGroups)) return;
     addLog('info', '[Groups] Status groups updated by user.');
     setStatusGroups(newGroups);
     // Trigger flow config reset in useFilters hook
     const groupNames = new Set(newGroups.map((g) => g.name));
     if (resetInvalidFlowConfigs) {
        resetInvalidFlowConfigs(groupNames);
     }
  }, [addLog, resetInvalidFlowConfigs]);

  return {
    statusGroups,
    setStatusGroups, // Allow direct setting (e.g., from loading view)
    setDefaultStatusGroups,
    handleStatusGroupsChange,
  };
}
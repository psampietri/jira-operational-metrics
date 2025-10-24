// frontend/src/hooks/useFilters.js
import { useState } from 'react';

const initialFlowConfig = { type: 'group', value: '' };

export function useFilters() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [standardFilters, setStandardFilters] = useState({ issueTypes: [], priorities: [] });
  const [triageConfig, setTriageConfig] = useState(initialFlowConfig);
  const [cycleStartConfig, setCycleStartConfig] = useState(initialFlowConfig);
  const [cycleEndConfig, setCycleEndConfig] = useState(initialFlowConfig);

  // Function to reset flow configs if their selected group is removed
  const resetInvalidFlowConfigs = (validGroupNamesSet) => {
      const resetIfNeeded = (config, setter) => {
          if (config.type === 'group' && config.value && !validGroupNamesSet.has(config.value)) {
              setter(initialFlowConfig);
          }
      }
      resetIfNeeded(triageConfig, setTriageConfig);
      resetIfNeeded(cycleStartConfig, setCycleStartConfig);
      resetIfNeeded(cycleEndConfig, setCycleEndConfig);
  }

  // Function to apply filters loaded from a view
  const applyLoadedFilters = (loadedViewData) => {
      setStartDate(loadedViewData.startDate || '');
      setEndDate(loadedViewData.endDate || '');
      setStandardFilters({
          issueTypes: loadedViewData.standardFilters?.issueTypes || [],
          priorities: loadedViewData.standardFilters?.priorities || [],
      });
      setTriageConfig(loadedViewData.triageConfig || initialFlowConfig);
      setCycleStartConfig(loadedViewData.cycleStartConfig || initialFlowConfig);
      setCycleEndConfig(loadedViewData.cycleEndConfig || initialFlowConfig);
  }

  return {
    startDate, setStartDate,
    endDate, setEndDate,
    standardFilters, setStandardFilters,
    triageConfig, setTriageConfig,
    cycleStartConfig, setCycleStartConfig,
    cycleEndConfig, setCycleEndConfig,
    resetInvalidFlowConfigs,
    applyLoadedFilters,
    initialFlowConfig // Export for use elsewhere if needed
  };
}
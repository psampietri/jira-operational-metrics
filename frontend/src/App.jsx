/*
 * JiraMetricsDashboard - App.jsx
 *
 * Main application component orchestrating hooks and rendering the layout.
 * Includes Export Modal functionality.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// --- Hooks ---
import { useFilters } from './hooks/useFilters.js';
import { useJiraData } from './hooks/useJiraData.js';
import { useSavedViews } from './hooks/useSavedViews.js';
import { useStatusGroups } from './hooks/useStatusGroups.js';
import { useAppEffects } from './hooks/useAppEffects.js';

// --- Context and Components ---
import { LogProvider, useLogs } from './context/LogContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import MetricsExplanationModal from './components/MetricsExplanationModal.jsx';
import ExportModal from './components/ExportModal.jsx'; // <-- Import Export Modal

// --- App Content Component (uses hooks) ---
function AppContent() {
  const { addLog } = useLogs();

  // --- Modal States ---
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const toggleLogModal = useCallback(() => setIsLogModalOpen(prev => !prev), []);
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);
  const toggleExplanationModal = useCallback(() => setIsExplanationModalOpen(prev => !prev), []);
  // --- State for Export Modal ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState(null); // State to hold the JSON data
  const toggleExportModal = useCallback(() => setIsExportModalOpen(prev => !prev), []);

  // --- State from Hooks ---
  const {
    startDate, setStartDate, endDate, setEndDate, standardFilters, setStandardFilters,
    triageConfig, setTriageConfig, cycleStartConfig, setCycleStartConfig, cycleEndConfig, setCycleEndConfig,
    resetInvalidFlowConfigs, applyLoadedFilters,
  } = useFilters();

  const {
      statusGroups, setStatusGroups, setDefaultStatusGroups, handleStatusGroupsChange,
  } = useStatusGroups([], addLog, resetInvalidFlowConfigs);

  const {
    projectKey, setProjectKey, metadata, setMetadata, issues,
    isLoading, setIsLoading, isMetadataLoading,
    error, setError, metadataError, setMetadataError,
    fetchMetadata, handleFilterSubmit, clearErrors: clearDataErrors
  } = useJiraData(addLog);

  const [processedData, setProcessedData] = useState(null); // Keep processedData state here
  const explicitFetchTriggered = useRef(false);
  const flowWarningLoggedRef = useRef(false);


  // --- Combined clear errors ---
   const clearAllErrors = useCallback(() => {
    clearDataErrors(); // Clears errors within useJiraData hook
    addLog('info', 'All errors cleared.');
  }, [clearDataErrors, addLog]);


  // --- Saved Views ---
  const handleLoadViewSuccess = useCallback((viewToLoad) => {
      addLog('info', `[App] Applying loaded view "${viewToLoad.name}"...`);
      applyLoadedFilters(viewToLoad); // Apply filters via useFilters hook
      setStatusGroups(viewToLoad.statusGroups || []); // Set status groups via useStatusGroups hook's setter
      explicitFetchTriggered.current = true; // Set flag to trigger fetch
      addLog('info', `[App] Setting project key from loaded view: ${viewToLoad.projectKey}`);
      setProjectKey(viewToLoad.projectKey); // Trigger project change via useJiraData hook's setter
      flowWarningLoggedRef.current = false; // Reset warning flag
  }, [applyLoadedFilters, setStatusGroups, setProjectKey, addLog]); // Include dependencies

  const currentConfigForSave = useMemo(() => ({
      projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig
   }), [projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig]);

  const {
    savedViews, isLoadingViews, saveCurrentView, loadView, deleteView,
  } = useSavedViews(addLog, currentConfigForSave, handleLoadViewSuccess);


  // --- Submit Click Handler ---
  const handleFilterSubmitClick = useCallback(() => {
      addLog('info', '[App] User clicked Load Ticket Data.');
      explicitFetchTriggered.current = true; // Set flag
      flowWarningLoggedRef.current = false; // Reset warning
      // The useAppEffects hook will now detect the ref change and trigger the fetch when ready
  }, [addLog]);

  // --- Export Data Handler ---
  const handleExportData = useCallback(() => {
      if (!processedData || !projectKey || !metadata) {
          addLog('warn', '[App] Cannot export: Load project and process data first.');
          alert('Please load project data before exporting.');
          return;
      }
      addLog('info', '[App] Generating data for export...');

      // --- *** FIX: Destructure metrics from processedData *** ---
      const {
          supportMetrics = {}, // Use default empty object if undefined
          summaryStats = {},   // Use default empty object if undefined
          cfdData = [],
          cycleTimeData = {},
          throughputData = [],
          distribution,
          timeInStatus
      } = processedData;
      // --- *** END FIX *** ---

      // Map IDs to names for readability in export
      const mapIdToName = (id, map, fallbackPrefix = 'Unknown') => {
          return map?.get(String(id)) || `${fallbackPrefix} (${id})`;
      }
      const mapPriorityIdToName = (id) => metadata?.priorities?.find(p => p.id === id)?.name || `Priority (${id})`;
      const mapIssueTypeIdToName = (id) => metadata?.issueTypes?.find(t => t.id === id)?.name || `Type (${id})`;
      const statusIdNameMap = metadata?.statusesMap; // Use the Map from useJiraData

      const dataToExport = {
          // Configuration Snapshot
          configuration: {
              projectKey,
              dateRange: { start: startDate, end: endDate },
              filters: {
                  // Map IDs using metadata if available
                  issueTypes: standardFilters.issueTypes.map(id => mapIssueTypeIdToName(id)),
                  priorities: standardFilters.priorities.map(id => mapPriorityIdToName(id)),
              },
              statusGroups: statusGroups.map(g => ({
                  name: g.name,
                  // Map status IDs within groups to names
                  statuses: g.statuses.map(id => mapIdToName(id, statusIdNameMap, 'Status'))
              })),
              flowPoints: {
                  // Include resolved value name for context if possible
                  triage: {
                      type: triageConfig.type,
                      value: triageConfig.type === 'status' ? mapIdToName(triageConfig.value, statusIdNameMap, 'Status') : triageConfig.value
                  },
                  workStart: {
                      type: cycleStartConfig.type,
                      value: cycleStartConfig.type === 'status' ? mapIdToName(cycleStartConfig.value, statusIdNameMap, 'Status') : cycleStartConfig.value
                  },
                  resolution: {
                       type: cycleEndConfig.type,
                       value: cycleEndConfig.type === 'status' ? mapIdToName(cycleEndConfig.value, statusIdNameMap, 'Status') : cycleEndConfig.value
                  },
              },
              generatedAt: new Date().toISOString(),
          },
          // Calculated Metrics (using destructured values)
          metrics: {
              overall: {
                  mttaHours: supportMetrics.avgMttaHours,
                  mttrHours: supportMetrics.avgMttrHours,
                  avgCycleTimeDays: summaryStats.avgCycleTime,
                  medianCycleTimeDays: summaryStats.p50CycleTime,
                  p85CycleTimeDays: summaryStats.p85CycleTime,
              },
              flow: {
                  cfdData, // Already in suitable format
                  cycleTimeHistogram: cycleTimeData.histogram, // Already in suitable format
                  throughput: throughputData, // Already in suitable format
              },
              currentState: {
                  distributionByGroup: distribution?.byGroup, // Use optional chaining
                  timeInStatusByGroup: timeInStatus?.byGroup, // Use optional chaining
              }
          }
      };
      setExportData(dataToExport); // Store the generated data
      setIsExportModalOpen(true); // Open the modal
  }, [
      // Add dependencies needed to build the export data
      processedData, // <<< ADDED processedData
      projectKey,
      metadata, // Need metadata for mapping IDs
      startDate,
      endDate,
      standardFilters,
      statusGroups,
      triageConfig,
      cycleStartConfig,
      cycleEndConfig,
      addLog,
      // Note: Don't need individual metrics like supportMetrics here anymore
  ]);


  // --- Call the useAppEffects hook ---
  useAppEffects({
      projectKey, metadata, metadataError, isMetadataLoading, issues, isLoading,
      fetchMetadata, handleFilterSubmit, error, setError, setIsLoading, setMetadata, setMetadataError,
      startDate, endDate, standardFilters, cycleStartConfig, cycleEndConfig, triageConfig,
      statusGroups, setStatusGroups, setDefaultStatusGroups,
      processedData, setProcessedData,
      addLog, clearAllErrors, explicitFetchTriggered, flowWarningLoggedRef
  });


  // --- Derived State ---
  const displayError = error || metadataError;
  const statusMap = useMemo(() => new Map(metadata?.statuses?.map(s => [String(s.id), s.name || `Status ${s.id}`]) || []), [metadata]);
  const canExport = !!processedData && !!projectKey; // Determine if export is possible


  // --- Render the Layout ---
  return (
    <> {/* Use Fragment to render Modals alongside Layout */}
      <AppLayout
          projectKey={projectKey}
          metadata={metadata}
          processedData={processedData}
          statusMap={statusMap}
          statusGroups={statusGroups}
          isLoading={isLoading}
          isMetadataLoading={isMetadataLoading}
          displayError={displayError}
          startDate={startDate}
          endDate={endDate}
          standardFilters={standardFilters}
          cycleStartConfig={cycleStartConfig}
          cycleEndConfig={cycleEndConfig}
          triageConfig={triageConfig}
          savedViews={savedViews}
          isLoadingViews={isLoadingViews}
          isLogModalOpen={isLogModalOpen}
          // Handlers
          onProjectChange={setProjectKey}
          onStatusGroupsChange={handleStatusGroupsChange}
          onFilterSubmit={handleFilterSubmitClick}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onStandardFiltersChange={setStandardFilters}
          onCycleStartConfigChange={setCycleStartConfig}
          onCycleEndConfigChange={setCycleEndConfig}
          onTriageConfigChange={setTriageConfig}
          onSaveView={saveCurrentView}
          onLoadView={loadView}
          onDeleteView={deleteView}
          onToggleLogModal={toggleLogModal}
          onToggleExplanationModal={toggleExplanationModal}
          onClearErrors={clearAllErrors}
          onExportData={handleExportData} // Pass export handler
          canExport={canExport} // Pass export possibility flag
      />
      {/* Render Explanation Modal Conditionally */}
      <MetricsExplanationModal
          isOpen={isExplanationModalOpen}
          onClose={toggleExplanationModal}
      />
      {/* Render Export Modal Conditionally */}
      <ExportModal
          isOpen={isExportModalOpen}
          onClose={toggleExportModal}
          data={exportData} // Pass generated data to modal
      />
    </>
  );
}


// --- Main App Component (Provider Wrapper) ---
function App() {
  return (
    <LogProvider>
      <AppContent />
    </LogProvider>
  );
}

export default App;
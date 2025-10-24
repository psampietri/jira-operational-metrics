/*
 * JiraMetricsDashboard - App.jsx
 *
 * Manages global state including project key, filters, status groups,
 * cycle config, fetched data, and saved views fetched from the backend API.
 * Refined load view and fetch logic to prevent loops using useEffect.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
// --- CORRECTED IMPORT PATHS (Ensuring extensions are present) ---
import Header from './components/Header.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import MetricsDashboard from './components/MetricsDashboard.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { processMetrics } from './utils/dataProcessor.js';

const API_BASE_URL = 'http://localhost:3001/api'; // Use base for API calls

console.log('[App] API_BASE_URL:', API_BASE_URL);

// --- Default/Initial Config State ---
const initialFlowConfig = { type: 'group', value: '' }; // type: 'group' | 'status', value: name | id

// --- Main App Component ---
function App() {
  // --- State ---
  const [projectKey, setProjectKey] = useState('');
  const [metadata, setMetadata] = useState(null); // Includes { id, name } for statuses and statusesMap
  const [statusGroups, setStatusGroups] = useState([]); // [{ id, name, statuses: [id] }]
  const [issues, setIssues] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Combined loading state (metadata OR issues/processing)
  const [error, setError] = useState(null); // Combined error state
  const [isMetadataLoading, setIsMetadataLoading] = useState(false); // Specific state for metadata loading
  const [metadataError, setMetadataError] = useState(null);
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [standardFilters, setStandardFilters] = useState({ issueTypes: [], priorities: [] });

  // --- Flow/Support Config State ---
  const [triageConfig, setTriageConfig] = useState(initialFlowConfig);
  const [cycleStartConfig, setCycleStartConfig] = useState(initialFlowConfig);
  const [cycleEndConfig, setCycleEndConfig] = useState(initialFlowConfig);

  const [savedViews, setSavedViews] = useState([]); // Array like [{ _id: '...', name: '...' }]
  const [isLoadingViews, setIsLoadingViews] = useState(false); // Loading state for views list

  // --- Ref to track if an explicit fetch request is pending ---
  // Helps coordinate useEffects for fetching
  const explicitFetchTriggered = useRef(false);

  // --- Fetch saved views ---
  const fetchSavedViews = useCallback(async () => {
    console.log('[App] Fetching saved views from backend...');
    setIsLoadingViews(true);
    try {
      const response = await fetch(`${API_BASE_URL}/views`);
      if (!response.ok) throw new Error(`Fetch views failed: ${response.statusText}`);
      const views = await response.json();
      setSavedViews(views || []);
      console.log('[App] Fetched saved views:', views.length);
    } catch (e) {
      console.error('[App] Failed to fetch saved views:', e);
      setSavedViews([]);
    } finally {
      setIsLoadingViews(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedViews();
  }, [fetchSavedViews]);

  // --- Handlers ---

  // Handle Project Key Change (from input field or load view)
  // Now simpler: just sets the key, triggering the metadata useEffect
  const handleProjectKeyChange = useCallback((key) => {
    if (!key) return;
    const upperKey = key.toUpperCase();
    // Only update if the key is actually different
    if (upperKey !== projectKey) {
        console.log(`[App] Setting project key to: ${upperKey}`);
        setProjectKey(upperKey);
        // Clear old data immediately when key changes
        setIssues([]);
        setProcessedData(null);
        setError(null);
        setMetadataError(null);
        setMetadata(null); // Ensure metadata reloads
        // Keep filters as they are, let loadView or user decide to change them
    } else {
        console.log(`[App] Project key "${upperKey}" is already set.`);
    }
  }, [projectKey]); // Dependency on projectKey to compare

  // Handle Filter Submit Button Click
  const handleFilterSubmitClick = useCallback(() => {
      console.log('[App] User clicked Load Ticket Data.');
      // Set the flag to indicate user wants to fetch
      explicitFetchTriggered.current = true;
      // Trigger the issue fetching useEffect by potentially changing a dependency
      // Or rely on the fact that conditions (projectKey, metadata) should already be met
      // Let's call the issue fetch function directly but ensure validation passes
       if (projectKey && metadata && !metadataError && !isMetadataLoading) {
           handleFilterSubmit(); // Call the fetch logic
       } else {
           setError("Cannot load tickets yet. Ensure project is loaded and metadata is available.");
           console.warn("[App] Load Ticket Data clicked, but conditions not met.");
       }

  }, [projectKey, metadata, metadataError, isMetadataLoading]); // Dependencies needed for validation

   // --- Issue Fetch Logic (now separated) ---
   const handleFilterSubmit = useCallback(async () => {
       // Re-check conditions here, although the trigger points should pre-validate
       if (!projectKey || !metadata || metadataError || isMetadataLoading ) {
           console.warn(`[App] handleFilterSubmit aborted. Conditions: PK=${!!projectKey}, Meta=${!!metadata}, MetaErr=${!!metadataError}, MetaLoad=${isMetadataLoading}`);
           // If called incorrectly, ensure loading stops
           if(isLoading) setIsLoading(false);
           return;
       }

       console.log(`[App] handleFilterSubmit starting fetch for project: ${projectKey}`);
       setIsLoading(true); // Indicate data fetching/processing is starting
       setError(null);
       setProcessedData(null);
       setIssues([]); // Clear issues before fetch

       const jqlParts = [];
       if (standardFilters.issueTypes?.length > 0) jqlParts.push(`issueType in (${standardFilters.issueTypes.map(id => `"${id}"`).join(',')})`);
       if (standardFilters.priorities?.length > 0) jqlParts.push(`priority in (${standardFilters.priorities.map(id => `"${id}"`).join(',')})`);
       if (startDate && !isNaN(new Date(startDate))) jqlParts.push(`created >= "${startDate}"`);
       if (endDate && !isNaN(new Date(endDate))) jqlParts.push(`created <= "${endDate} 23:59"`);
       const filterClause = jqlParts.join(' AND ');

       const requestUrl = `${API_BASE_URL}/jira/tickets`;
       const requestPayload = { projectKey, jqlFilter: filterClause }; // Use current projectKey state

       try {
           const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) });
           if (!response.ok) { /* ... error handling ... */ throw new Error(`Request failed: ${response.status}`); }
           const data = await response.json();
           if (data?.issues && Array.isArray(data.issues)) {
               console.log(`[App] Fetched ${data.issues.length} issues successfully.`);
               setIssues(data.issues); // Trigger processing useEffect
               // Let processing useEffect handle final isLoading = false
           } else { throw new Error('Invalid issue data structure.'); }
       } catch (err) {
           console.error('[App] Fetch tickets failed:', err);
           setError(`Failed to load ticket data: ${err.message}.`);
           setIssues([]); setProcessedData(null); setIsLoading(false); // Stop loading on error
       }
   // Dependencies: All state used in constructing the fetch and validation
   }, [projectKey, metadata, metadataError, isMetadataLoading, isLoading, startDate, endDate, standardFilters]);


  // Handle Status Group Changes
  const handleStatusGroupsChange = useCallback((newGroups) => {
    // ... (logic remains the same) ...
     if (!Array.isArray(newGroups)) { /* ... error handling ... */ return; }
    console.log('[App] Status groups updated by user.');
    setStatusGroups(newGroups);
    const groupNames = new Set(newGroups.map((g) => g.name));
    if (triageConfig.type === 'group' && triageConfig.value && !groupNames.has(triageConfig.value)) setTriageConfig(initialFlowConfig);
    if (cycleStartConfig.type === 'group' && cycleStartConfig.value && !groupNames.has(cycleStartConfig.value)) setCycleStartConfig(initialFlowConfig);
    if (cycleEndConfig.type === 'group' && cycleEndConfig.value && !groupNames.has(cycleEndConfig.value)) setCycleEndConfig(initialFlowConfig);
  }, [triageConfig, cycleStartConfig, cycleEndConfig]);


  // --- useEffect for Metadata Loading ---
  useEffect(() => {
      // Fetch metadata whenever projectKey changes AND we don't have valid metadata for it.
      // Also fetch if metadataError exists (retry mechanism)
      if (projectKey && (!metadata || metadataError || projectKey !== (metadata?.projectKeyFromLoad))) { // Add check if metadata belongs to current key? maybe too complex
          console.log(`[useEffect metadata] Project key is "${projectKey}". Fetching metadata.`);
          const fetchMeta = async () => {
              setIsMetadataLoading(true);
              setMetadataError(null);
              setMetadata(null); // Clear old metadata
              setIssues([]); // Clear data tied to old metadata/project
              setProcessedData(null);
              setError(null);
              setIsLoading(true); // Show combined loading indicator

              try {
                  const response = await fetch(`${API_BASE_URL}/jira/metadata?projectKey=${projectKey}`);
                  if (!response.ok) { /* ... error handling ... */ throw new Error(`Metadata request failed: ${response.status}`); }
                  const meta = await response.json();
                  if (meta && Array.isArray(meta.statuses) /* ... validation ... */) {
                      setMetadata({
                          ...meta,
                          projectKeyFromLoad: projectKey, // Tag metadata with the key it belongs to
                          statusesMap: new Map(meta.statuses.map(s => [String(s.id), s.name || `Status ${s.id}`]))
                      });
                      console.log(`[useEffect metadata] Metadata fetched successfully for ${projectKey}.`);
                      // Set default groups *only if* statusGroups are currently empty
                      // This prevents overwriting groups loaded from a saved view
                      if (statusGroups.length === 0) {
                           const defaultGroups = meta.statuses
                             .filter(s => s?.id != null && s?.name != null)
                             .map(s => ({ id: s.id, name: s.name, statuses: [String(s.id)] }));
                           setStatusGroups(defaultGroups);
                           console.log('[useEffect metadata] Setting default status groups.');
                      }
                  } else { /* ... error handling ... */ throw new Error('Invalid metadata structure.'); }
              } catch (err) {
                  console.error('[useEffect metadata] Failed:', err);
                  setMetadataError(`Metadata load failed: ${err.message}.`);
                  setMetadata(null);
                  setStatusGroups([]); // Clear groups if metadata fails
                  setIsLoading(false); // Stop loading if metadata fails
              } finally {
                  setIsMetadataLoading(false); // Stop *metadata specific* loading
                  // DO NOT stop the main isLoading here, let the issue fetch/process handle it
              }
          };
          fetchMeta();
      } else if (!projectKey) {
          // Clear metadata if project key is removed
          setMetadata(null);
          setMetadataError(null);
      }
  }, [projectKey, statusGroups.length]); // Re-run if projectKey changes or statusGroups becomes empty


 // --- useEffect for Triggering Issue Fetch ---
 useEffect(() => {
     // Conditions to fetch issues:
     // 1. An explicit fetch was triggered (button click or view load)
     // 2. Project key is set
     // 3. Metadata is loaded and valid for the current project key
     // 4. Not currently loading metadata (isMetadataLoading)
     const metadataIsValid = metadata && !metadataError && !isMetadataLoading && metadata.projectKeyFromLoad === projectKey;
     
     // REMOVED !isLoading from this condition
     const shouldFetch = explicitFetchTriggered.current && projectKey && metadataIsValid; 

     if (shouldFetch) {
         console.log("[useEffect FetchIssues] Conditions met, explicit trigger detected. Calling handleFilterSubmit.");
         explicitFetchTriggered.current = false; // Reset the trigger flag
         handleFilterSubmit(); // Call the actual fetch logic
     } else if (explicitFetchTriggered.current) {
         console.log("[useEffect FetchIssues] Explicit trigger detected, but conditions not met.", { projectKey, metadataIsValid, isMetadataLoading });
         // If conditions aren't met, reset the trigger so we don't fetch later unexpectedly
         // Set an appropriate error if needed
         if (!projectKey) setError("Cannot fetch issues: Project key is missing.");
         else if (!metadataIsValid) setError("Cannot fetch issues: Metadata is missing or failed to load.");
     }
 // REMOVED isLoading from the dependency array
 }, [projectKey, metadata, metadataError, isMetadataLoading, handleFilterSubmit, explicitFetchTriggered.current]);


  // Effect to process metrics
  useEffect(() => {
     // ... (processing logic remains the same, ensure dependencies are minimal) ...
      const canProcess = issues.length > 0 && Array.isArray(statusGroups) && triageConfig.value && cycleStartConfig.value && cycleEndConfig.value && startDate && endDate && metadata?.statuses;
      console.log( '[App useEffect ProcessMetrics] Check.', `Issues: ${issues.length}`, `CanProcess: ${canProcess}` );
      if (canProcess) {
          // No need to set isLoading=true here, fetch should have set it.
          // If fetch finished instantly and this runs before isLoading is true, might need adjustment, but unlikely.
          setError(null);
          const timerId = setTimeout(() => {
              try {
                  console.time('[App useEffect ProcessMetrics] Duration');
                  const metrics = processMetrics( issues, statusGroups, startDate, endDate, cycleStartConfig, cycleEndConfig, triageConfig, metadata.statuses );
                  console.timeEnd('[App useEffect ProcessMetrics] Duration'); setProcessedData(metrics);
                  if (!metrics) console.warn('[App useEffect ProcessMetrics] processMetrics returned null.');
                  else console.log('[App useEffect ProcessMetrics] Success.');
              } catch (err) { console.error('[App useEffect ProcessMetrics] Error:', err); setError(`Processing failed: ${err.message}.`); setProcessedData(null);
               } finally {
                   setIsLoading(false); // Stop loading *after* processing is done
                   console.log('[App useEffect ProcessMetrics] Finished.'); }
          }, 10);
          return () => clearTimeout(timerId);
       } else {
           setProcessedData(null); // Clear data if cannot process
           // Set info/error message if applicable (only if not already loading)
           if (!isLoading && !isMetadataLoading) {
               if (issues.length > 0 && (!triageConfig.value || !cycleStartConfig.value || !cycleEndConfig.value)) setError("Data loaded. Select flow points.");
               else if (issues.length === 0 && projectKey && metadata && !metadataError) setError("No issues found for filters.");
           }
           // If processing can't run, ensure loading stops if it was started by fetch
           if (isLoading && issues.length === 0 && !error) { setIsLoading(false); }
       }
  // Minimal dependencies for processing calculation itself
  }, [issues, statusGroups, startDate, endDate, cycleStartConfig, cycleEndConfig, triageConfig, metadata?.statuses]); // Removed loading flags, errors, projectKey


  // --- Save/Load/Delete Functions using API ---

  const saveCurrentView = useCallback(async (name) => {
    // ... (logic remains the same) ...
     if (!name || !projectKey) { alert('Provide name & load project.'); return; }
     console.log(`[App] Saving view: ${name}`);
     const viewConfig = { name, projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig };
     try {
         const response = await fetch(`${API_BASE_URL}/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(viewConfig) });
         if (!response.ok) { const errorData = await response.json().catch(() => ({})); if(response.status === 409) throw new Error(errorData.error || `View name "${name}" exists.`); throw new Error(errorData.error || `Save failed: ${response.statusText}`); }
         await response.json(); console.log(`[App] View "${name}" saved/updated. Refreshing.`); await fetchSavedViews(); alert(`View "${name}" saved!`);
     } catch (e) { console.error('[App] Save view failed:', e); alert(`Error saving: ${e.message}`); }
  }, [ projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig, fetchSavedViews ]);

  // --- UPDATED: loadViewByName - Simplified flow ---
  const loadViewByName = useCallback(async (viewId) => {
    if (!viewId) return;
    console.log(`[App] Loading view ID via API: ${viewId}`);
    setIsLoading(true); // Indicate loading process starting
    setError(null);
    setMetadataError(null);
    setIssues([]); // Clear old data immediately
    setProcessedData(null);
    explicitFetchTriggered.current = false; // Ensure fetch trigger is reset initially

    try {
      const response = await fetch(`${API_BASE_URL}/views/${viewId}`);
       if (!response.ok) { throw new Error(`Load failed: ${response.statusText}`); }
      const viewToLoad = await response.json();
      const loadedProjectKey = viewToLoad.projectKey;
      console.log('[App] Loaded view config:', viewToLoad);

      // --- Set filter state ONLY ---
      setStartDate(viewToLoad.startDate);
      setEndDate(viewToLoad.endDate);
      setStandardFilters({
          issueTypes: viewToLoad.standardFilters?.issueTypes || [],
          priorities: viewToLoad.standardFilters?.priorities || [],
      });
      setStatusGroups(viewToLoad.statusGroups || []);
      setTriageConfig(viewToLoad.triageConfig || initialFlowConfig);
      setCycleStartConfig(viewToLoad.cycleStartConfig || initialFlowConfig);
      setCycleEndConfig(viewToLoad.cycleEndConfig || initialFlowConfig);

      // --- Set the explicit fetch flag ---
      // We always want to fetch issues after loading a view
      explicitFetchTriggered.current = true;
      console.log("[App] LoadView: Set explicitFetchTriggered to true.");


      // --- Trigger project key change (which triggers metadata load if needed) ---
      // This will set the projectKey state. The useEffect chain will handle
      // metadata loading and then trigger the issue fetch via handleFilterSubmit.
      handleProjectKeyChange(loadedProjectKey); // Pass only the key

      // isLoading will be set to false eventually by the processing useEffect or fetch error

    } catch (e) {
      console.error('[App] Failed to load view:', e);
      alert(`Error loading view: ${e.message}`);
      setIsLoading(false); // Stop loading on error
      setError(`Error loading view: ${e.message}`);
      explicitFetchTriggered.current = false; // Reset trigger on error
     }
  }, [handleProjectKeyChange]); // Dependency


  const deleteViewByName = useCallback(async (viewId, viewName) => {
    // ... (logic remains the same) ...
     if (!viewId || !viewName) return; console.log(`[App] Deleting view ID: ${viewId}`);
     try {
         const response = await fetch(`${API_BASE_URL}/views/${viewId}`, { method: 'DELETE' });
         if (!response.ok) { /* ... error handling ... */ throw new Error(`Delete failed: ${response.statusText}`); }
         console.log(`[App] View "${viewName}" deleted. Refreshing.`); alert(`View "${viewName}" deleted.`); await fetchSavedViews();
     } catch (e) { console.error('[App] Delete view failed:', e); alert(`Error deleting: ${e.message}`); }
  }, [fetchSavedViews]);

  // --- Render Logic ---
  // Use specific loading flags for clarity in UI, but combine for overall indicator
  const showProcessingOrFetchingIndicator = isLoading; // Main indicator for data loading/processing
  const displayError = error || metadataError;

  const statusMap = React.useMemo(() => {
      return new Map(metadata?.statuses?.map(s => [String(s.id), s.name || `Status ${s.id}`]) || []);
  }, [metadata]);


  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <Header
          projectKey={projectKey}
          onProjectChange={handleProjectKeyChange} // Use direct change handler
          savedViews={savedViews}
          isLoadingViews={isLoadingViews} // Pass specific view list loading
          onSaveView={saveCurrentView}
          onLoadView={loadViewByName}
          onDeleteView={deleteViewByName}
       />

      {/* --- Consolidated Error Display --- */}
      {displayError && !showProcessingOrFetchingIndicator && !isMetadataLoading && ( // Show error only if nothing is loading
        <div className="container mx-auto mt-4 max-w-7xl">
          <div className={`rounded-md border p-4 shadow ${metadataError ? 'border-red-300 bg-red-50 text-red-700' : 'border-yellow-300 bg-yellow-50 text-yellow-700'}`} role="alert">
            <strong className="font-bold">{metadataError ? 'Error: ' : 'Info: '}</strong>
            <span className="block sm:inline">{displayError}</span>
          </div>
        </div>
      )}

      <ErrorBoundary>
         { projectKey ? (
            <main className="container mx-auto grid max-w-7xl grid-cols-1 gap-6 p-4 pt-6 md:grid-cols-4">
              <div className="col-span-1 md:col-span-1">
                <FilterPanel
                  metadata={metadata} // Pass full metadata
                  statusGroups={statusGroups}
                  onStatusGroupsChange={handleStatusGroupsChange}
                  onFilterSubmit={handleFilterSubmitClick} // Use the button click handler
                  isLoading={showProcessingOrFetchingIndicator || isMetadataLoading} // Combined loading state for disabling
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  standardFilters={standardFilters}
                  onStandardFiltersChange={setStandardFilters}
                  cycleStartConfig={cycleStartConfig}
                  onCycleStartConfigChange={setCycleStartConfig}
                  cycleEndConfig={cycleEndConfig}
                  onCycleEndConfigChange={setCycleEndConfig}
                  triageConfig={triageConfig}
                  onTriageConfigChange={setTriageConfig}
                />
              </div>
              <div className="col-span-1 md:col-span-3">
                <MetricsDashboard
                  processedData={processedData}
                  // Show loading if metadata OR issues/processing are loading
                  isLoading={showProcessingOrFetchingIndicator || isMetadataLoading}
                  // Pass error only if not actively loading
                  error={!(showProcessingOrFetchingIndicator || isMetadataLoading) ? displayError : null}
                  groupOrder={statusGroups.map((g) => g.name)}
                  statusMap={statusMap}
                  statusGroups={statusGroups}
                />
              </div>
            </main>
          ) : ( // Initial state or after project load failed
            <div className="container mx-auto mt-6 max-w-7xl p-4 text-center text-gray-500">
             { metadataError ? `Failed to load project: ${metadataError}` : 'Please enter a project key above and click "Load" to begin.' }
            </div>
        )}
      </ErrorBoundary>
    </div>
  );
}

export default App;
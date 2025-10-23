/*
 * JiraMetricsDashboard - App.jsx
 *
 * This is the main React component. It manages the global state for:
 * - projectKey
 * - filter metadata (statuses, priorities, etc.)
 * - user-defined status groups
 * - fetched issues and processed metrics
 * - date range filters
 * - standard filters (issue types, priorities)
 *
 * It coordinates the Header, FilterPanel, and MetricsDashboard components.
 */

import React, { useState, useEffect, useCallback } from 'react';
// Import components from their files
import Header from './components/Header';
import FilterPanel from './components/FilterPanel';
import MetricsDashboard from './components/MetricsDashboard';
import ErrorBoundary from './components/ErrorBoundary'; // Assuming ErrorBoundary is moved too
import { processMetrics } from './utils/dataProcessor'; // Import processing logic

// The backend API URL
const API_BASE_URL = 'http://localhost:3001/api/jira';
console.log('[App] API_BASE_URL:', API_BASE_URL); // Log the base URL on load

// --- Main App Component ---
function App() {
  // --- State ---
  const [projectKey, setProjectKey] = useState('');
  const [metadata, setMetadata] = useState(null); // { statuses: [], issueTypes: [], ... }
  const [statusGroups, setStatusGroups] = useState([]); // { id, name, statuses: [id1, id2] }
  const [issues, setIssues] = useState([]); // Ensure initialized as array
  const [processedData, setProcessedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Combined loading state for tickets & processing
  const [error, setError] = useState(null); // Combined error state
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  // State for date filters
  const [startDate, setStartDate] = useState(''); // Store as YYYY-MM-DD string
  const [endDate, setEndDate] = useState('');     // Store as YYYY-MM-DD string
  // State for standard filters (issue types, priorities)
  const [standardFilters, setStandardFilters] = useState({
      issueTypes: [],
      priorities: [],
  });

  // --- Handlers ---

  // Called from Header when a new project key is submitted
  const handleProjectKeyChange = useCallback(async (key) => {
    if (!key) return;
    console.log(`[App] handleProjectKeyChange called with key: ${key}`);
    setProjectKey(key);
    setIsMetadataLoading(true);
    setMetadataError(null);
    setMetadata(null); // Clear previous metadata
    setIssues([]); // Clear issues
    setProcessedData(null); // Clear processed data
    setStatusGroups([]); // Clear status groups
    setError(null); // Clear general errors
    setStartDate(''); // Reset dates
    setEndDate('');   // Reset dates
    setStandardFilters({ issueTypes: [], priorities: [] }); // Reset standard filters

    try {
      // Using fetch
      const response = await fetch(`${API_BASE_URL}/metadata?projectKey=${key}`);
      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || response.statusText || `Request failed with status ${response.status}`);
      }
      const meta = await response.json();

       console.log('[App] Metadata fetched successfully:', meta);
       if (meta && Array.isArray(meta.statuses) && Array.isArray(meta.issueTypes) && Array.isArray(meta.priorities)) {
          setMetadata(meta);
          // Create default status groups
          const defaultGroups = meta.statuses
           .filter(s => s && s.id != null && s.name != null)
           .map((s) => ({
             id: s.id,
             name: s.name,
             statuses: [String(s.id)],
           }));
           console.log('[App] Setting default status groups:', defaultGroups);
           setStatusGroups(defaultGroups);
       } else {
           console.error('[App] Metadata fetched but has unexpected structure:', meta);
           setMetadataError(`Received invalid metadata structure for project '${key}'.`);
           setMetadata(null);
           setStatusGroups([]);
       }

    } catch (err) {
      console.error('[App] Failed to fetch metadata:', err);
      const errorMessage = err.message || 'Unknown error';
      setMetadataError(
        `Failed to load project '${key}'. Error: ${errorMessage}. Check project key and backend connection.`,
      );
       setMetadata(null);
       setStatusGroups([]);
    } finally {
      setIsMetadataLoading(false);
       console.log('[App] Metadata loading finished.');
    }
  }, []);

  // Called from FilterPanel when the user saves new group definitions
  const handleStatusGroupsChange = (newGroups) => {
     if (Array.isArray(newGroups)) {
         setStatusGroups(newGroups);
         // Re-processing happens in useEffect if issues exist
         if (issues.length > 0) {
           console.log('[App] Re-processing metrics after group change...');
           setIsLoading(true); // Trigger processing via useEffect
           setError(null);
         }
     } else {
         console.error('[App] handleStatusGroupsChange received non-array:', newGroups);
         setError("Failed to update status groups due to invalid format.");
     }
  };


  // Called from FilterPanel when "Apply Filters" is clicked
  const handleFilterSubmit = useCallback(
    () => {
       // --- JQL Construction (Filters Only) ---
       const jqlParts = []; // Start fresh

       // *** No project key here ***

       if (standardFilters.issueTypes.length > 0) {
           jqlParts.push(`issueType in (${standardFilters.issueTypes.map(id => `"${id}"`).join(',')})`);
       }
       if (standardFilters.priorities.length > 0) {
           jqlParts.push(`priority in (${standardFilters.priorities.map(id => `"${id}"`).join(',')})`);
       }
       if (startDate) {
           jqlParts.push(`created >= "${startDate}"`);
       }
       if (endDate) {
           jqlParts.push(`created <= "${endDate} 23:59"`); // Inclusive end date
       }

       // *** No ORDER BY here ***
       const filterClause = jqlParts.join(' AND ');
       // --- END JQL Construction ---

       console.log(`[App] handleFilterSubmit called. Filter clause sent to backend: ${filterClause}`);

      if (!projectKey) { // Still need projectKey for the backend endpoint
          console.warn('[App] handleFilterSubmit aborted: No projectKey set.');
          setError("Please load a project first.");
          return;
      }
       if (!metadata) {
           console.warn('[App] handleFilterSubmit aborted: Metadata not loaded yet.');
           setError("Project metadata is still loading or failed to load.");
           return;
       }

      setIsLoading(true);
      setError(null);
      setProcessedData(null);
      setIssues([]); // Clear previous issues

      const requestUrl = `${API_BASE_URL}/tickets`;
      // Backend expects 'jqlFilter' to contain ONLY the filter parts
      const requestPayload = { projectKey, jqlFilter: filterClause };

      console.log('[App] Attempting fetch POST to:', requestUrl, 'with payload:', requestPayload);

      fetch(requestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
      })
      .then(response => {
          console.log('[App] fetch SUCCEEDED. Status:', response.status, 'Ok:', response.ok);
          if (!response.ok) {
              return response.json().then(errorData => {
                  throw new Error(errorData.error || errorData.errorMessages?.join(' ') || `Request failed with status ${response.status}`);
              }).catch(() => { // Fallback if JSON parsing fails
                  throw new Error(`Request failed with status ${response.status} and couldn't parse error response.`);
              });
          }
          return response.json();
      })
      .then(data => {
          console.log('[App] fetch JSON response received:', data);
          if (data && Array.isArray(data.issues)) {
              setIssues(data.issues); // Correctly set the issues array
              // Processing is triggered by useEffect
          } else {
              console.error('[App] Invalid JSON response structure from /tickets:', data);
              setError('Received an invalid response structure from the server.');
              setIssues([]);
              setIsLoading(false); // Stop loading if response structure is bad
          }
      })
      .catch(err => {
          console.error('[App] fetch FAILED:', err);
          let errMsg = 'Failed to load ticket data. ';
          if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
               errMsg += 'Network error or CORS issue. Check backend & browser console.';
          } else {
              errMsg += err.message || 'Unknown fetch error';
          }
          setError(errMsg.trim());
          setIssues([]);
          setIsLoading(false);
      });
       console.log('[App] fetch request initiated...');
    },
    [projectKey, metadata, startDate, endDate, standardFilters],
  );

   // --- Effects ---

   // Effect to process metrics whenever issues or statusGroups change
  useEffect(() => {
    console.log('[App useEffect] Processing metrics check. Issues count:', issues.length, 'Groups count:', statusGroups.length);

    if (Array.isArray(issues) && issues.length > 0 && Array.isArray(statusGroups) && statusGroups.length > 0) {
      console.log('[App useEffect] Conditions MET. Processing metrics...');
      if (!isLoading) setIsLoading(true); // Ensure loading is true during processing
      setError(null);
      try {
         console.time('[App useEffect] processMetrics duration');
         const metrics = processMetrics(issues, statusGroups);
         console.timeEnd('[App useEffect] processMetrics duration');

         setProcessedData(metrics); // Can be null if processMetrics returns null
         if (metrics === null) {
             console.warn('[App useEffect] processMetrics returned null.');
         } else {
            console.log('[App useEffect] Metrics processed successfully.');
         }
      } catch (err) {
        console.error('[App useEffect] Error during processMetrics execution:', err);
        setError('Failed to process ticket data. Check console for details.');
        setProcessedData(null);
      } finally {
        setIsLoading(false); // Processing finished (success or error)
         console.log('[App useEffect] Metrics processing phase finished.');
      }
    } else {
       console.log('[App useEffect] Conditions NOT MET. Clearing processedData and ensuring loading is false.');
       setProcessedData(null);
       if (isLoading) {
           setIsLoading(false);
       }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, statusGroups]);


  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <Header onProjectChange={handleProjectKeyChange} />

      {/* --- Metadata Loading/Error --- */}
       {isMetadataLoading && (
         <div className="container mx-auto mt-4 max-w-7xl p-4">
          <div className="flex items-center justify-center rounded-lg bg-blue-100 p-4 text-blue-700 shadow">
             {/* Use LoadingSpinner directly if defined globally or import */}
             <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" role="status"></div>
            <span className="ml-3 font-medium">Loading project metadata...</span>
          </div>
         </div>
       )}
      {metadataError && !isMetadataLoading && (
        <div className="container mx-auto mt-4 max-w-7xl">
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow" role="alert">
            <strong className="font-bold">Metadata Error: </strong>
            <span className="block sm:inline">{metadataError}</span>
          </div>
        </div>
      )}

       <ErrorBoundary>
          {metadata && !isMetadataLoading && !metadataError ? (
            <main className="container mx-auto grid max-w-7xl grid-cols-1 gap-6 p-4 pt-6 md:grid-cols-4">
              {/* Filter Panel */}
              <div className="col-span-1 md:col-span-1">
                <FilterPanel
                  metadata={metadata}
                  statusGroups={statusGroups}
                  onStatusGroupsChange={handleStatusGroupsChange}
                  onFilterSubmit={handleFilterSubmit}
                  isLoading={isMetadataLoading || isLoading}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  standardFilters={standardFilters}
                  onStandardFiltersChange={setStandardFilters}
                />
              </div>
              {/* Metrics Dashboard */}
              <div className="col-span-1 md:col-span-3">
                <MetricsDashboard
                  processedData={processedData}
                  isLoading={isLoading}
                  error={error}
                  totalIssues={Array.isArray(issues) ? issues.length : 0}
                />
              </div>
            </main>
          ) :
            (!isMetadataLoading && !metadataError && (
                <div className="container mx-auto mt-6 max-w-7xl p-4 text-center text-gray-500">
                    Please enter a project key above and click "Load" to begin.
                </div>
            ))
          }
       </ErrorBoundary>
    </div>
  );
}

export default App;
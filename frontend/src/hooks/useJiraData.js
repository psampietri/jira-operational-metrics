// frontend/src/hooks/useJiraData.js
import { useState, useCallback, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:3001/api';

export function useJiraData(addLog) {
  const [projectKey, setProjectKey] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(false); // Combined loading
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [error, setErrorState] = useState(null);
  const [metadataError, setMetadataErrorState] = useState(null);

  // Log errors automatically
  const setError = useCallback((message) => {
    if (message) addLog('error', message);
    setErrorState(message);
  }, [addLog]);

  const setMetadataError = useCallback((message) => {
    if (message) addLog('error', message);
    setMetadataErrorState(message);
  }, [addLog]);

  // Project Key Change Handler
  const handleProjectKeyChange = useCallback((key) => {
    if (!key) return;
    const upperKey = key.toUpperCase();
    if (upperKey !== projectKey) {
        addLog('info', `[Data] Setting project key to: ${upperKey}`);
        setProjectKey(upperKey);
        setIssues([]); // Clear data related to old project
        setMetadata(null);
        setErrorState(null);
        setMetadataErrorState(null);
    } else {
        addLog('info', `[Data] Project key "${upperKey}" is already set.`);
    }
  }, [projectKey, addLog]);

  // --- Metadata Fetch Effect ---
  const fetchMetadata = useCallback(async (currentProjectKey, currentStatusGroupsLength) => {
      if (!currentProjectKey) {
          setMetadata(null);
          setMetadataErrorState(null);
          return null; // Return null if no key
      }

      addLog('info', `[Data] Fetching metadata for project: ${currentProjectKey}...`);
      setIsMetadataLoading(true);
      setMetadataErrorState(null);
      setMetadata(null);
      setIssues([]);
      setErrorState(null);
      setIsLoading(true); // Indicate overall loading start

      try {
          const response = await fetch(`${API_BASE_URL}/jira/metadata?projectKey=${currentProjectKey}`);
          if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error || `Metadata request failed: ${response.status}`);
          }
          const meta = await response.json();
          if (!meta || !Array.isArray(meta.statuses)) {
              throw new Error('Invalid metadata structure received.');
          }
          const newMetadata = {
              ...meta,
              projectKeyFromLoad: currentProjectKey,
              statusesMap: new Map(meta.statuses.map(s => [String(s.id), s.name || `Status ${s.id}`]))
          };
          setMetadata(newMetadata);
          addLog('info', `[Data] Metadata fetched successfully for ${currentProjectKey}.`);
          setIsMetadataLoading(false); // Metadata specific loading done
          // Return metadata and default groups *only if* statusGroups are empty
          let defaultGroups = null;
           if (currentStatusGroupsLength === 0) {
               defaultGroups = meta.statuses
                 .filter(s => s?.id != null && s?.name != null)
                 .map(s => ({ id: s.id, name: s.name, statuses: [String(s.id)] }));
               addLog('info', '[Data] Proposing default status groups based on metadata.');
          }
          return { metadata: newMetadata, defaultGroups }; // Return fetched data

      } catch (err) {
          setMetadataError(`Metadata load failed: ${err.message}.`);
          setMetadata(null);
          setIsLoading(false); // Stop overall loading on critical metadata failure
          setIsMetadataLoading(false);
          return null; // Return null on error
      }
  // No setIsLoading(false) here in success, let issue fetch/process handle it
  }, [addLog, setMetadataError]); // Add setMetadataError to dependencies


  // --- Issue Fetch Logic ---
  const handleFilterSubmit = useCallback(async (currentProjectKey, currentMetadata, currentFilters, currentStartDate, currentEndDate) => {
       if (!currentProjectKey || !currentMetadata || metadataError || isMetadataLoading ) {
           addLog('warn', `[Data] Issue fetch aborted. Conditions not met.`);
           if(isLoading) setIsLoading(false); // Ensure loading stops if called incorrectly
           return;
       }

       addLog('info', `[Data] Starting issue fetch for project: ${currentProjectKey}`);
       setIsLoading(true); // Ensure loading is true
       setErrorState(null);
       setIssues([]); // Clear previous issues

       const jqlParts = [];
       if (currentFilters.issueTypes?.length > 0) jqlParts.push(`issueType in (${currentFilters.issueTypes.map(id => `"${id}"`).join(',')})`);
       if (currentFilters.priorities?.length > 0) jqlParts.push(`priority in (${currentFilters.priorities.map(id => `"${id}"`).join(',')})`);
       if (currentStartDate && !isNaN(new Date(currentStartDate))) jqlParts.push(`created >= "${currentStartDate}"`);
       if (currentEndDate && !isNaN(new Date(currentEndDate))) jqlParts.push(`created <= "${currentEndDate} 23:59"`);
       const filterClause = jqlParts.join(' AND ');

       addLog('info', `[Data] Fetching with JQL: ${filterClause || '(No filters)'}`);

       const requestUrl = `${API_BASE_URL}/jira/tickets`;
       const requestPayload = { projectKey: currentProjectKey, jqlFilter: filterClause };

       try {
           const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) });
           if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Issue fetch failed: ${response.status}`);
           }
           const data = await response.json();
           if (data?.issues && Array.isArray(data.issues)) {
               addLog('info', `[Data] Fetched ${data.issues.length} issues successfully.`);
               setIssues(data.issues); // Set issues, triggering processing effect in AppContent
           } else { throw new Error('Invalid issue data structure received.'); }
       } catch (err) {
           setError(`Failed to load ticket data: ${err.message}.`);
           setIssues([]);
           setIsLoading(false); // Stop loading on error
       }
        // Don't set isLoading false on success, let processing effect do it
   }, [addLog, metadataError, isMetadataLoading, isLoading, setError]);


  return {
    projectKey, setProjectKey: handleProjectKeyChange, // Use the handler
    metadata, setMetadata, // Allow external setting if needed (e.g., from load view)
    issues, setIssues, // Allow external setting
    isLoading, setIsLoading,
    isMetadataLoading, setIsMetadataLoading,
    error, setError,
    metadataError, setMetadataError,
    fetchMetadata,
    handleFilterSubmit,
    clearErrors: () => { // Function to clear errors in this hook
        setErrorState(null);
        setMetadataErrorState(null);
    }
  };
}
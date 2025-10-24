// frontend/src/hooks/useSavedViews.js
import { useState, useCallback, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:3001/api';

export function useSavedViews(addLog, currentConfig, onLoadViewSuccess) {
  const [savedViews, setSavedViews] = useState([]);
  const [isLoadingViews, setIsLoadingViews] = useState(false);

  // Fetch List of Views
  const fetchSavedViews = useCallback(async () => {
    addLog('info', '[Views] Fetching saved views list...');
    setIsLoadingViews(true);
    try {
      const response = await fetch(`${API_BASE_URL}/views`);
      if (!response.ok) throw new Error(`Fetch views failed: ${response.statusText}`);
      const views = await response.json();
      setSavedViews(views || []);
      addLog('info', `[Views] Fetched ${views.length} saved views.`);
    } catch (e) {
      addLog('error', `[Views] Failed to fetch saved views list: ${e.message}`);
      setSavedViews([]);
    } finally {
      setIsLoadingViews(false);
    }
  }, [addLog]);

  // Initial fetch
  useEffect(() => {
    fetchSavedViews();
  }, [fetchSavedViews]);


  // Save Current View
  const saveCurrentView = useCallback(async (name) => {
     const { projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig } = currentConfig;
     if (!name || !projectKey) {
         const msg = 'Provide name & load project before saving.';
         alert(msg);
         addLog('warn', `[Views] Save aborted: ${msg}`);
         return;
     }
     addLog('info', `[Views] Saving view: ${name}`);
     const viewConfig = { name, projectKey, startDate, endDate, standardFilters, statusGroups, triageConfig, cycleStartConfig, cycleEndConfig };
     try {
         const response = await fetch(`${API_BASE_URL}/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(viewConfig) });
         if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             if(response.status === 409) throw new Error(errorData.error || `View name "${name}" exists.`);
             throw new Error(errorData.error || `Save failed: ${response.statusText}`);
         }
         await response.json();
         addLog('info', `[Views] View "${name}" saved/updated. Refreshing list.`);
         await fetchSavedViews(); // Refresh list after save
         alert(`View "${name}" saved!`);
     } catch (e) {
         addLog('error', `[Views] Error saving view "${name}": ${e.message}`);
         alert(`Error saving: ${e.message}`);
     }
  }, [currentConfig, fetchSavedViews, addLog]);


  // Load View by ID
  const loadView = useCallback(async (viewId) => {
    if (!viewId) return;
    addLog('info', `[Views] Loading view by ID: ${viewId}`);
    // Loading indicator is handled in AppContent
    try {
      const response = await fetch(`${API_BASE_URL}/views/${viewId}`);
       if (!response.ok) { throw new Error(`Load view request failed: ${response.statusText}`); }
      const viewToLoad = await response.json();
      addLog('info', `[Views] View config "${viewToLoad.name}" loaded.`);
      // Call the success callback provided by AppContent
      // This passes the loaded data back up to set the state there
      onLoadViewSuccess(viewToLoad);
    } catch (e) {
      addLog('error', `[Views] Failed to load view ID ${viewId}: ${e.message}`);
      alert(`Error loading view: ${e.message}`);
      // Error state is handled in AppContent
     }
  }, [addLog, onLoadViewSuccess]);


  // Delete View by ID
  const deleteView = useCallback(async (viewId, viewName) => {
     if (!viewId || !viewName) return;
     addLog('info', `[Views] Deleting view ID: ${viewId} (Name: ${viewName})`);
     try {
         const response = await fetch(`${API_BASE_URL}/views/${viewId}`, { method: 'DELETE' });
         if (!response.ok) { throw new Error(`Delete failed: ${response.statusText}`); }
         addLog('info', `[Views] View "${viewName}" deleted. Refreshing list.`);
         alert(`View "${viewName}" deleted.`);
         await fetchSavedViews(); // Refresh list
     } catch (e) {
         addLog('error', `[Views] Error deleting view "${viewName}": ${e.message}`);
         alert(`Error deleting: ${e.message}`);
     }
  }, [fetchSavedViews, addLog]);


  return {
    savedViews,
    isLoadingViews,
    fetchSavedViews, // Expose if manual refresh is needed
    saveCurrentView,
    loadView,
    deleteView,
  };
}
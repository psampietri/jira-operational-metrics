// frontend/src/hooks/useAppEffects.js
import { useEffect, useRef, useState } from 'react'; // Added useState
import { processMetrics } from '../utils/dataProcessor.js';

export function useAppEffects({
    // State & Setters from useJiraData
    projectKey,
    metadata,
    metadataError,
    isMetadataLoading,
    issues,
    isLoading, // Need to READ
    fetchMetadata,
    handleFilterSubmit,
    error, // Need to READ
    setError, // Need function
    setIsLoading, // Need function
    setMetadata,
    setMetadataError,

    // State & Setters from useFilters
    startDate,
    endDate,
    standardFilters,
    cycleStartConfig,
    cycleEndConfig,
    triageConfig,

    // State & Setters from useStatusGroups
    statusGroups,
    // setStatusGroups, // Not needed here anymore
    setDefaultStatusGroups,

    // State & Setters from AppContent
    processedData, // Need to READ
    setProcessedData, // Need function
    addLog,
    clearAllErrors,
    explicitFetchTriggered,
    flowWarningLoggedRef,
}) {

    // --- State to track if processing *should* be happening ---
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Effect to Fetch Metadata ---
    useEffect(() => {
        // ... (logic remains the same) ...
        if (projectKey && (!metadata || metadataError || projectKey !== (metadata?.projectKeyFromLoad))) {
            const runFetch = async () => {
                flowWarningLoggedRef.current = false;
                // --- Indicate processing might need to stop ---
                setIsProcessing(false);
                setProcessedData(null); // Clear old data on metadata fetch start
                const result = await fetchMetadata(projectKey, statusGroups.length);
                if (result?.metadata) {
                    setDefaultStatusGroups(result.metadata);
                }
            }
            runFetch();
        } else if (!projectKey) {
             if (metadata !== null) setMetadata(null);
             if (metadataError !== null) setMetadataError(null);
             // --- Indicate processing should stop ---
             setIsProcessing(false);
             setProcessedData(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey, fetchMetadata, setDefaultStatusGroups, /* statusGroups.length removed */ metadata, metadataError, setMetadata, setMetadataError, flowWarningLoggedRef, setProcessedData]); // Added setProcessedData


    // --- Effect to Trigger Issue Fetch ---
    useEffect(() => {
        // ... (logic remains the same) ...
        if (!explicitFetchTriggered.current) { return; }
        const metadataIsValid = metadata && !metadataError && !isMetadataLoading && metadata.projectKeyFromLoad === projectKey;
        if (projectKey && metadataIsValid) {
            addLog('info', "[AppEffects] Conditions met for explicit fetch trigger. Fetching issues...");
            explicitFetchTriggered.current = false;
            flowWarningLoggedRef.current = false;
             // --- Indicate processing might need to stop/restart ---
             setIsProcessing(false);
             setProcessedData(null); // Clear old data before fetching new issues
            handleFilterSubmit(projectKey, metadata, standardFilters, startDate, endDate);
        } else if (projectKey && !isMetadataLoading) {
            const reason = !metadata ? 'Metadata not loaded.' : metadataError ? 'Metadata failed.' : 'Metadata stale or project mismatch.';
            addLog('warn', `[AppEffects] Explicit fetch trigger waiting. Conditions not met. Reason: ${reason}`);
            if (metadataError) { setError("Cannot fetch issues: Metadata failed to load."); }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        projectKey, metadata, metadataError, isMetadataLoading,
        handleFilterSubmit, standardFilters, startDate, endDate, addLog, setError, flowWarningLoggedRef, setProcessedData // Added setProcessedData
    ]);


    // --- Effect to Determine if Processing SHOULD Run ---
    // This effect *only* decides if processing *can* start and sets the isProcessing flag.
    // It depends *only* on the data inputs.
    useEffect(() => {
        const actualMetadataStatuses = metadata?.statuses;
        const canProcess = issues.length > 0 && Array.isArray(statusGroups) && triageConfig.value && cycleStartConfig.value && cycleEndConfig.value && startDate && endDate && actualMetadataStatuses;

        if (canProcess) {
            setIsProcessing(true); // Signal that processing should start
            flowWarningLoggedRef.current = false; // Reset warning flag
        } else {
            setIsProcessing(false); // Signal that processing should stop or not start
            setProcessedData(null); // Clear data if inputs are no longer valid

            // Log flow point warning only once if applicable
            const flowPointsMissing = !triageConfig.value || !cycleStartConfig.value || !cycleEndConfig.value;
             // Read states from closure for condition
             if (!isMetadataLoading && projectKey && metadata && !metadataError && issues.length > 0 && flowPointsMissing && !flowWarningLoggedRef.current) {
                  addLog('warn', "[AppEffects] Cannot process metrics: Flow points (Triage, Start, End) are not configured.");
                  flowWarningLoggedRef.current = true;
             }
        }
    // Depend ONLY on the data inputs for the calculation
    }, [
        issues,
        statusGroups,
        startDate,
        endDate,
        cycleStartConfig,
        cycleEndConfig,
        triageConfig,
        metadata?.statuses,
        // Also need setters/state used *within* this specific effect's logic
        setIsProcessing,
        setProcessedData,
        flowWarningLoggedRef,
        isMetadataLoading, // For conditional logging
        projectKey, // For conditional logging
        metadata, // For conditional logging
        metadataError, // For conditional logging
        addLog // For logging
    ]);


    // --- Effect to ACTUALLY Process Metrics ---
    // This effect runs ONLY when the isProcessing flag becomes true.
    // It performs the calculation and manages the main isLoading state.
    useEffect(() => {
        if (!isProcessing) {
            // If processing is flagged to stop, ensure loading is also stopped
            if (isLoading) setIsLoading(false);
            return; // Exit if not supposed to be processing
        }

        // We are processing, set loading true
        setIsLoading(true);
        addLog('info', `[AppEffects] Starting metrics calculation for ${issues.length} issues...`);

        // Use setTimeout to ensure loading state updates UI before blocking
        const timerId = setTimeout(() => {
            try {
                const actualMetadataStatuses = metadata?.statuses; // Get fresh value
                if (!actualMetadataStatuses) throw new Error("Metadata statuses missing during processing."); // Safety check

                console.time('[AppEffects ProcessMetrics] Duration');
                const metrics = processMetrics(
                    issues, statusGroups, startDate, endDate,
                    cycleStartConfig, cycleEndConfig, triageConfig,
                    actualMetadataStatuses
                );
                console.timeEnd('[AppEffects ProcessMetrics] Duration');

                setProcessedData(metrics);
                if (!metrics) addLog('warn', '[AppEffects] Data processing returned null.');
                else addLog('info', '[AppEffects] Data processing complete.');

            } catch (err) {
                setError(`Processing failed: ${err.message}.`);
                setProcessedData(null);
            } finally {
                setIsLoading(false); // Stop loading after calculation attempt
                setIsProcessing(false); // Reset processing flag after completion/failure
            }
        }, 50); // Slightly longer delay might help ensure state updates propagate

        return () => {
            clearTimeout(timerId);
            // Optional: If effect cleans up before finishing, ensure loading stops
            // setIsLoading(false); // This might cause flicker if calculation is fast
            // setIsProcessing(false); // Reset flag on cleanup too
        };

    // This effect ONLY depends on the isProcessing flag and the functions it calls
    }, [
        isProcessing, // <<<< KEY DEPENDENCY
        // Data needed for processMetrics call (read from closure, assumed stable between processing start/end)
        issues, statusGroups, startDate, endDate, cycleStartConfig, cycleEndConfig, triageConfig, metadata,
        // Functions
        setIsLoading, setProcessedData, addLog, setError, setIsProcessing // Include setIsProcessing
    ]);

} // End of useAppEffects hook
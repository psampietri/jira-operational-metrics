// frontend/src/components/AppLayout.jsx
import React from 'react';
import Header from './Header.jsx';
import FilterPanel from './FilterPanel.jsx';
import MetricsDashboard from './MetricsDashboard.jsx';
import TransactionalConsole from './TransactionalConsole.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
// Import the new modal
import MetricsExplanationModal from './MetricsExplanationModal.jsx';
import ExportModal from './ExportModal.jsx';


// This component receives all necessary state and handlers as props
function AppLayout({
    // Project/Data State
    projectKey,
    metadata,
    processedData,
    statusMap,
    statusGroups,
    isLoading, // Combined loading
    isMetadataLoading,
    displayError, // Combined error message

    // Filter State & Handlers
    startDate, endDate, standardFilters, cycleStartConfig, cycleEndConfig, triageConfig,
    onStatusGroupsChange, onFilterSubmit, onStartDateChange, onEndDateChange,
    onStandardFiltersChange, onCycleStartConfigChange, onCycleEndConfigChange, onTriageConfigChange,

    // Saved Views State & Handlers
    savedViews, isLoadingViews, onSaveView, onLoadView, onDeleteView,

    // Modal State & Handlers
    isLogModalOpen, onToggleLogModal,
    isExplanationModalOpen, onToggleExplanationModal, // Added for explanation modal
    isExportModalOpen, onToggleExportModal, exportData, // Added for export modal

    // Other Handlers
    onProjectChange,
    onClearErrors,
    onExportData, // <-- Prop received from AppContent
    canExport,    // <-- Prop received from AppContent
}) {

    const showProcessingOrFetchingIndicator = isLoading || isMetadataLoading;
    const isMetadataLoadError = displayError && (
        displayError.includes('Metadata load failed') ||
        displayError.includes('Metadata request failed') ||
        displayError.includes('Invalid metadata structure')
    );

    return (
        <div className="min-h-screen bg-gray-100 font-inter relative">
            <Header
                projectKey={projectKey}
                onProjectChange={onProjectChange}
                savedViews={savedViews}
                isLoadingViews={isLoadingViews}
                onSaveView={onSaveView}
                onLoadView={onLoadView}
                onDeleteView={onDeleteView}
                onToggleLogModal={onToggleLogModal}
                onToggleExplanationModal={onToggleExplanationModal}
                onExportData={onExportData} // <-- Pass down export handler
                canExport={canExport}       // <-- Pass down export flag
            />

            {/* Error Display */}
            {displayError && !showProcessingOrFetchingIndicator && (
                <div className="container mx-auto mt-4 max-w-7xl">
                    <div className={`rounded-md border p-4 shadow ${isMetadataLoadError ? 'border-red-300 bg-red-50 text-red-700' : 'border-yellow-300 bg-yellow-50 text-yellow-700'}`} role="alert">
                         <strong className="font-bold">{isMetadataLoadError ? 'Error: ' : 'Info: '}</strong>
                        <span className="block sm:inline">{displayError}</span>
                        <button onClick={onClearErrors} className="ml-4 rounded bg-white px-2 py-1 text-xs font-bold text-gray-700 shadow hover:bg-gray-100">Clear Error</button>
                    </div>
                </div>
            )}

            <ErrorBoundary>
                {projectKey ? (
                    <main className="container mx-auto grid max-w-7xl grid-cols-1 gap-6 p-4 pt-6 md:grid-cols-4">
                        {/* Filter Panel */}
                        <div className="col-span-1 md:col-span-1">
                            <FilterPanel
                                metadata={metadata}
                                statusGroups={statusGroups}
                                startDate={startDate}
                                endDate={endDate}
                                standardFilters={standardFilters}
                                cycleStartConfig={cycleStartConfig}
                                cycleEndConfig={cycleEndConfig}
                                triageConfig={triageConfig}
                                onStatusGroupsChange={onStatusGroupsChange}
                                onFilterSubmit={onFilterSubmit}
                                onStartDateChange={onStartDateChange}
                                onEndDateChange={onEndDateChange}
                                onStandardFiltersChange={onStandardFiltersChange}
                                onCycleStartConfigChange={onCycleStartConfigChange}
                                onCycleEndConfigChange={onCycleEndConfigChange}
                                onTriageConfigChange={onTriageConfigChange}
                                isLoading={showProcessingOrFetchingIndicator}
                            />
                        </div>
                        {/* Dashboard */}
                        <div className="col-span-1 md:col-span-3">
                            <MetricsDashboard
                                processedData={processedData}
                                isLoading={showProcessingOrFetchingIndicator}
                                error={!showProcessingOrFetchingIndicator ? displayError : null}
                                groupOrder={statusGroups.map((g) => g.name)}
                                statusMap={statusMap}
                                statusGroups={statusGroups}
                            />
                        </div>
                    </main>
                ) : (
                    <div className="container mx-auto mt-6 max-w-7xl p-4 text-center text-gray-500">
                        {isMetadataLoadError ? `Failed to load project: ${displayError}` : 'Please enter a project key above and click "Load" to begin.'}
                    </div>
                )}
            </ErrorBoundary>

            {/* Log Modal */}
            <TransactionalConsole isOpen={isLogModalOpen} onClose={onToggleLogModal} />

            {/* Explanation Modal (Already passed down from AppContent) */}
            <MetricsExplanationModal isOpen={isExplanationModalOpen} onClose={onToggleExplanationModal} />

            {/* Export Modal (Rendered here, props passed from AppContent) */}
            <ExportModal isOpen={isExportModalOpen} onClose={onToggleExportModal} data={exportData} />

        </div>
    );
}

export default AppLayout;
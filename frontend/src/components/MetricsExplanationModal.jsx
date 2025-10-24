// frontend/src/components/MetricsExplanationModal.jsx
import React from 'react';

// Simple Close Icon SVG
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

// Section Component for consistent styling
const ExplanationSection = ({ title, children }) => (
    <div className="mb-6">
        <h3 className="text-xl font-semibold text-blue-300 mb-2 border-b border-gray-600 pb-1">{title}</h3>
        <div className="space-y-2 text-gray-300 text-sm">
            {children}
        </div>
    </div>
);

// Metric Definition Component
const MetricDef = ({ term, definition }) => (
    <p>
        <strong className="text-blue-100">{term}:</strong> {definition}
    </p>
);

function MetricsExplanationModal({ isOpen, onClose }) {
    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4"
            onClick={onClose} // Close on overlay click
        >
            <div
                className="relative flex flex-col w-full max-w-3xl max-h-[90vh] rounded-lg bg-gray-800 text-white shadow-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()} // Prevent closing on content click
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-600 p-4 flex-shrink-0 bg-gray-700">
                    <h2 className="text-xl font-semibold text-gray-100">
                        Metrics Explanations
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 text-gray-400 hover:bg-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
                        title="Close Explanations"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">

                    <ExplanationSection title="📊 Overall Metrics Tab">
                        <p>This tab provides key performance indicators summarizing operational efficiency and work cycle duration based on your selected filters and flow point configurations.</p>
                        <MetricDef
                            term="MTTA (Mean Time to Acknowledge)"
                            definition="Average time (in hours) from issue creation until it first moves *out* of the status(es)/group configured as 'Triage/New Point'. Measures how quickly new work is picked up."
                        />
                        <MetricDef
                            term="MTTR (Mean Time to Resolution)"
                            definition="Average time (in hours) from issue creation until it first enters any status within the configured 'Resolution Point'. Measures the total time from reporting to resolution."
                        />
                         <MetricDef
                            term="Avg Cycle (Work)"
                            definition="Average time (in days) from when an issue first enters any status in the 'Work Start Point' until it first enters any status in the 'Resolution Point'. Measures the duration of the active work phase for *completed* items."
                        />
                         <MetricDef
                            term="Median Cycle (Work) / P50"
                            definition="The midpoint of cycle times (in days) for completed work. 50% of issues that finished the 'Work Start' to 'Resolution Point' cycle did so within this time or less. Less sensitive to outliers than the average."
                        />
                         <MetricDef
                            term="85th % Cycle (Work) / P85"
                            definition="The cycle time (in days) within which 85% of completed issues finished the 'Work Start' to 'Resolution Point' cycle. Indicates the cycle time for the vast majority, helping understand predictability."
                        />
                    </ExplanationSection>

                    <ExplanationSection title="🌊 Flow & Cycle Time Tab">
                        <p>This tab visualizes how work moves through your process over time.</p>
                         <MetricDef
                            term="Cumulative Flow Diagram (CFD)"
                            definition="Shows the total count of issues in each Status Group at the end of each day within the selected date range. Helps identify bottlenecks (where bands widen) and approximate average cycle time (horizontal distance between bands)."
                        />
                        <MetricDef
                            term="Cycle Time Histogram"
                            definition="Shows the distribution of cycle times (Work Start to Resolution Point) for issues completed within the date range. Visualizes how many issues fall into different duration buckets (e.g., 0-1 days, 1-2 days)."
                        />
                         <MetricDef
                            term="Throughput"
                            definition="Shows the number of issues that first entered the configured 'Resolution Point' status(es)/group on each day within the selected date range. Measures the rate of completion."
                        />
                    </ExplanationSection>

                     <ExplanationSection title="📍 Current State Tab">
                        <p>This tab provides a snapshot of the current situation and historical time spent in different stages.</p>
                         <MetricDef
                            term="Current Status Distribution"
                            definition="A pie chart showing the percentage of currently open issues residing in each Status Group. Provides a snapshot of where work is concentrated right now."
                        />
                        <MetricDef
                            term="Average Time Spent in Status"
                            definition="A table showing the average time (in hours/days) that *all processed issues* spent in each individual status and aggregated status group. This includes time spent by issues still in progress. Useful for identifying specific statuses where issues spend the most time."
                        />
                         <MetricDef
                            term="Current WIP (Work In Progress)"
                            definition="Calculated based on the 'Overall Metrics' definition but often contextualized here. It's the count of issues currently in statuses NOT designated as Triage, Start, or Resolution points. Visible in the 'Overall Metrics' tab."
                        />
                    </ExplanationSection>

                    <ExplanationSection title="🔗 How Metrics Correlate">
                        <p>While calculated differently, these metrics provide related insights:</p>
                        <ul className="list-disc list-inside space-y-1 ml-4">
                            <li><strong className="text-blue-100">Time In Status vs. Cycle Time:</strong> The sum of average times spent in statuses *between* your 'Work Start' and 'Resolution' points (from the 'Current State' tab) heavily influences the overall Avg Cycle Time (from the 'Overall Metrics' tab). High 'Time In Status' for intermediate steps leads to longer cycle times.</li>
                            <li><strong className="text-blue-100">CFD vs. Cycle Time/WIP:</strong> Little's Law suggests: Average Cycle Time ≈ Average WIP / Average Throughput. The CFD visually represents WIP (vertical distance) and helps infer cycle time (horizontal distance). Throughput is shown separately.</li>
                             <li><strong className="text-blue-100">Distribution vs. Bottlenecks:</strong> If the 'Current State' distribution shows many issues piled up in a specific group, and the 'Time In Status' table shows a high average time for statuses in that group, it indicates a bottleneck that impacts Cycle Time and MTTR.</li>
                             <li><strong className="text-blue-100">MTTA/MTTR vs. Time In Status:</strong> MTTA relates to time spent in 'Triage' statuses. MTTR includes time across all statuses up to resolution. High 'Time In Status' values contribute directly to these operational metrics.</li>
                        </ul>
                    </ExplanationSection>

                </div>
            </div>
        </div>
    );
}

export default MetricsExplanationModal;
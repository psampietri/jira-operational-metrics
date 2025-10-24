// frontend/src/components/ExportModal.jsx
import React, { useState, useEffect } from 'react';

// Simple Close Icon SVG
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

// Simple Copy Icon SVG
const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375V11.25m0 0h3.75m-3.75 0a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621-.504-1.125-1.125-1.125h-1.521a9.043 9.043 0 0 1-1.5-.124H6.75" />
    </svg>
);


function ExportModal({ isOpen, onClose, data }) {
    const [copySuccess, setCopySuccess] = useState('');
    const textAreaRef = React.useRef(null);

    // Reset copy success message when modal opens/closes or data changes
    useEffect(() => {
        setCopySuccess('');
    }, [isOpen, data]);

    if (!isOpen) {
        return null;
    }

    const handleCopy = async () => {
        if (textAreaRef.current) {
            try {
                await navigator.clipboard.writeText(textAreaRef.current.value);
                setCopySuccess('Copied!');
                setTimeout(() => setCopySuccess(''), 2000); // Clear message after 2s
            } catch (err) {
                console.error('Failed to copy text: ', err);
                setCopySuccess('Failed to copy');
                 setTimeout(() => setCopySuccess(''), 2000);
            }
        }
    };

    // Format the data as a pretty JSON string
    const jsonDataString = JSON.stringify(data, null, 2); // Indent with 2 spaces

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4"
            onClick={onClose} // Close on overlay click
        >
            <div
                className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-lg bg-gray-800 text-white shadow-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()} // Prevent closing on content click
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-600 p-4 flex-shrink-0 bg-gray-700">
                    <h2 className="text-xl font-semibold text-gray-100">
                        Export Data for AI Analysis (JSON)
                    </h2>
                    <div className="flex items-center space-x-2">
                         <button
                            onClick={handleCopy}
                            disabled={!data}
                            className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 disabled:opacity-50 ${
                                copySuccess === 'Copied!'
                                ? 'bg-green-600 border-green-500 text-white focus:ring-green-400'
                                : copySuccess === 'Failed to copy'
                                ? 'bg-red-600 border-red-500 text-white focus:ring-red-400'
                                : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 focus:ring-blue-400'
                            }`}
                            title="Copy JSON to clipboard"
                        >
                           <CopyIcon />
                           {copySuccess || 'Copy JSON'}
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-full p-1 text-gray-400 hover:bg-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
                            title="Close Export"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-auto p-2 bg-gray-900">
                    <textarea
                        ref={textAreaRef}
                        readOnly
                        value={jsonDataString || 'No data generated yet.'}
                        className="w-full h-full bg-transparent border-none text-gray-300 font-mono text-xs p-4 focus:outline-none resize-none"
                        aria-label="Exported JSON Data"
                    />
                </div>
            </div>
        </div>
    );
}

export default ExportModal;
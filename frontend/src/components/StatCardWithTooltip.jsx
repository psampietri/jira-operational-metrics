// frontend/src/components/StatCardWithTooltip.jsx
import React, { useState } from 'react';

// Simple Question Mark Icon SVG
const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors duration-150"> {/* Slightly larger, added transition */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
);

// Tooltip Component (remains the same)
const Tooltip = ({ text, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative inline-block group"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <div className="absolute z-20 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 text-sm text-white bg-gray-900 rounded-md shadow-lg pointer-events-none opacity-95"> {/* Darker tooltip */}
          {text}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};


// Main Stat Card Component - Redesigned
const StatCardWithTooltip = ({ title, value, subtext, tooltipText, iconPlaceholder }) => {
  // `iconPlaceholder` could be an SVG component or an emoji string passed as a prop
  // Example: iconPlaceholder={<YourSvgIconComponent />} or iconPlaceholder="⏱️"

  return (
    <div className="relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-lg border border-gray-100 min-h-[140px] min-w-[200px] transition-all duration-200 ease-in-out hover:shadow-xl hover:border-blue-200"> {/* Increased size, padding, border, hover effect */}

      {/* Top section: Icon and Info */}
      <div className="flex items-start justify-between mb-2">
        {/* Placeholder for Icon - Render actual icon component here */}
        {iconPlaceholder && (
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
             {/* Example: Render SVG or text icon */}
            {/* {iconPlaceholder} */}
             <span className="text-xl">{iconPlaceholder}</span> {/* Simple text/emoji example */}
          </div>
        )}
        {!iconPlaceholder && <div className="w-10 h-10 mr-3"></div>} {/* Spacer if no icon */}


        {/* Info Icon Tooltip */}
        {tooltipText && (
          <div className="absolute top-3 right-3"> {/* Position top-right */}
            <Tooltip text={tooltipText}>
              <button className="focus:outline-none p-1 rounded-full hover:bg-gray-100">
                <InfoIcon />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Bottom section: Title, Value, Subtext */}
      <div>
         {/* Title */}
        <div className="text-sm font-medium text-gray-500 truncate mb-1" title={title}>
            {title}
        </div>

        {/* Value */}
        <div className="text-4xl font-bold text-gray-900 truncate tracking-tight" title={value}> {/* Bolder, larger value */}
          {value}
        </div>

        {/* Subtext */}
        {subtext && (
            <div className="text-xs text-gray-400 mt-1 truncate" title={subtext}>
                {subtext}
            </div>
        )}
      </div>

    </div>
  );
};

export default StatCardWithTooltip;
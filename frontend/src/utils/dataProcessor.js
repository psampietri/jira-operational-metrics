/*
 * JiraMetricsDashboard - dataProcessor.js
 *
 * This is the brain of the metrics calculation.
 * It takes raw issues (with changelogs) and the user-defined
 * status groups, then calculates all metrics.
 *
 * CRITICAL LOGIC:
 * The `calculateTimeInStatus` function builds a complete timeline
 * for each issue, mapping each status to its *group*. It then
 * iterates the timeline to sum the durations for each *group*,
 * correctly handling transitions *within* the same group.
 */

/**
 * Main processing function.
 * @param {Array} issues - Array of raw issue objects from Jira API.
 * @param {Array} statusGroups - Array of { id, name, statuses: [id1, ...] }
 * @returns {Object|null} - { distribution, timeInStatusTable } or null if invalid input
 */
export function processMetrics(issues, statusGroups) {
  // Add a console log to see when this function runs and with what data
  console.log('[processMetrics] Running with issues (count):', issues?.length, 'and groups (count):', statusGroups?.length); // Log counts

  // --- ADDED: More robust initial checks ---
  if (!Array.isArray(issues) || issues.length === 0) {
    console.warn('[processMetrics] Invalid or empty issues array provided.');
    return null;
  }
  if (!Array.isArray(statusGroups) || statusGroups.length === 0) {
    console.warn('[processMetrics] Invalid or empty statusGroups array provided.');
    return null; // Need groups to process
  }


  // --- 1. Create Lookup Maps ---
  const statusToGroupMap = new Map();
  const groupTimeCounters = new Map();
  const groupIssueCounters = new Map();

  // --- ADDED: Check each group during initialization ---
  statusGroups.forEach((group) => {
    // Check if group is valid and has a name and statuses array
    if (group && group.name && Array.isArray(group.statuses)) {
        group.statuses.forEach((statusId) => {
            // Ensure statusId is not null/undefined before setting
            if (statusId != null) {
                statusToGroupMap.set(String(statusId), group.name); // Ensure keys are strings
            } else {
                console.warn('[processMetrics] Found null/undefined statusId in group:', group.name);
            }
        });
        groupTimeCounters.set(group.name, 0);
        groupIssueCounters.set(group.name, 0);
    } else {
       console.warn('[processMetrics] Invalid status group structure found:', group);
    }
  });


  // --- 2. Calculate Status Distribution (Current Status) ---
  issues.forEach((issue) => {
    // Basic check for expected structure
    if (issue && issue.fields && issue.fields.status && issue.fields.status.id != null) { // Check id is not null/undefined
      const currentStatusId = String(issue.fields.status.id); // Ensure ID is string for map lookup
      const groupName = statusToGroupMap.get(currentStatusId);
      if (groupName) {
        // Check if groupName exists in counters before incrementing
        if (groupIssueCounters.has(groupName)) {
            groupIssueCounters.set(groupName, groupIssueCounters.get(groupName) + 1);
        } else {
             // This warning might indicate an issue with group initialization or status mapping
             console.warn(`[processMetrics] Status ID ${currentStatusId} maps to group '${groupName}', but this group is not initialized in counters.`);
        }
      } else {
        // Log statuses that don't belong to any defined group, might be useful
        // console.log(`[processMetrics] Status ID ${currentStatusId} (${issue.fields.status.name || 'N/A'}) does not belong to any defined group.`); // Reduced verbosity
      }
    } else {
       console.warn('[processMetrics] Issue structure is missing expected fields for status distribution:', issue?.key || issue);
    }
  });


  const totalIssues = issues.length;
  // --- ADDED: Filter out groups with potentially NaN percentage if totalIssues is 0 ---
  const distribution = Array.from(groupIssueCounters.entries()).map(
    ([name, count]) => ({
      name,
      count,
      percentage: totalIssues > 0 ? (count / totalIssues) * 100 : 0,
    }),
  );

  // --- 3. Calculate Time In Status ---
  const timeInGroupMs = calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters);

  // --- 4. Format Final Table Data ---
  // --- ADDED: Check result of calculateTimeInStatus ---
  if (!(timeInGroupMs instanceof Map)) {
      console.error('[processMetrics] calculateTimeInStatus did not return a Map.');
      return { distribution, timeInStatusTable: [] }; // Return empty table data if calculation failed
  }

  const timeInStatusTable = Array.from(timeInGroupMs.entries()).map(
    ([groupName, ms]) => ({
      groupName,
      totalMs: ms || 0, // Default to 0 if ms is undefined/null
      totalHours: (ms || 0) / (1000 * 60 * 60),
      totalDays: (ms || 0) / (1000 * 60 * 60 * 24),
    }),
  );

  const result = { distribution, timeInStatusTable };
  console.log('[processMetrics] Finished processing. Result counts:', {distribution: result.distribution.length, table: result.timeInStatusTable.length});
  return result;
}

/**
 * Calculates the total time spent in each status *group*.
 * @param {Array} issues - Raw issues.
 * @param {Map} statusToGroupMap - { statusId -> 'GroupName' }
 * @param {Map} groupTimeCounters - { 'GroupName' -> 0 } Initialized counters
 * @returns {Map} - { 'GroupName' -> totalMs }
 */
function calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters) {
  // Clone the initialized map to ensure we start fresh for each calculation
  const timeInGroup = new Map(groupTimeCounters);
   // Ensure all group names from the initial counters are present (defensive)
  groupTimeCounters.forEach((_, groupName) => {
    if (!timeInGroup.has(groupName)) {
      timeInGroup.set(groupName, 0);
    }
  });

  for (const issue of issues) {
     // Check if issue and necessary fields exist
     if (!issue || !issue.fields || !issue.fields.created) {
       console.warn('[calculateTimeInStatus] Issue is missing fields or created date:', issue?.key || issue);
       continue; // Skip this issue if basic fields are missing
     }
      const hasChangelog = issue.changelog && Array.isArray(issue.changelog.histories);

    // 1. Get all *status* changes from the changelog
    const statusChanges = hasChangelog ? issue.changelog.histories
      .flatMap((history) => {
          // Check if history and items exist
          if (!history || !Array.isArray(history.items)) return [];
          return history.items
            .filter((item) => item && item.field === 'status' && item.from != null && item.to != null) // Check item, field, from/to exist
            .map((item) => {
                // Validate date before creating Date object
                const createdDate = history.created ? new Date(history.created) : null;
                if (!createdDate || isNaN(createdDate.getTime())) {
                    console.warn(`[calculateTimeInStatus] Invalid history created date found for issue ${issue.key}:`, history.created);
                    return null; // Skip this change if date is invalid
                }
                return {
                    timestamp: createdDate,
                    fromId: String(item.from), // Ensure string IDs
                    toId: String(item.to),     // Ensure string IDs
                };
            })
            .filter(change => change !== null); // Filter out nulls from invalid dates
        })
      .sort((a, b) => a.timestamp - b.timestamp) // Sort by date, ascending
      : []; // Default to empty array if no changelog

    // 2. Build a complete issue timeline
    const timeline = [];
    const createdDate = new Date(issue.fields.created);
    if (isNaN(createdDate.getTime())) {
        console.warn(`[calculateTimeInStatus] Invalid created date for issue ${issue.key}:`, issue.fields.created);
        continue; // Skip issue if created date is invalid
    }

    // Determine the initial status ID
    const firstChange = statusChanges[0];
    const createdStatusId = firstChange ? firstChange.fromId : null;

    if (createdStatusId) {
      timeline.push({
        timestamp: createdDate,
        statusId: createdStatusId, // Initial status ID
      });

      // Add all subsequent changes
      statusChanges.forEach((change) => {
            timeline.push({
                timestamp: change.timestamp,
                statusId: change.toId, // Status ID after the change
            });
      });

      // 3. Iterate the timeline and sum durations by *group*
      for (let i = 0; i < timeline.length; i++) {
        const startEvent = timeline[i];
        if (!startEvent || startEvent.statusId == null || !(startEvent.timestamp instanceof Date) || isNaN(startEvent.timestamp.getTime())) {
           console.warn('[calculateTimeInStatus] Invalid startEvent in timeline:', startEvent, 'Issue:', issue.key);
           continue;
        }

        const endEvent = timeline[i + 1] || { timestamp: new Date() }; // Use "now" as the end
        if (!(endEvent.timestamp instanceof Date) || isNaN(endEvent.timestamp.getTime())) {
            console.warn('[calculateTimeInStatus] Invalid endEvent timestamp in timeline:', endEvent, 'Issue:', issue.key);
            continue; // Skip if end timestamp is invalid
        }

        const startTimestamp = startEvent.timestamp.getTime();
        const endTimestamp = endEvent.timestamp.getTime();

        const groupName = statusToGroupMap.get(startEvent.statusId);

        if (groupName) {
          const durationMs = endTimestamp - startTimestamp;

          if (durationMs >= 0 && timeInGroup.has(groupName)) {
            timeInGroup.set(
              groupName,
              timeInGroup.get(groupName) + durationMs,
            );
          } else if (!timeInGroup.has(groupName)) {
             console.warn(`[calculateTimeInStatus] Status ID ${startEvent.statusId} maps to group '${groupName}', but group not in time counters.`);
          } else if (durationMs < 0) {
             console.warn('[calculateTimeInStatus] Calculated negative duration:', { durationMs, startEvent, endEvent }, 'Issue:', issue.key);
          }
        }
      }
    } else {
        if(!hasChangelog) {
           // console.log(`[calculateTimeInStatus] Issue ${issue.key || 'UNKNOWN'} missing changelog. Skipping time calculation.`); // Reduced verbosity
        } else if (statusChanges.length === 0) {
           // console.log(`[calculateTimeInStatus] Issue ${issue.key || 'UNKNOWN'} had changelog but no valid status changes. Skipping time calculation.`); // Reduced verbosity
        } else {
           // console.log(`[calculateTimeInStatus] Issue ${issue.key || 'UNKNOWN'} could not determine initial status from changelog. Skipping time calculation.`); // Reduced verbosity
        }
    }
  }
  return timeInGroup;
}
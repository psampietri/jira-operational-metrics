/*
 * JiraMetricsDashboard - dataProcessor.js
 *
 * Calculates metrics, supporting configuration by Status Group OR individual Status.
 * Produces detailed status-level data alongside aggregated group-level data.
 */

// --- Date Helpers (getDuration, getPercentile, getDateRange - implemented) ---
/**
 * Calculates the duration between two Date objects in the specified unit.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string} unit - 'ms', 'hours', or 'days'
 * @returns {number} - Duration in the specified unit.
 */
function getDuration(startDate, endDate, unit) {
    if (!startDate || !endDate) return 0;
    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs <= 0) return 0;

    switch (unit) {
        case 'ms': return diffMs;
        case 'hours': return diffMs / (1000 * 60 * 60);
        case 'days':
        default: return diffMs / (1000 * 60 * 60 * 24);
    }
}

/**
 * Calculates the Nth percentile of a sorted array of numbers.
 * @param {Array<number>} sortedArray - Array of durations, already sorted.
 * @param {number} percentile - The percentile to calculate (e.g., 50, 85).
 * @returns {number} - The value at the specified percentile.
 */
function getPercentile(sortedArray, percentile) {
    if (!sortedArray || sortedArray.length === 0) return 0;
    // Calculate index using ceiling for a robust result, ensuring at least one element is chosen.
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
}

/**
 * Generates an array of date strings (YYYY-MM-DD) for every day
 * between and including the start and end dates.
 * @param {string} startDateStr - Start date string (YYYY-MM-DD)
 * @param {string} endDateStr - End date string (YYYY-MM-DD)
 * @returns {Array<string>} - Array of date strings.
 */
function getDateRange(startDateStr, endDateStr) {
    // Create Date objects from YYYY-MM-DD strings. They are interpreted as midnight UTC.
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) {
        return [];
    }

    const dateArray = [];
    const currentDate = new Date(start);
    
    // Loop through each day.
    while (currentDate.getTime() <= end.getTime()) {
        // Format date as YYYY-MM-DD string
        const dateString = currentDate.toISOString().split('T')[0];
        dateArray.push(dateString);
        
        // Move to the next day. This is a robust way to iterate days across DST changes.
        currentDate.setDate(currentDate.getDate() + 1);
        
        // Safety break for unexpected loops (e.g., max ~2.7 years)
        if (dateArray.length > 1000) return []; 
    }

    return dateArray;
}

// --- NEW Helper: Get Status IDs from Config ---
/**
 * Resolves a configuration object ({type, value}) into a Set of status IDs.
 * @param {object} config - { type: 'group' | 'status', value: string (group name or status ID) }
 * @param {Array} statusGroups - The user-defined status groups [{ name, statuses: [id] }]
 * @param {Map} statusesMap - Map of all status IDs to their names { statusId -> statusName }
 * @returns {Set<string>} - A Set containing the relevant status IDs. Empty if config is invalid.
 */
function getStatusIdsFromConfig(config, statusGroups, statusesMap) {
    const ids = new Set();
    if (!config || !config.value) {
        // console.warn('[getStatusIdsFromConfig] Invalid or empty config provided:', config);
        return ids; // Return empty set for invalid config
    }

    if (config.type === 'group') {
        const group = statusGroups.find(g => g.name === config.value);
        if (group && Array.isArray(group.statuses)) {
            group.statuses.forEach(id => {
                if (statusesMap.has(String(id))) { // Verify status ID exists
                   ids.add(String(id));
                }
            });
        } else {
             console.warn(`[getStatusIdsFromConfig] Configured group '${config.value}' not found or invalid.`);
        }
    } else if (config.type === 'status') {
        const statusId = String(config.value);
        if (statusesMap.has(statusId)) { // Verify status ID exists
            ids.add(statusId);
        } else {
             console.warn(`[getStatusIdsFromConfig] Configured status ID '${statusId}' not found in metadata.`);
        }
    } else {
        console.warn(`[getStatusIdsFromConfig] Unknown config type: '${config.type}'`);
    }

    // console.debug(`[getStatusIdsFromConfig] Resolved config`, config, `to IDs:`, ids);
    return ids;
}


// --- Main Processing Function ---
/**
 * Main function to calculate all metrics.
 * @param {object} cycleStartConfig - { type: 'group'|'status', value: string }
 * @param {object} cycleEndConfig - { type: 'group'|'status', value: string }
 * @param {object} triageConfig - { type: 'group'|'status', value: string }
 * @param {Array} allStatuses - Array of {id, name} from metadata.statuses
 */
export function processMetrics(
  issues,
  statusGroups,
  startDate,
  endDate,
  cycleStartConfig, // UPDATED: Now object
  cycleEndConfig,   // UPDATED: Now object
  triageConfig,     // UPDATED: Now object
  allStatuses       // NEW: Pass all statuses from metadata
) {
  console.log( '[processMetrics] Running with issues:', issues?.length, '| groups:', statusGroups?.length,
    '| triage:', triageConfig?.value, '| start:', cycleStartConfig?.value, '| end:', cycleEndConfig?.value );

  // --- Input Validation ---
  if (!Array.isArray(issues) || issues.length === 0) { /* ... */ return null; }
  if (!Array.isArray(statusGroups)) { /* ... */ return null; } // Allow empty statusGroups initially
  if (!Array.isArray(allStatuses) || allStatuses.length === 0) {
      console.warn('[processMetrics] Missing or empty allStatuses array from metadata.');
      return null; // Cannot proceed without status definitions
  }
   if (!triageConfig?.value || !cycleStartConfig?.value || !cycleEndConfig?.value) {
      console.warn('[processMetrics] Missing Triage, Cycle Start, or Cycle End config value.');
      // Proceeding, but results might be incomplete/zero.
  }

  // --- 1. Create Lookup Maps ---
  const statusToGroupMap = new Map(); // statusId -> groupName
  const statusMasterMap = new Map(); // statusId -> { name }
  allStatuses.forEach(s => {
      if(s && s.id != null) statusMasterMap.set(String(s.id), { name: s.name || `Status ${s.id}` });
  });

  const groupOrder = [];
  const initialGroupCounters = new Map(); // For TimeInStatus/Distribution aggregation

  statusGroups.forEach((group) => {
    if (group?.name && Array.isArray(group.statuses)) {
      if (!groupOrder.includes(group.name)) groupOrder.push(group.name);
      initialGroupCounters.set(group.name, 0); // Initialize counters
      group.statuses.forEach((statusId) => {
        if (statusId != null && statusMasterMap.has(String(statusId))) { // Check status exists
          statusToGroupMap.set(String(statusId), group.name);
        }
      });
    }
  });
  // Add an 'Ungrouped' category if needed? Or rely on status-level data. Let's rely on status-level.

  // --- 2. Build Timelines (using status IDs directly) ---
  console.time('[processMetrics] Build All Timelines');
  const allIssueTimelines = issues
    .map((issue) => buildIssueTimelineByStatus(issue, statusMasterMap)) // Build timeline with STATUS IDs
    .filter(Boolean);
  console.timeEnd('[processMetrics] Build All Timelines');
   if(allIssueTimelines.length !== issues.length) { /* ... warning ... */ }


  // --- 3. Calculate Metrics ---
  console.time('[processMetrics] Calculate All Metrics');

  // --- Refactored: Calculate detailed status-level first, then aggregate ---
  const timeInStatusResult = calculateTimeInStatusDetailed(allIssueTimelines, statusMasterMap, statusToGroupMap, initialGroupCounters);
  const distributionResult = calculateDistributionDetailed(issues, statusMasterMap, statusToGroupMap, initialGroupCounters);
  // --- End Refactor ---

  // --- Updated: Pass config objects and maps ---
  const cycleTimeData = processCycleTime(
    allIssueTimelines,
    cycleStartConfig,
    cycleEndConfig,
    statusGroups,
    statusMasterMap // Pass master map
  );

  const throughputData = processThroughput(
    allIssueTimelines,
    cycleEndConfig, // Use config object
    startDate,
    endDate,
    statusGroups,
    statusMasterMap // Pass master map
  );

  const cfdData = processCFD( // CFD still works best at group level
    allIssueTimelines,
    groupOrder,
    statusToGroupMap, // Need map to determine group for CFD snapshot
    startDate,
    endDate
  );

  const supportMetrics = processSupportMetrics(
    allIssueTimelines,
    triageConfig, // Use config object
    cycleEndConfig, // Use config object
    statusGroups,
    statusMasterMap // Pass master map
  );

  const summaryStats = calculateSummaryStats(
    issues, // Need raw issues for current status check
    statusMasterMap, // Use master map
    statusToGroupMap,
    cycleTimeData,
    groupOrder, // Keep group order for reference
    cycleStartConfig, // Use config object
    cycleEndConfig,   // Use config object
    supportMetrics,
    triageConfig      // Use config object
  );
  // --- End Update ---

  console.timeEnd('[processMetrics] Calculate All Metrics');

  // --- 4. Assemble Results ---
  const result = {
    distribution: distributionResult, // { byStatus, byGroup }
    timeInStatus: timeInStatusResult, // { byStatus, byGroup }
    cycleTimeData,
    throughputData,
    cfdData,
    summaryStats,
    supportMetrics,
    // Include maps needed by frontend for drilldown/display
    statusToGroupMap: Object.fromEntries(statusToGroupMap), // Convert Map to object for easier prop passing
    statusMasterMap: Object.fromEntries(statusMasterMap)    // Convert Map to object
  };

  console.log('[processMetrics] Finished processing successfully.');
  return result;
}


// --- Individual Metric Calculation Functions ---

/**
 * Builds a timeline using STATUS IDs instead of group names.
 * @param {Map} statusMasterMap - Map of { statusId -> { name } }
 * @returns {object|null} { key: string, timeline: Array<{ timestamp: Date, statusId: string }>, currentStatusId: string }
 */
function buildIssueTimelineByStatus(issue, statusMasterMap) {
  if (!issue?.fields?.created) { /* ... validation ... */ return null; }
  const timeline = [];
  let createdDate;
  try { createdDate = new Date(issue.fields.created); if (isNaN(createdDate.getTime())) throw new Error(); }
  catch (e) { /* ... warning ... */ return null; }

  const hasChangelog = issue.changelog && Array.isArray(issue.changelog.histories);
  const statusChanges = hasChangelog ? issue.changelog.histories.flatMap(/* ... extract {timestamp, fromId, toId} ... */
      (history) => {
          if (!history?.items) return [];
          return history.items
            .filter( (item) => item?.field === 'status' && item.from != null && item.fromString != null )
            .map((item) => {
               let changeTimestamp;
               try { changeTimestamp = new Date(history.created); if (isNaN(changeTimestamp.getTime())) throw new Error(); }
               catch(e) { /* ... warning ... */ return null; }
              return { timestamp: changeTimestamp, fromId: String(item.from), toId: String(item.to) };
            })
            .filter(Boolean);
        }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) : [];

  let createdStatusId = null;
  if (statusChanges.length > 0) createdStatusId = statusChanges[0].fromId;
  else if (issue.fields.status?.id) createdStatusId = String(issue.fields.status.id);

  if (!createdStatusId || !statusMasterMap.has(createdStatusId)) { // Also check if status is known
    console.warn(`[buildTimelineByStatus] Could not determine a valid created status for issue: ${issue.key}`);
    return null;
  }

  // Add creation event with status ID
  timeline.push({ timestamp: createdDate, statusId: createdStatusId });

  let lastAddedStatusId = createdStatusId;
  statusChanges.forEach((change) => {
    const nextStatusId = change.toId ? String(change.toId) : null;
    // Only add if status ID changed AND it's a known status
    if (nextStatusId && statusMasterMap.has(nextStatusId) && nextStatusId !== lastAddedStatusId) {
      if (change.timestamp instanceof Date && !isNaN(change.timestamp.getTime())) {
        timeline.push({ timestamp: change.timestamp, statusId: nextStatusId });
        lastAddedStatusId = nextStatusId;
      }
    } else if (nextStatusId && !statusMasterMap.has(nextStatusId)) {
        console.warn(`[buildTimelineByStatus] Encountered unknown status ID ${nextStatusId} for issue ${issue.key}`);
    }
  });

   const currentStatusId = issue.fields.status?.id ? String(issue.fields.status.id) : null;

  return { key: issue.key, timeline, currentStatusId };
}


/** 1. Calculates distribution by STATUS and aggregates by GROUP. */
function calculateDistributionDetailed(issues, statusMasterMap, statusToGroupMap, initialGroupCounters) {
    const statusCounters = new Map(); // statusId -> { name, count }
    statusMasterMap.forEach((statusInfo, statusId) => {
        statusCounters.set(statusId, { name: statusInfo.name, count: 0 }); // Initialize all known statuses
    });

    let processedCount = 0;
    issues.forEach((issue) => {
        if (issue?.fields?.status?.id != null) {
            const currentStatusId = String(issue.fields.status.id);
            if (statusCounters.has(currentStatusId)) {
                statusCounters.get(currentStatusId).count++;
                processedCount++;
            } else {
                 console.warn(`[calculateDistributionDetailed] Issue ${issue.key} has unknown current status ID: ${currentStatusId}`);
            }
        }
    });

    const totalIssues = issues.length;
    const distributionByStatus = Array.from(statusCounters.entries())
        .map(([id, data]) => ({
            id,
            name: data.name,
            count: data.count,
            percentage: totalIssues > 0 ? (data.count / totalIssues) * 100 : 0,
        }))
        .filter(s => s.count > 0 || statusToGroupMap.has(s.id)) // Keep if count>0 or if it belongs to a group
        .sort((a,b) => (statusToGroupMap.get(a.id)||'ZZZ').localeCompare(statusToGroupMap.get(b.id)||'ZZZ') || a.name.localeCompare(b.name)); // Sort primarily by group, then name


    // Aggregate by Group
    const groupCounters = new Map(initialGroupCounters); // { groupName -> count }
    distributionByStatus.forEach(statusData => {
        const groupName = statusToGroupMap.get(statusData.id);
        if (groupName && groupCounters.has(groupName)) {
            groupCounters.set(groupName, groupCounters.get(groupName) + statusData.count);
        }
        // Implicitly ignore statuses not mapped to a group in the group aggregation
    });

    const distributionByGroup = Array.from(groupCounters.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: totalIssues > 0 ? (count / totalIssues) * 100 : 0,
    }));

    console.log(`[calculateDistributionDetailed] Counted ${processedCount} issues across ${statusCounters.size} statuses.`);
    return { byStatus: distributionByStatus, byGroup: distributionByGroup };
}

/** 2. Calculates time in STATUS and aggregates by GROUP. */
function calculateTimeInStatusDetailed(allIssueTimelines, statusMasterMap, statusToGroupMap, initialGroupCounters) {
    const timeInStatusMs = new Map(); // statusId -> { name, totalMs }
    statusMasterMap.forEach((statusInfo, statusId) => {
        timeInStatusMs.set(statusId, { name: statusInfo.name, totalMs: 0 }); // Initialize
    });

    allIssueTimelines.forEach(({ timeline }) => {
        for (let i = 0; i < timeline.length; i++) {
            const startEvent = timeline[i];
            const endTimestamp = (i + 1 < timeline.length) ? timeline[i + 1].timestamp : new Date();
            const statusId = startEvent.statusId;
            const startTimestamp = startEvent.timestamp;

            if (timeInStatusMs.has(statusId) && startTimestamp instanceof Date && !isNaN(startTimestamp.getTime())) {
                const durationMs = getDuration(startTimestamp, endTimestamp, 'ms');
                if (durationMs > 0) {
                    const current = timeInStatusMs.get(statusId);
                    current.totalMs += durationMs;
                }
            } else if (!timeInStatusMs.has(statusId)) {
                 console.warn(`[calculateTimeInStatusDetailed] Timeline statusId '${statusId}' not found in master map.`);
            }
        }
    });

    const totalIssues = allIssueTimelines.length; // Use number of processed timelines for averages
    const timeInStatusByStatus = Array.from(timeInStatusMs.entries())
        .map(([id, data]) => ({
            id,
            name: data.name,
            totalMs: data.totalMs || 0,
            totalHours: data.totalMs > 0 ? data.totalMs / (1000 * 60 * 60) : 0,
            totalDays: data.totalMs > 0 ? data.totalMs / (1000 * 60 * 60 * 24) : 0,
            // Average time spent *in this status* across *all issues* (even those that never entered it)
            avgHours: totalIssues > 0 && data.totalMs > 0 ? (data.totalMs / (1000 * 60 * 60)) / totalIssues : 0,
            avgDays: totalIssues > 0 && data.totalMs > 0 ? (data.totalMs / (1000 * 60 * 60 * 24)) / totalIssues : 0,
        }))
        .filter(s => s.totalMs > 0 || statusToGroupMap.has(s.id)) // Keep if time>0 or if it belongs to a group
        .sort((a,b) => (statusToGroupMap.get(a.id)||'ZZZ').localeCompare(statusToGroupMap.get(b.id)||'ZZZ') || a.name.localeCompare(b.name)); // Sort by group, then name


    // Aggregate by Group
    const timeInGroupMsAgg = new Map(initialGroupCounters); // { groupName -> totalMs }
    timeInStatusByStatus.forEach(statusData => {
        const groupName = statusToGroupMap.get(statusData.id);
        if (groupName && timeInGroupMsAgg.has(groupName)) {
            timeInGroupMsAgg.set(groupName, timeInGroupMsAgg.get(groupName) + statusData.totalMs);
        }
    });

    const timeInStatusByGroup = Array.from(timeInGroupMsAgg.entries()).map(([groupName, totalMs]) => ({
        groupName,
        totalMs: totalMs || 0,
        totalHours: totalMs > 0 ? totalMs / (1000 * 60 * 60) : 0,
        totalDays: totalMs > 0 ? totalMs / (1000 * 60 * 60 * 24) : 0,
        avgHours: totalIssues > 0 && totalMs > 0 ? (totalMs / (1000 * 60 * 60)) / totalIssues : 0,
        avgDays: totalIssues > 0 && totalMs > 0 ? (totalMs / (1000 * 60 * 60 * 24)) / totalIssues : 0,
    }));

    return { byStatus: timeInStatusByStatus, byGroup: timeInStatusByGroup };
}


/** 3. Calculates Cycle Time based on config objects. */
function processCycleTime(allIssueTimelines, cycleStartConfig, cycleEndConfig, statusGroups, statusMasterMap) {
  const defaultResult = { durations: [], histogram: [], avg: 0, p50: 0, p85: 0 };
  // --- UPDATED: Use helper to get sets of IDs ---
  const startStatusIds = getStatusIdsFromConfig(cycleStartConfig, statusGroups, statusMasterMap);
  const endStatusIds = getStatusIdsFromConfig(cycleEndConfig, statusGroups, statusMasterMap);
  // --- End Update ---

  if (startStatusIds.size === 0 || endStatusIds.size === 0) {
    console.warn('[processCycleTime] Could not resolve start or end statuses from config.');
    return defaultResult;
  }

  const durationsDays = [];
  allIssueTimelines.forEach(({ timeline }) => {
    // --- UPDATED: Find first event matching ANY start ID ---
    const startEvent = timeline.find(e => startStatusIds.has(e.statusId));
    // --- UPDATED: Find first event matching ANY end ID *after* start ---
    const endEvent = timeline.find(e => endStatusIds.has(e.statusId) && startEvent && e.timestamp.getTime() >= startEvent.timestamp.getTime());
    // --- End Update ---

    if (startEvent && endEvent) {
      const duration = getDuration(startEvent.timestamp, endEvent.timestamp, 'days');
      if (duration >= 0) durationsDays.push(duration);
    }
  });

  if (durationsDays.length === 0) { /* ... no completions message ... */ return defaultResult; }

  durationsDays.sort((a, b) => a - b);
  // ... (Histogram and stats calculation remains the same) ...
    let bucketSize = 1;
    const maxDuration = Math.max(...durationsDays);
    if (maxDuration > 100) bucketSize = 10; else if (maxDuration > 20) bucketSize = 2; else if (maxDuration > 10) bucketSize = 1; else if (maxDuration > 1) bucketSize = 0.5; else bucketSize = 0.1;
    const buckets = new Map();
    durationsDays.forEach(duration => { /* ... bucket logic ... */
        const bucketStart = Math.floor(duration / bucketSize) * bucketSize;
        const bucketEnd = bucketStart + bucketSize;
        const rangeFormat = (num) => (num % 1 === 0 ? num.toString() : num.toFixed(1));
        const bucketName = `${rangeFormat(bucketStart)}-${rangeFormat(bucketEnd)} days`;
        buckets.set(bucketName, (buckets.get(bucketName) || 0) + 1);
     });
    const histogram = Array.from(buckets.entries()).map(([range, count]) => ({ range, count })).sort((a, b) => parseFloat(a.range.split('-')[0]) - parseFloat(b.range.split('-')[0]));
    const avg = durationsDays.reduce((a, b) => a + b, 0) / durationsDays.length;
    const p50 = getPercentile(durationsDays, 50);
    const p85 = getPercentile(durationsDays, 85);

  console.log(`[processCycleTime] Calculated cycle time for ${durationsDays.length} issues. Avg: ${avg.toFixed(2)}d`);
  return { durations: durationsDays, histogram, avg, p50, p85 };
}

/** 4. Calculates Throughput based on config objects. */
function processThroughput(allIssueTimelines, cycleEndConfig, startDateStr, endDateStr, statusGroups, statusMasterMap) {
  // --- UPDATED: Use helper ---
  const endStatusIds = getStatusIdsFromConfig(cycleEndConfig, statusGroups, statusMasterMap);
  // --- End Update ---

  if (endStatusIds.size === 0 || !startDateStr || !endDateStr) {
    console.warn('[processThroughput] Missing end status config or date range.');
    return [];
  }

  const completionTimestamps = [];
  allIssueTimelines.forEach(({ timeline }) => {
    // --- UPDATED: Find first event matching ANY end ID ---
    const endEvent = timeline.find(e => endStatusIds.has(e.statusId));
    // --- End Update ---
    if (endEvent?.timestamp instanceof Date && !isNaN(endEvent.timestamp.getTime())) {
        completionTimestamps.push(endEvent.timestamp);
    }
  });

  // ... (Grouping by day remains the same) ...
    const throughputMap = new Map();
    const dateRange = getDateRange(startDateStr, endDateStr);
    if(dateRange.length === 0) return [];
    dateRange.forEach(day => throughputMap.set(day, 0));
    completionTimestamps.forEach(date => {
        const day = date.toISOString().split('T')[0];
        if (throughputMap.has(day)) {
            throughputMap.set(day, throughputMap.get(day) + 1);
        }
    });
    console.log(`[processThroughput] Found ${completionTimestamps.length} completions overall.`);
    return Array.from(throughputMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => new Date(a.date) - new Date(b.date));
}


/** 5. Generates data for CFD (still based on groups). */
function processCFD(allIssueTimelines, groupOrder, statusToGroupMap, startDateStr, endDateStr) {
  // This logic remains the same, using statusToGroupMap to find the group for each status ID.
  if (!startDateStr || !endDateStr) { /* ... validation ... */ return []; }
  const cfdData = [];
  const dateRange = getDateRange(startDateStr, endDateStr);
  if(dateRange.length === 0) return [];

  console.log(`[processCFD] Generating CFD for ${dateRange.length} days.`);
  dateRange.forEach(dayStr => {
    const snapshotTimestamp = new Date(dayStr + 'T23:59:59.999Z');
    if (isNaN(snapshotTimestamp.getTime())) { /* ... validation ... */ return; }

    const snapshot = { date: dayStr };
    groupOrder.forEach(group => (snapshot[group] = 0)); // Initialize group counts

    allIssueTimelines.forEach(({ timeline }) => {
      let statusIdOnDate = null;
      for (let i = timeline.length - 1; i >= 0; i--) { // Find status ID on date
        if (timeline[i].timestamp.getTime() <= snapshotTimestamp.getTime()) {
          statusIdOnDate = timeline[i].statusId;
          break;
        }
      }
      if (statusIdOnDate) {
          const groupName = statusToGroupMap.get(statusIdOnDate); // Map status to group
          if (groupName && snapshot.hasOwnProperty(groupName)) {
            snapshot[groupName]++; // Increment the group count
          }
      }
    });
    cfdData.push(snapshot);
  });
  return cfdData;
}

/** 6. Calculates summary stats, including updated WIP based on config objects. */
function calculateSummaryStats(
  issues,
  statusMasterMap, // Use master map
  statusToGroupMap,
  cycleTimeData,
  groupOrder,
  cycleStartConfig, // UPDATED: Config object
  cycleEndConfig,   // UPDATED: Config object
  supportMetrics,
  triageConfig      // UPDATED: Config object
) {
  // --- UPDATED: Resolve config objects to sets of IDs ---
  const startStatusIds = getStatusIdsFromConfig(cycleStartConfig, [], statusMasterMap); // statusGroups not needed here
  const endStatusIds = getStatusIdsFromConfig(cycleEndConfig, [], statusMasterMap);
  const triageStatusIds = getStatusIdsFromConfig(triageConfig, [], statusMasterMap);
  // --- End Update ---

  // --- UPDATED WIP Logic: Exclude Triage, Start, End STATUSES ---
  const wipStatusIds = new Set();
  statusMasterMap.forEach((_statusInfo, statusId) => {
      if (!startStatusIds.has(statusId) && !endStatusIds.has(statusId) && !triageStatusIds.has(statusId)) {
          wipStatusIds.add(statusId);
      }
  });
  // Debug log: Map IDs back to names for clarity
  // console.log('[calculateSummaryStats] WIP Status IDs identified:', Array.from(wipStatusIds).map(id => statusMasterMap.get(id)?.name || id));

  let currentWIP = 0;
  issues.forEach((issue) => {
    if (issue?.fields?.status?.id != null) {
      const currentStatusId = String(issue.fields.status.id);
      // --- UPDATED: Check against the set of WIP status IDs ---
      if (wipStatusIds.has(currentStatusId)) {
        currentWIP++;
      }
      // --- End Update ---
    }
  });
  console.log(`[calculateSummaryStats] Calculated Current WIP: ${currentWIP}`);

  // ... (Return object remains the same structure) ...
  return {
    totalIssues: issues.length,
    avgCycleTime: cycleTimeData.avg || 0,
    p85CycleTime: cycleTimeData.p85 || 0,
    p50CycleTime: cycleTimeData.p50 || 0,
    currentWIP: currentWIP,
    avgMttaHours: supportMetrics.avgMttaHours || 0,
    avgMttrHours: supportMetrics.avgMttrHours || 0,
  };
}


/** 7. Calculates support metrics based on config objects. */
function processSupportMetrics(allIssueTimelines, triageConfig, cycleEndConfig, statusGroups, statusMasterMap) {
  const mttaDurationsHours = [];
  const mttrDurationsHours = [];

  // --- UPDATED: Resolve configs ---
  const triageStatusIds = getStatusIdsFromConfig(triageConfig, statusGroups, statusMasterMap);
  const endStatusIds = getStatusIdsFromConfig(cycleEndConfig, statusGroups, statusMasterMap);
  // --- End Update ---

  if (triageStatusIds.size === 0 || endStatusIds.size === 0) {
    console.warn('[processSupportMetrics] Could not resolve Triage or End statuses from config.');
    return { avgMttaHours: 0, avgMttrHours: 0 };
  }

  allIssueTimelines.forEach(({ timeline }) => {
    if (!timeline || timeline.length === 0) return;
    const createdEvent = timeline[0];
    const createdTime = createdEvent.timestamp;

    // --- MTTA: Find first event NOT in a triage status ---
    const ackEvent = timeline.find((event, index) => index > 0 && !triageStatusIds.has(event.statusId));
    if (ackEvent) {
        const duration = getDuration(createdTime, ackEvent.timestamp, 'hours');
        if (duration >= 0) mttaDurationsHours.push(duration);
    }

    // --- MTTR: Find first event IN an end status ---
    const resolveEvent = timeline.find((event) => endStatusIds.has(event.statusId));
    if (resolveEvent) {
        const duration = getDuration(createdTime, resolveEvent.timestamp, 'hours');
         if (duration >= 0) mttrDurationsHours.push(duration);
    }
  });

  // ... (Average calculation remains the same) ...
  const avgMttaHours = mttaDurationsHours.length > 0 ? mttaDurationsHours.reduce((a, b) => a + b, 0) / mttaDurationsHours.length : 0;
  const avgMttrHours = mttrDurationsHours.length > 0 ? mttrDurationsHours.reduce((a, b) => a + b, 0) / mttrDurationsHours.length : 0;
  console.log(`[processSupportMetrics] Calculated MTTA for ${mttaDurationsHours.length} issues. Avg: ${avgMttaHours.toFixed(2)}h`);
  console.log(`[processSupportMetrics] Calculated MTTR for ${mttrDurationsHours.length} issues. Avg: ${avgMttrHours.toFixed(2)}h`);
  return { avgMttaHours, avgMttrHours };
}
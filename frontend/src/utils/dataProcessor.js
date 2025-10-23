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
 * @returns {Object} - { distribution, timeInStatusTable }
 */
export function processMetrics(issues, statusGroups) {
  if (!issues || issues.length === 0 || !statusGroups || statusGroups.length === 0) {
    return null;
  }

  // --- 1. Create Lookup Maps ---
  // Create a map for { statusId -> 'GroupName' }
  const statusToGroupMap = new Map();
  // Create a map for { 'GroupName' -> 0 } to initialize counters
  const groupTimeCounters = new Map();
  const groupIssueCounters = new Map();

  statusGroups.forEach((group) => {
    group.statuses.forEach((statusId) => {
      statusToGroupMap.set(statusId, group.name);
    });
    groupTimeCounters.set(group.name, 0);
    groupIssueCounters.set(group.name, 0);
  });

  // --- 2. Calculate Status Distribution (Current Status) ---
  issues.forEach((issue) => {
    const currentStatusId = issue.fields.status.id;
    const groupName = statusToGroupMap.get(currentStatusId);
    if (groupName) {
      groupIssueCounters.set(groupName, groupIssueCounters.get(groupName) + 1);
    }
  });

  const totalIssues = issues.length;
  const distribution = Array.from(groupIssueCounters.entries()).map(
    ([name, count]) => ({
      name,
      count,
      percentage: (count / totalIssues) * 100,
    }),
  );

  // --- 3. Calculate Time In Status ---
  const timeInGroupMs = calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters);

  // --- 4. Format Final Table Data ---
  const timeInStatusTable = Array.from(timeInGroupMs.entries()).map(
    ([groupName, ms]) => ({
      groupName,
      totalMs: ms,
      totalHours: ms / (1000 * 60 * 60),
      totalDays: ms / (1000 * 60 * 60 * 24),
    }),
  );

  return { distribution, timeInStatusTable };
}

/**
 * Calculates the total time spent in each status *group*.
 * @param {Array} issues - Raw issues.
 * @param {Map} statusToGroupMap - { statusId -> 'GroupName' }
 * @param {Map} groupTimeCounters - { 'GroupName' -> 0 }
 * @returns {Map} - { 'GroupName' -> totalMs }
 */
function calculateTimeInStatus(issues, statusToGroupMap, groupTimeCounters) {
  const timeInGroup = new Map(groupTimeCounters); // Clone the initialized map

  for (const issue of issues) {
    // 1. Get all *status* changes from the changelog
    const statusChanges = issue.changelog.histories
      .flatMap((history) =>
        history.items
          .filter((item) => item.field === 'status')
          .map((item) => ({
            timestamp: new Date(history.created),
            fromId: item.from,
            toId: item.to,
          })),
      )
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by date, ascending

    // 2. Build a complete issue timeline
    const timeline = [];

    // Add the "Creation" event as the first entry
    // We find the *first* status from the first changelog item.
    // If no changelog, we sadly can't process time.
    const firstChange = statusChanges[0];
    const createdStatusId = firstChange ? firstChange.fromId : null;

    // Only process if we have a valid creation status
    if (createdStatusId) {
      timeline.push({
        timestamp: new Date(issue.fields.created),
        statusId: createdStatusId,
      });

      // Add all subsequent changes
      statusChanges.forEach((change) => {
        timeline.push({
          timestamp: change.timestamp,
          statusId: change.toId,
        });
      });

      // 3. Iterate the timeline and sum durations by *group*
      for (let i = 0; i < timeline.length; i++) {
        const startEvent = timeline[i];
        const endEvent = timeline[i + 1] || { timestamp: new Date() }; // Use "now" as the end for the *last* status

        const groupName = statusToGroupMap.get(startEvent.statusId);

        // If the status belongs to a group we care about
        if (groupName) {
          const durationMs =
            endEvent.timestamp.getTime() - startEvent.timestamp.getTime();

          if (durationMs > 0) {
            timeInGroup.set(
              groupName,
              timeInGroup.get(groupName) + durationMs,
            );
          }
        }
      }
    }
  }
  return timeInGroup;
}

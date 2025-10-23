/*
 * JiraMetricsDashboard - Backend Server
 * This file contains the Express.js server that acts as a proxy
 * to the Jira Cloud REST API, handling authentication and paginated
 * data fetching.
 */

// Use ES module imports
// We need 'path' and 'dotenv' to explicitly load the .env file from the root
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import axios from 'axios';
import cors from 'cors';

// --- Environment Setup ---
// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the ROOT directory (one level up from /backend)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Load critical environment variables
const { JIRA_API_URL_BASE, JIRA_SESSION_TOKEN, JIRA_MAX_RESULTS } = process.env;

if (!JIRA_API_URL_BASE || !JIRA_SESSION_TOKEN) {
  console.error(
    'FATAL ERROR: JIRA_API_URL_BASE and JIRA_SESSION_TOKEN must be set in .env'
  );
  process.exit(1);
}

// Max results per paginated call
const MAX_RESULTS = parseInt(JIRA_MAX_RESULTS || '50', 10);

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies

// --- Axios Client Setup ---
// Create a reusable Axios instance configured for Jira auth
const jiraApi = axios.create({
  baseURL: JIRA_API_URL_BASE,
  headers: {
    'Content-Type': 'application/json',
    // CRITICAL: Construct the Cookie header for authentication.
    // This uses the session token provided in the .env file.
    'Cookie': `tenant.session.token=${JIRA_SESSION_TOKEN}`,
  },
});

// --- API Endpoints ---

/**
 * Endpoint 1: Fetch Filter Options (Metadata)
 * Gets all issue types, priorities, labels, and statuses for a project.
 */
app.get('/api/jira/metadata', async (req, res) => {
  const { projectKey } = req.query;

  console.log(`[INFO] /api/jira/metadata: Received request for project: ${projectKey || 'NONE'}`);

  if (!projectKey) {
    console.warn('[WARN] /api/jira/metadata: Request failed (400) - projectKey query param is required');
    return res.status(400).json({ error: 'projectKey query param is required' });
  }

  try {
    // --- FIX: Use project details endpoint for issue types ---
    // This endpoint accepts a projectKey (like "APPS") and returns issue types
    const projectDetailsUrl = `/rest/api/3/project/${projectKey}`;
    const prioritiesUrl = '/rest/api/3/priority';
    const labelsUrl = '/rest/api/3/label';
    const statusesUrl = `/rest/api/3/project/${projectKey}/statuses`;

    // --- DEBUG LOG: Log all URLs being called ---
    console.log(`[DEBUG] /api/jira/metadata: Fetching URLs for project ${projectKey}:`);
    console.log(`[DEBUG]   - ${projectDetailsUrl}`);
    console.log(`[DEBUG]   - ${prioritiesUrl}`);
    console.log(`[DEBUG]   - ${labelsUrl}`);
    console.log(`[DEBUG]   - ${statusesUrl}`);
    
    // --- FIX: Use Promise.allSettled to debug individual call failures ---
    const results = await Promise.allSettled([
      jiraApi.get(projectDetailsUrl),
      jiraApi.get(prioritiesUrl),
      jiraApi.get(labelsUrl),
      jiraApi.get(statusesUrl),
    ]);

    // --- DEBUG LOG & Error Handling: Check all settled results ---
    const [
      projectDetailsResult,
      prioritiesResult,
      labelsResult,
      statusesResult,
    ] = results;

    // Helper array to log all errors before throwing
    const errors = [];

    if (projectDetailsResult.status === 'rejected') {
      const errorMsg = projectDetailsResult.reason.response?.data || projectDetailsResult.reason.message;
      console.error(`[ERROR] /api/jira/metadata: Failed to fetch project details:`, errorMsg);
      errors.push(`Failed to fetch project details: ${JSON.stringify(errorMsg)}`);
    }
    if (prioritiesResult.status === 'rejected') {
      const errorMsg = prioritiesResult.reason.response?.data || prioritiesResult.reason.message;
      console.error(`[ERROR] /api/jira/metadata: Failed to fetch priorities:`, errorMsg);
      errors.push(`Failed to fetch priorities: ${JSON.stringify(errorMsg)}`);
    }
    if (labelsResult.status === 'rejected') {
      const errorMsg = labelsResult.reason.response?.data || labelsResult.reason.message;
      console.error(`[ERROR] /api/jira/metadata: Failed to fetch labels:`, errorMsg);
      errors.push(`Failed to fetch labels: ${JSON.stringify(errorMsg)}`);
    }
    if (statusesResult.status === 'rejected') {
      const errorMsg = statusesResult.reason.response?.data || statusesResult.reason.message;
      console.error(`[ERROR] /api/jira/metadata: Failed to fetch statuses:`, errorMsg);
      errors.push(`Failed to fetch statuses: ${JSON.stringify(errorMsg)}`);
    }

    // If any promise failed, throw a consolidated error to be caught below
    if (errors.length > 0) {
      throw new Error(`Failed to fetch metadata: ${errors.join(', ')}`);
    }

    // Extract successful values (we now know they are all 'fulfilled')
    const projectDetailsResponse = projectDetailsResult.value;
    const prioritiesResponse = prioritiesResult.value;
    const labelsResponse = labelsResult.value;
    const statusesResponse = statusesResult.value;

    // Format statuses: The API returns a nested structure for statuses
    // We simplify it to match the other metadata formats
    const formattedStatuses = statusesResponse.data.flatMap((issueType) =>
      issueType.statuses.map((status) => ({
        id: status.id,
        name: status.name,
      }))
    );
    // De-duplicate statuses that appear in multiple issue type workflows
    const uniqueStatuses = Array.from(
      new Map(formattedStatuses.map((s) => [s.id, s])).values()
    );

    // Send the consolidated metadata to the frontend
    res.json({
      // --- FIX: Get issueTypes from the correct response object property ---
      issueTypes: projectDetailsResponse.data.issueTypes,
      priorities: prioritiesResponse.data,
      labels: labelsResponse.data.values, // Labels are under a 'values' key
      statuses: uniqueStatuses.sort((a, b) => a.name.localeCompare(b.name)), // Sort alphabetically
    });
    console.log(`[INFO] /api/jira/metadata: Successfully sent metadata for project: ${projectKey}`);
  } catch (error) {
    // This will now catch the consolidated error from our 'allSettled' checks
    console.error(`[ERROR] /api/jira/metadata: Failed to fetch metadata for project: ${projectKey}`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Failed to fetch Jira metadata' }
    );
  }
});

/**
 * Endpoint 2: Fetch Filtered Tickets (with Pagination)
 * Performs a JQL search and iterates through all pages to return
 * a complete list of issues with their changelogs.
 */
app.post('/api/jira/tickets', async (req, res) => {
  const { projectKey, jqlFilter } = req.body;

  console.log(`[INFO] /api/jira/tickets: Received request for project: ${projectKey || 'NONE'}`);

  if (!projectKey) {
    console.warn('[WARN] /api/jira/tickets: Request failed (400) - projectKey is required');
    return res.status(400).json({ error: 'projectKey is required' });
  }

  // Combine the base project JQL with the user's filter
  const finalJql = `project = "${projectKey}" ${
    jqlFilter ? `AND ${jqlFilter}` : ''
  } ORDER BY created DESC`;

  let allIssues = [];
  let startAt = 0;
  let totalIssues = 0;
  let isLastPage = false;

  console.log(`[INFO] /api/jira/tickets: Executing JQL: ${finalJql}`);

  try {
    // --- Pagination Loop ---
    // We must loop until we have fetched all available issues
    while (!isLastPage) {
      // --- FIX: Use /search/jql AND format payload correctly ---
      // Per user feedback, this endpoint is required.
      // We will pass pagination/fields as URL query params
      // and send *only* the JQL in the POST body.
      
      const fieldsToRequest = [
        'summary',
        'status',
        'issuetype',
        'priority',
        'created',
        'resolutiondate',
        'labels',
      ];

      // 1. Construct URL with Query Parameters
      const searchParams = new URLSearchParams({
        startAt: startAt,
        maxResults: MAX_RESULTS,
        expand: 'changelog', // 'expand' is a string
        fields: fieldsToRequest.join(','), // 'fields' is a comma-separated string
      });

      const searchUrl = `/rest/api/3/search/jql?${searchParams.toString()}`;

      // 2. Construct the simplified POST Body
      const payload = {
        jql: finalJql,
      };

      // --- DEBUG LOG: Log the exact URL and payload ---
      console.log(`[DEBUG] /api/jira/tickets: Calling POST ${searchUrl}`);
      console.log(`[DEBUG] /api/jira/tickets: Payload: ${JSON.stringify(payload)}`);

      const response = await jiraApi.post(searchUrl, payload);

      // --- FIX: Destructure only 'issues' from response ---
      // The /search/jql endpoint response does not include the pagination
      // metadata (total, startAt, maxResults) in its body.
      const { issues } = response.data;

      if (issues && issues.length > 0) {
        allIssues = allIssues.concat(issues);
      }

      // --- FIX: Update pagination logic for /search/jql ---
      // We no longer have a 'total' or 'currentStartAt' from the response.
      // We must detect the last page by checking if the number of
      // issues returned is less than the maxResults we *sent*.
      
      // We can remove 'totalIssues' or just track our own count.
      totalIssues = allIssues.length;

      // Log progress (we remove the " / undefined" part)
      console.log(`[INFO] /api/jira/tickets: Fetched page. Total issues now: ${allIssues.length}`);

      // Check if this was the last page
      if (!issues || issues.length < MAX_RESULTS) {
        isLastPage = true;
      } else {
        // Set the starting point for the next loop
        // We use our local MAX_RESULTS constant, not one from the response.
        startAt += MAX_RESULTS;
      }
    }

    console.log(`[INFO] /api/jira/tickets: Fetch complete. Returning ${allIssues.length} issues for project: ${projectKey}`);
    // Send the complete, consolidated list of issues
    res.json({
      issues: allIssues,
      total: allIssues.length,
    });
  } catch (error) { 
    console.error(`[ERROR] /api/jira/tickets: Failed to fetch tickets for project: ${projectKey}`, error.response?.data || error.message);
    // Pass the specific Jira error back to the frontend
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Failed to fetch Jira tickets' }
    );
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`[INFO] JiraMetricsDashboard Backend listening on http://localhost:${PORT}`);
});
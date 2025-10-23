/*
 * JiraMetricsDashboard - Backend Server
 * This file contains the Express.js server that acts as a proxy
 * to the Jira Cloud REST API, handling authentication and paginated
 * data fetching, using the recommended search/jql endpoint followed by
 * individual issue GET requests for full details.
 */

// Use ES module imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import axios from 'axios';
import cors from 'cors';

// --- Environment Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// --- Load Environment Variables ---
const { JIRA_API_URL_BASE, JIRA_SESSION_TOKEN, JIRA_MAX_RESULTS } = process.env;

if (!JIRA_API_URL_BASE || !JIRA_SESSION_TOKEN) {
  console.error(
    '[FATAL ERROR] JIRA_API_URL_BASE and JIRA_SESSION_TOKEN must be set in .env'
  );
  process.exit(1);
}
const MAX_RESULTS = parseInt(JIRA_MAX_RESULTS || '50', 10); // Max results per SEARCH page

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Axios Client ---
const jiraApi = axios.create({
  baseURL: JIRA_API_URL_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `tenant.session.token=${JIRA_SESSION_TOKEN}`,
  },
   // Add a timeout for individual issue requests as well
   timeout: 20000, // 20 seconds timeout for API calls
});

// --- Metadata Endpoint ---
app.get('/api/jira/metadata', async (req, res) => {
  const { projectKey } = req.query;
  console.log(`[INFO] /api/jira/metadata: Received request for project: ${projectKey || 'NONE'}`);

  if (!projectKey) {
    console.warn('[WARN] /api/jira/metadata: Request failed (400) - projectKey query param is required');
    return res.status(400).json({ error: 'projectKey query param is required' });
  }

  try {
    const projectDetailsUrl = `/rest/api/3/project/${projectKey}`;
    const prioritiesUrl = '/rest/api/3/priority';
    const labelsUrl = '/rest/api/3/label';
    const statusesUrl = `/rest/api/3/project/${projectKey}/statuses`;

    console.log(`[DEBUG] /api/jira/metadata: Fetching URLs for project ${projectKey}:`, { projectDetailsUrl, prioritiesUrl, labelsUrl, statusesUrl });

    const results = await Promise.allSettled([
      jiraApi.get(projectDetailsUrl),
      jiraApi.get(prioritiesUrl),
      jiraApi.get(labelsUrl),
      jiraApi.get(statusesUrl),
    ]);

    const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.response?.data || result.reason.message);

    if (errors.length > 0) {
        console.error(`[ERROR] /api/jira/metadata: Failed to fetch metadata parts:`, errors);
        return res.status(502).json({
            error: `Failed to fetch partial or full metadata from Jira: ${errors.map(e => JSON.stringify(e)).join('; ')}`
        });
    }

    // Extract successful values (guaranteed fulfilled if no errors thrown)
    const [projectDetailsResult, prioritiesResult, labelsResult, statusesResult] = results;
    const projectDetailsResponse = projectDetailsResult.value;
    const prioritiesResponse = prioritiesResult.value;
    const labelsResponse = labelsResult.value;
    const statusesResponse = statusesResult.value;

    // Safely format statuses
    const formattedStatuses = (statusesResponse.data || []) // Handle case where data might be missing
        .flatMap((issueType) =>
            (issueType.statuses || []).map((status) => ({
                id: status.id,
                name: status.name,
            }))
        );
    const uniqueStatuses = Array.from(new Map(formattedStatuses.map((s) => [s.id, s])).values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({
      issueTypes: projectDetailsResponse.data?.issueTypes || [],
      priorities: prioritiesResponse.data || [],
      labels: labelsResponse.data?.values || [],
      statuses: uniqueStatuses,
    });
    console.log(`[INFO] /api/jira/metadata: Successfully sent metadata for project: ${projectKey}`);
  } catch (error) {
    console.error(`[ERROR] /api/jira/metadata: Unhandled error fetching metadata for project: ${projectKey}`, error.message);
    res.status(500).json({ error: 'An internal server error occurred while fetching Jira metadata.' });
  }
});

// --- Ticket Search Endpoint (Two-Step Fetch) ---
app.post('/api/jira/tickets', async (req, res) => {
  const { projectKey, jqlFilter } = req.body;
  console.log(`[INFO] /api/jira/tickets: Received request for project: ${projectKey || 'NONE'}`);

  if (!projectKey) {
    console.warn('[WARN] /api/jira/tickets: Request failed (400) - projectKey is required');
    return res.status(400).json({ error: 'projectKey is required' });
  }

  const finalJql = `project = "${projectKey}" ${jqlFilter ? `AND ${jqlFilter}` : ''} ORDER BY created DESC`;
  console.log(`[INFO] /api/jira/tickets: Executing JQL: ${finalJql}`);

  let allIssueDetails = []; // Store the full issue details here
  let issueReferences = []; // Store basic issue refs (id/key) from search
  let startAt = 0;
  let isLastSearchPage = false;

  try {
    // --- STEP 1: Paginate through search results to get Issue IDs/Keys ---
    console.log(`[INFO] /api/jira/tickets: Starting Step 1 - Fetching issue references...`);
    while (!isLastSearchPage) {
      const searchUrlBase = '/rest/api/3/search/jql';
      // Only include pagination params in query for the search
      const searchParams = new URLSearchParams({
        startAt: startAt.toString(),
        maxResults: MAX_RESULTS.toString(),
         // We can request 'key' here if needed, but 'id' is usually sufficient
         fields: 'id,key', // Request only id and key in the search
      });
      const searchUrl = `${searchUrlBase}?${searchParams.toString()}`;
      const payload = { jql: finalJql };

      console.log(`[DEBUG] /api/jira/tickets: Step 1 - Calling POST ${searchUrl}`);
      // console.log(`[DEBUG] /api/jira/tickets: Step 1 - Payload: ${JSON.stringify(payload)}`); // Keep payload log minimal

      const response = await jiraApi.post(searchUrl, payload);
      const issues = response.data?.issues || []; // Get the basic issue references

      if (!Array.isArray(response.data?.issues)) {
          console.warn(`[WARN] /api/jira/tickets: Step 1 - Response data did not contain an 'issues' array. Stopping search pagination. Response:`, response.data);
          isLastSearchPage = true; // Stop if structure is wrong
      } else {
        if (issues.length > 0) {
          issueReferences = issueReferences.concat(issues);
          console.log(`[INFO] /api/jira/tickets: Step 1 - Fetched page. Total issue refs now: ${issueReferences.length}`);
        } else {
          console.log(`[INFO] /api/jira/tickets: Step 1 - Fetched page with 0 issue refs.`);
        }

        // Pagination logic based on results count vs requested count
        if (issues.length < MAX_RESULTS) {
          isLastSearchPage = true;
        } else {
          startAt += issues.length;
        }
      }
    }
    console.log(`[INFO] /api/jira/tickets: Finished Step 1 - Found ${issueReferences.length} total issue references.`);

    // --- STEP 2: Fetch full details for each issue reference ---
    if (issueReferences.length > 0) {
      console.log(`[INFO] /api/jira/tickets: Starting Step 2 - Fetching full details for ${issueReferences.length} issues...`);
      // Use Promise.allSettled to fetch details concurrently and handle individual errors
      const issueDetailPromises = issueReferences.map(issueRef => {
        const issueIdOrKey = issueRef.key || issueRef.id; // Prefer key if available
        if (!issueIdOrKey) {
           console.warn(`[WARN] /api/jira/tickets: Step 2 - Found issue reference without id or key:`, issueRef);
           return Promise.resolve({ status: 'rejected', reason: 'Missing id/key' }); // Skip invalid refs
        }
        const issueUrl = `/rest/api/3/issue/${issueIdOrKey}?expand=changelog`;
        // console.log(`[DEBUG] /api/jira/tickets: Step 2 - Fetching: ${issueUrl}`); // Can be verbose
        return jiraApi.get(issueUrl);
      });

      // Limit concurrency slightly to avoid overwhelming the API or hitting rate limits
      // This is a basic approach; more robust libraries exist for complex scenarios.
      const concurrencyLimit = 10;
      let detailedIssuesResults = [];
      for (let i = 0; i < issueDetailPromises.length; i += concurrencyLimit) {
          const batch = issueDetailPromises.slice(i, i + concurrencyLimit);
          console.log(`[DEBUG] /api/jira/tickets: Step 2 - Fetching details batch ${i / concurrencyLimit + 1}...`);
          const batchResults = await Promise.allSettled(batch);
          detailedIssuesResults = detailedIssuesResults.concat(batchResults);
          // Optional: Add a small delay between batches if rate limiting is an issue
          // await new Promise(resolve => setTimeout(resolve, 200));
      }


      let fetchErrors = 0;
      detailedIssuesResults.forEach((result, index) => {
        const originalRef = issueReferences[index]; // Get corresponding ref for logging
        if (result.status === 'fulfilled' && result.value?.data) {
          // IMPORTANT: The GET issue endpoint returns the full structure,
          // including fields and changelog directly on the response data object.
          allIssueDetails.push(result.value.data);
        } else {
          fetchErrors++;
          console.error(`[ERROR] /api/jira/tickets: Step 2 - Failed to fetch details for issue ${originalRef?.key || originalRef?.id}:`, result.reason?.response?.data || result.reason?.message || result.reason);
        }
      });

      console.log(`[INFO] /api/jira/tickets: Finished Step 2 - Successfully fetched details for ${allIssueDetails.length} issues. Failed for ${fetchErrors} issues.`);
      if (fetchErrors > 0) {
          // Optionally inform the frontend about partial failure, though returning available data is often preferred.
          // res.status(206); // Partial Content (optional)
      }

    } else {
      console.log(`[INFO] /api/jira/tickets: Step 2 - Skipped fetching details as no issue references were found.`);
    }

    // --- Return the collected full issue details ---
    console.log(`[INFO] /api/jira/tickets: Fetch complete. Returning ${allIssueDetails.length} detailed issues for project: ${projectKey}`);
    res.json({
      issues: allIssueDetails, // Send the array containing full issue objects
      total: allIssueDetails.length, // Total is now the count of successfully fetched details
    });

  } catch (error) {
    // This catch block now handles errors primarily from Step 1 (search) or setup errors
    console.error(`[ERROR] /api/jira/tickets: Error during ticket fetching process for project ${projectKey}:`, error.response?.data || error.message);
    if (error.response) {
      console.error(`[ERROR] /api/jira/tickets: API response status: ${error.response.status}`);
      console.error(`[ERROR] /api/jira/tickets: API response data:`, error.response.data);
    } else if (error.request) {
      console.error('[ERROR] /api/jira/tickets: No response received from Jira API during search.');
    } else {
      console.error('[ERROR] /api/jira/tickets: Error setting up request:', error.message);
    }
    // Return appropriate status and error message
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Failed to fetch Jira ticket references' }
    );
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`[INFO] JiraMetricsDashboard Backend listening on http://localhost:${PORT}`);
});
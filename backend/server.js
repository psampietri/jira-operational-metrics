/*
 * JiraMetricsDashboard - Backend Server
 * Handles Jira proxying and saving/loading views to MongoDB.
 * Corrected Jira ticket fetching logic to use /search endpoint and proper pagination.
 */

// Use ES module imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import mongoose from 'mongoose';
import View from './models/View.js';

// --- Environment Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// --- Load Environment Variables ---
const { JIRA_API_URL_BASE, JIRA_SESSION_TOKEN, JIRA_MAX_RESULTS, MONGO_URI } =
  process.env;

if (!JIRA_API_URL_BASE || !JIRA_SESSION_TOKEN) { /* ... fatal error ... */ process.exit(1); }
if (!MONGO_URI) { /* ... fatal error ... */ process.exit(1); }

let MAX_RESULTS_PARSED = parseInt(JIRA_MAX_RESULTS || '50', 10);
if (isNaN(MAX_RESULTS_PARSED) || MAX_RESULTS_PARSED <= 0) {
    console.warn(`[WARN] Invalid JIRA_MAX_RESULTS. Defaulting to 50.`);
    MAX_RESULTS_PARSED = 50;
}
const MAX_RESULTS = MAX_RESULTS_PARSED;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('[INFO] MongoDB Connected Successfully.'))
  .catch((err) => { /* ... fatal error ... */ process.exit(1); });

// --- Axios Client (Jira) ---
const jiraApi = axios.create({
  baseURL: JIRA_API_URL_BASE,
  headers: {
    'Content-Type': 'application/json',
    Cookie: `tenant.session.token=${JIRA_SESSION_TOKEN}`,
  },
  timeout: 30000,
});

// --- Jira API Routes ---

// GET /api/jira/metadata
app.get('/api/jira/metadata', async (req, res) => {
  // ... (existing metadata route - unchanged) ...
  const { projectKey } = req.query;
  console.log(`[INFO] /api/jira/metadata: Request for project: ${projectKey || 'NONE'}`);
  if (!projectKey) { return res.status(400).json({ error: 'projectKey query param is required' }); }
  try {
    const projectDetailsUrl = `/rest/api/3/project/${projectKey}`;
    const prioritiesUrl = '/rest/api/3/priority';
    const statusesUrl = `/rest/api/3/project/${projectKey}/statuses`;
    console.log(`[DEBUG] /api/jira/metadata: Fetching URLs for ${projectKey}`);
    const [projectDetailsRes, prioritiesRes, statusesRes] = await Promise.all([
      jiraApi.get(projectDetailsUrl), jiraApi.get(prioritiesUrl), jiraApi.get(statusesUrl),
    ]);
    const formattedStatuses = (statusesRes.data || [])
        .flatMap(issueType => issueType.statuses || [])
        .map(status => ({ id: status.id, name: status.name }))
        .filter((value, index, self) => index === self.findIndex((s) => s.id === value.id))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json({
      issueTypes: projectDetailsRes.data?.issueTypes || [],
      priorities: prioritiesRes.data || [],
      statuses: formattedStatuses,
    });
    console.log(`[INFO] /api/jira/metadata: Success for project: ${projectKey}`);
  } catch (error) {
    console.error(`[ERROR] /api/jira/metadata: Fetch error for project ${projectKey}:`, error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: `Failed to fetch Jira metadata. ${error.response?.data?.errorMessages?.join(' ') || error.message}`});
  }
});

// POST /api/jira/tickets
app.post('/api/jira/tickets', async (req, res) => {
  const { projectKey, jqlFilter } = req.body;
  console.log(`[INFO] /api/jira/tickets: Request for project: ${projectKey || 'NONE'}`);
  if (!projectKey) { return res.status(400).json({ error: 'projectKey is required' }); }

  // Ensure projectKey is included in JQL
  const finalJql = `project = "${projectKey}" ${jqlFilter ? `AND (${jqlFilter})` : ''} ORDER BY created DESC`;
  console.log(`[INFO] /api/jira/tickets: Executing JQL: ${finalJql}`);

  let allIssueDetails = [];
  let issueReferences = [];
  let startAt = 0;
  let isLastSearchPage = false;
  const MAX_CONCURRENT_DETAILS = 10;
  let safetyBreak = 0; // Keep safety break

  try {
    // --- STEP 1: Paginate using the CORRECT /search endpoint ---
    console.log(`[INFO] /api/jira/tickets: Step 1 - Fetching issue references via /search...`);
    const searchUrl = '/rest/api/3/search'; // Use the standard search endpoint

    while (!isLastSearchPage && safetyBreak < 1000) {
        safetyBreak++;
        // --- Payload includes jql, startAt, maxResults, fields ---
        const payload = {
            jql: finalJql,
            startAt: startAt,
            maxResults: MAX_RESULTS,
            fields: ["key"] // Only need the key initially
        };

        console.log(`[DEBUG] /api/jira/tickets: Step 1.${safetyBreak} - Calling POST ${searchUrl} (startAt: ${startAt})`);
        try {
            const response = await jiraApi.post(searchUrl, payload);
            const issues = response.data?.issues || [];
            const totalFound = response.data?.total; // Get total from response

            // Validate response structure
            if (!Array.isArray(response.data?.issues) || typeof totalFound !== 'number') {
                console.warn(`[WARN] /api/jira/tickets: Step 1 - Invalid response structure from /search. Stopping.`, response.data);
                isLastSearchPage = true; // Stop if structure is wrong
            } else {
                issueReferences = issueReferences.concat(issues);
                console.log(`[INFO] /api/jira/tickets: Step 1 - Fetched page. Got ${issues.length} issues. Total refs now: ${issueReferences.length} / ${totalFound}`);

                // --- FIX: Correct Pagination Termination ---
                // Stop if startAt + fetched count >= total OR if fetched count is 0
                if ((startAt + issues.length >= totalFound) || issues.length === 0) {
                    isLastSearchPage = true;
                    console.log(`[DEBUG] /api/jira/tickets: Step 1 - Last page condition met (startAt:${startAt} + issues:${issues.length} >= total:${totalFound} or issues:0).`);
                } else {
                    startAt += issues.length; // Prepare for the next page ONLY if not last
                }
                // --- End FIX ---
            }
        } catch (searchError) {
            console.error(`[ERROR] /api/jira/tickets: Step 1 - Error during JQL search:`, searchError.response?.data || searchError.message);
            searchError.jql = finalJql; // Attach JQL for context
            throw searchError;
        }
        if (safetyBreak >= 1000) {
             console.error("[FATAL ERROR] /api/jira/tickets: Step 1 - Safety break triggered.");
             throw new Error("Pagination safety break triggered.");
        }
    }
    console.log(`[INFO] /api/jira/tickets: Finished Step 1 - Found ${issueReferences.length} total issue references.`);

    // --- STEP 2: Fetch full details (No changes needed here) ---
    if (issueReferences.length > 0) {
        // ... (existing detail fetching logic using Promise.allSettled) ...
        console.log(`[INFO] /api/jira/tickets: Step 2 - Fetching details for ${issueReferences.length} issues...`);
        let fetchErrorsCount = 0;
        const detailPromises = issueReferences.map(issueRef => {
            const issueIdOrKey = issueRef.key || issueRef.id;
            if (!issueIdOrKey) { /* ... warning ... */ return Promise.resolve({ data: null, error: 'Missing issue key/id', ref: issueRef }); }
            const issueUrl = `/rest/api/3/issue/${issueIdOrKey}?expand=changelog`;
            return jiraApi.get(issueUrl)
                .catch(err => { /* ... error handling ... */ fetchErrorsCount++; return { data: null, error: err.response?.data || err.message, key: issueIdOrKey }; });
        });
        console.log(`[DEBUG] /api/jira/tickets: Step 2 - Awaiting ${detailPromises.length} detail requests...`);
        const results = await Promise.allSettled(detailPromises);
        console.log(`[DEBUG] /api/jira/tickets: Step 2 - Detail requests finished.`);
        results.forEach((result, index) => { /* ... processing results ... */
             const refKey = issueReferences[index]?.key || issueReferences[index]?.id;
             if (result.status === 'fulfilled' && result.value?.data) { if (!result.value.error) { allIssueDetails.push(result.value.data); } }
             else if (result.status === 'rejected') { console.error(`[ERROR] /api/jira/tickets: Step 2 - Uncaught rejection for ${refKey || 'Unknown'}:`, result.reason); if (!result.reason?.key) fetchErrorsCount++; }
         });
        console.log(`[INFO] /api/jira/tickets: Finished Step 2 - Success: ${allIssueDetails.length}, Failed: ${fetchErrorsCount}.`);
    } else {
        console.log(`[INFO] /api/jira/tickets: Step 2 - Skipped fetching details (0 refs).`);
    }

    // --- Return Results ---
    console.log(`[INFO] /api/jira/tickets: Request complete. Returning ${allIssueDetails.length} issues for project: ${projectKey}`);
    res.json({
        issues: allIssueDetails,
        total: allIssueDetails.length,
    });

  } catch (error) { // Outer catch
    console.error(`[ERROR] /api/jira/tickets: Unhandled error during process for project ${projectKey}:`, error.response?.data || error.message);
    if(error.jql) console.error(`[ERROR] JQL was: ${error.jql}`);
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.errorMessages?.join(' ') || error.response?.data?.error || error.message || 'Failed to fetch Jira ticket data';
    res.status(status).json({ error: errorMessage });
  }
});


// --- Saved View API Routes (Unchanged) ---
app.get('/api/views', async (req, res) => { /* ... */ });
app.post('/api/views', async (req, res) => { /* ... */ });
app.get('/api/views/:id', async (req, res) => { /* ... */ });
app.delete('/api/views/:id', async (req, res) => { /* ... */ });


// --- Server Start ---
app.listen(PORT, () => {
  console.log(
    `[INFO] JiraMetricsDashboard Backend listening on http://localhost:${PORT}`,
  );
});


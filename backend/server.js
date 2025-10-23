/*
 * JiraMetricsDashboard - Backend Server
 * Handles Jira proxying and saving/loading views to MongoDB.
 * Implements the standard two-step fetch:
 * 1. POST /search/jql (params in query, body has JQL) fetching id,key paginated.
 * 2. GET /issue/{issueIdOrKey}?expand=changelog for each result from Step 1.
 * Uses standard pagination termination (issues.length < MAX_RESULTS).
 */

// Use ES module imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import mongoose from 'mongoose';
import View from './models/View.js'; // Ensure this path is correct

// --- Environment Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load .env from root

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// --- Load Environment Variables ---
const { JIRA_API_URL_BASE, JIRA_SESSION_TOKEN, JIRA_MAX_RESULTS, MONGO_URI } =
  process.env;

// Basic validation for essential variables
if (!JIRA_API_URL_BASE || !JIRA_SESSION_TOKEN) {
  console.error(
    '[FATAL ERROR] Missing JIRA_API_URL_BASE or JIRA_SESSION_TOKEN in .env file.',
  );
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('[FATAL ERROR] Missing MONGO_URI in .env file.');
  process.exit(1);
}

// Parse MAX_RESULTS with fallback
let MAX_RESULTS_PARSED = parseInt(JIRA_MAX_RESULTS || '50', 10);
if (isNaN(MAX_RESULTS_PARSED) || MAX_RESULTS_PARSED <= 0) {
    console.warn(`[WARN] Invalid JIRA_MAX_RESULTS. Defaulting to 50.`);
    MAX_RESULTS_PARSED = 50;
}
const MAX_RESULTS = MAX_RESULTS_PARSED;

// --- Middleware ---
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies

// --- MongoDB Connection ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('[INFO] MongoDB Connected Successfully.'))
  .catch((err) => {
    console.error('[FATAL ERROR] MongoDB Connection Failed:', err.message);
    process.exit(1);
  });

// --- Axios Client (Jira) ---
const jiraApi = axios.create({
  baseURL: JIRA_API_URL_BASE,
  headers: {
    'Content-Type': 'application/json',
    Cookie: `tenant.session.token=${JIRA_SESSION_TOKEN}`, // Authentication cookie
  },
  timeout: 30000, // Timeout for requests
});

// --- Jira API Routes ---

// GET /api/jira/metadata
app.get('/api/jira/metadata', async (req, res) => {
    const { projectKey } = req.query;
    console.log(`[INFO] /api/jira/metadata: Request for project: ${projectKey || 'NONE'}`);
    if (!projectKey) { return res.status(400).json({ error: 'projectKey query param is required' }); }
    try {
      // Define URLs for necessary metadata endpoints
      const projectDetailsUrl = `/rest/api/3/project/${projectKey}`;
      const prioritiesUrl = '/rest/api/3/priority';
      const statusesUrl = `/rest/api/3/project/${projectKey}/statuses`; // Statuses per project

      console.log(`[DEBUG] /api/jira/metadata: Fetching URLs for ${projectKey}`);
      // Fetch all metadata concurrently
      const [projectDetailsRes, prioritiesRes, statusesRes] = await Promise.all([
        jiraApi.get(projectDetailsUrl),
        jiraApi.get(prioritiesUrl),
        jiraApi.get(statusesUrl),
      ]);

      // Process statuses: flatten, deduplicate, and sort
      const formattedStatuses = (statusesRes.data || [])
          .flatMap(issueType => issueType.statuses || []) // Get statuses from all issue types
          .map(status => ({ id: status.id, name: status.name })) // Extract id and name
          .filter((value, index, self) => index === self.findIndex((s) => s.id === value.id)) // Deduplicate by ID
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')); // Sort alphabetically

      // Send combined metadata to frontend
      res.json({
        issueTypes: projectDetailsRes.data?.issueTypes || [],
        priorities: prioritiesRes.data || [],
        statuses: formattedStatuses,
      });
      console.log(`[INFO] /api/jira/metadata: Success for project: ${projectKey}`);
    } catch (error) {
      // Handle errors during metadata fetch
      console.error(`[ERROR] /api/jira/metadata: Fetch error for project ${projectKey}:`, error.response?.data || error.message);
      const status = error.response?.status || 500;
      const errorMessage = error.response?.data?.errorMessages?.join(' ') || error.message || 'Failed to fetch Jira metadata';
      res.status(status).json({ error: errorMessage });
    }
});


app.post('/api/jira/tickets', async (req, res) => {
  const { projectKey, jqlFilter } = req.body;
  console.log(`[INFO] /api/jira/tickets: Request for project: ${projectKey || 'NONE'}`);
  
  if (!projectKey) {
    console.warn('[WARN] /api/jira/tickets: Request failed (400) - projectKey is required');
    return res.status(400).json({ error: 'projectKey is required' });
  }

  // Construct the final JQL query
  const finalJql = `project = "${projectKey}" ${jqlFilter ? `AND (${jqlFilter})` : ''} ORDER BY created DESC`;
  console.log(`[INFO] /api/jira/tickets: Executing JQL: ${finalJql}`);

  let issueReferences = [];   // Stores basic info (id, key) from search
  let allIssueDetails = [];   // Stores full details fetched later
  
  // ⚡ CRUCIAL CHANGE for Jira API v3 POST /search/jql: Use token instead of offset (startAt)
  let nextPageToken = null; // Token for cursor-based pagination
  let keepFetching = true;  // Flag to control the pagination loop
  let safetyBreak = 0;      // Prevent accidental infinite loops

  try {
    // --- STEP 1: Paginate through search results to get Issue IDs/Keys ---
    console.log(`[INFO] /api/jira/tickets: Starting Step 1 - Fetching issue references...`);
    const searchUrl = '/rest/api/3/search/jql'; 

    while (keepFetching && safetyBreak < 1000) { // Loop until last page or safety break
        safetyBreak++;

        const payload = {
            jql: finalJql,
            maxResults: MAX_RESULTS,
            fields: ['id', 'key'] // Minimize payload size
        };
        
        // Include the token only if it exists (i.e., not the first page)
        if (nextPageToken) {
            payload.nextPageToken = nextPageToken;
        }

        console.log(`[DEBUG] /api/jira/tickets: Step 1.${safetyBreak} - Calling POST ${searchUrl} (Token: ${nextPageToken ? 'PRESENT' : 'NONE'})`);
        
        try {
            // Make the API call to Jira
            const response = await jiraApi.post(searchUrl, payload);
            const issues = response.data?.issues || []; // Extract issues from response
            const issuesCountInPage = issues.length;    // Count issues returned in this page
            
            // Extract the token for the *next* request
            nextPageToken = response.data?.nextPageToken || null; 

            if (!Array.isArray(issues)) {
                 console.warn(`[WARN] /api/jira/tickets: Step 1 - Invalid response structure (expected 'issues' array). Stopping.`, response.data);
                 keepFetching = false;
            } else {
                 // Add fetched references to the list
                 if (issuesCountInPage > 0) {
                    issueReferences = issueReferences.concat(issues);
                    console.log(`[INFO] /api/jira/tickets: Step 1 - Fetched page. Got ${issuesCountInPage}. Total refs now: ${issueReferences.length}`);
                 }

                 // --- TOKEN PAGINATION TERMINATION LOGIC ---
                 // Stop if 'nextPageToken' is null/empty, or if no issues were returned (which also implies the token will be null/empty).
                 if (!nextPageToken || issuesCountInPage === 0) {
                    keepFetching = false; 
                    console.log(`[DEBUG] /api/jira/tickets: Step 1 - Last page detected (Token: ${nextPageToken}, Issues: ${issuesCountInPage}).`);
                 }
                 // --- END LOGIC ---
            }
        } catch (searchError) {
             // Handle errors during the search API call
             console.error(`[ERROR] /api/jira/tickets: Step 1 - Payload sent:`, JSON.stringify(payload));
             console.error(`[ERROR] /api/jira/tickets: Step 1 - Error during JQL search:`, searchError.response?.data || searchError.message);
             searchError.jql = finalJql; 
             throw searchError; 
        }
        
        if (safetyBreak >= 1000) {
            console.error("[FATAL ERROR] /api/jira/tickets: Step 1 - Safety break triggered during search pagination.");
            throw new Error("Pagination safety break triggered during search.");
        }
    } // End while loop for Step 1
    
    console.log(`[INFO] /api/jira/tickets: Finished Step 1 - Found ${issueReferences.length} total issue references.`);

    // ----------------------------------------------------------------------------------------------------
    
    // --- STEP 2: Fetch full details for each issue reference ---
    if (issueReferences.length > 0) {
      console.log(`[INFO] /api/jira/tickets: Starting Step 2 - Fetching full details for ${issueReferences.length} issues...`);
      
      // Create an array of promises for fetching details concurrently
      const issueDetailPromises = issueReferences.map(issueRef => {
        const issueIdOrKey = issueRef.key || issueRef.id; 
        
        if (!issueIdOrKey) {
            console.warn(`[WARN] /api/jira/tickets: Step 2 - Found issue reference without id or key:`, issueRef);
            return Promise.resolve({ data: null, error: 'Missing id/key', ref: issueRef });
        }
        
        // Request issue details and expand changelog in a single GET request
        const issueUrl = `/rest/api/3/issue/${issueIdOrKey}?expand=changelog`;
        return jiraApi.get(issueUrl)
            .catch(err => {
                console.error(`[ERROR] /api/jira/tickets: Step 2 - Failed GET for issue ${issueIdOrKey}:`, err.response?.data || err.message);
                // Return an error structure to allow Promise.allSettled to resolve
                return { data: null, error: err.response?.data || err.message, key: issueIdOrKey };
            });
      });

      // Execute all detail fetch promises (Be mindful of Jira's rate limits here)
      console.log(`[DEBUG] /api/jira/tickets: Step 2 - Awaiting ${issueDetailPromises.length} detail requests...`);
      const detailedIssuesResults = await Promise.allSettled(issueDetailPromises);
      console.log(`[DEBUG] /api/jira/tickets: Step 2 - Detail requests finished.`);

      let fetchErrorsCount = 0;
      
      // Process the results of Promise.allSettled
      detailedIssuesResults.forEach(result => {
        // Check if promise was fulfilled AND the result contains valid data
        if (result.status === 'fulfilled' && result.value?.data && !result.value.error) {
            allIssueDetails.push(result.value.data); 
        } else {
            // Handle rejected promises or caught API errors
            fetchErrorsCount++;
            // The value for a fulfilled promise that contained a custom error structure (from the .catch above)
            const reason = result.status === 'rejected' ? result.reason : result.value?.error; 
            console.error(`[ERROR] /api/jira/tickets: Step 2 - Failed to process issue detail:`, reason);
        }
      });
      
      console.log(`[INFO] /api/jira/tickets: Finished Step 2 - Successfully got details for ${allIssueDetails.length}. Failed for ${fetchErrorsCount}.`);

    } else {
      console.log(`[INFO] /api/jira/tickets: Step 2 - Skipped fetching details (0 issue refs found).`);
    }

    // --- Return Results ---
    console.log(`[INFO] /api/jira/tickets: Request complete. Returning ${allIssueDetails.length} detailed issues for project: ${projectKey}`);
    res.json({
      issues: allIssueDetails,         
      total: allIssueDetails.length, 
    });

  } catch (error) { // Outer catch block for critical errors in Step 1 or setup
    console.error(`[ERROR] /api/jira/tickets: Unhandled error during process for project ${projectKey}:`, error.response?.data || error.message);
    if (error.jql) console.error(`[ERROR] JQL was: ${error.jql}`); 
    
    const status = error.response?.status || 500;
    
    // Extract meaningful error message from Jira response
    const errorMessage = error.response?.data?.errorMessages?.join(' ')
                      || (typeof error.response?.data?.errors === 'object' ? JSON.stringify(error.response.data.errors) : error.response?.data?.errors)
                      || error.response?.data?.error
                      || error.message
                      || 'Failed to fetch Jira ticket data';
                      
    res.status(status).json({ error: errorMessage });
  }
});


// --- Saved View API Routes ---
// GET /api/views - Fetch all view names and IDs
app.get('/api/views', async (req, res) => {
  console.log("[INFO] /api/views: Request to fetch all views.");
  try {
    // Select only _id and name, sort by name
    const views = await View.find().select('_id name').sort({ name: 1 });
    res.json(views);
  } catch (error) {
    console.error("[ERROR] /api/views: Failed to fetch views:", error.message);
    res.status(500).json({ error: "Failed to fetch views" });
  }
});

// POST /api/views - Save or Update (upsert) a view by name
app.post('/api/views', async (req, res) => {
  const viewConfig = req.body;
  console.log(`[INFO] /api/views: Request to save view: ${viewConfig.name}`);
  if (!viewConfig.name) {
    return res.status(400).json({ error: "View name is required" });
  }
  try {
    // Find view by name and update, or create if it doesn't exist
    const newView = await View.findOneAndUpdate(
      { name: viewConfig.name }, // Unique key for upsert
      viewConfig,               // Data to save/update
      { new: true, upsert: true, runValidators: true } // Options
    );
    res.status(201).json(newView); // Return the saved/updated view
  } catch (error) {
    // Handle potential duplicate name errors if upsert somehow fails (shouldn't happen with unique index)
    if (error.code === 11000) {
      console.warn(`[WARN] /api/views: Duplicate view name attempt (should have been upserted): ${viewConfig.name}`);
      return res.status(409).json({ error: `View name "${viewConfig.name}" already exists.` });
    }
    console.error("[ERROR] /api/views: Failed to save view:", error.message);
    res.status(500).json({ error: "Failed to save view" });
  }
});

// GET /api/views/:id - Fetch a single view's full configuration by ID
app.get('/api/views/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] /api/views/${id}: Request to fetch view by ID.`);
  try {
    // Validate if the ID is a valid MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid view ID format" });
    }
    const view = await View.findById(id); // Fetch by ID
    if (!view) {
      // If view with that ID doesn't exist
      return res.status(404).json({ error: "View not found" });
    }
    res.json(view); // Return the full view configuration
  } catch (error) {
    console.error(`[ERROR] /api/views/${id}: Failed to fetch view:`, error.message);
    res.status(500).json({ error: "Failed to fetch view" });
  }
});

// DELETE /api/views/:id - Delete a view by ID
app.delete('/api/views/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] /api/views/${id}: Request to DELETE view by ID.`);
  try {
     // Validate ID format
     if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid view ID format" });
    }
    // Attempt to find and delete the view by ID
    const result = await View.findByIdAndDelete(id);
    if (!result) {
      // If no view was found with that ID
      return res.status(404).json({ error: "View not found" });
    }
    // Send success message
    res.json({ message: "View deleted successfully" });
  } catch (error) {
    console.error(`[ERROR] /api/views/${id}: Failed to delete view:`, error.message);
    res.status(500).json({ error: "Failed to delete view" });
  }
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(
    `[INFO] JiraMetricsDashboard Backend listening on http://localhost:${PORT}`,
  );
});
// backend/models/View.js
import mongoose from 'mongoose';

// --- Define schema for the flow config objects ---
const flowConfigSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['group', 'status'] },
  value: { type: String, required: true }, // Store group name or status ID
}, { _id: false }); // No _id for this sub-schema

const viewSchema = new mongoose.Schema({
  // Use index: true directly in the field definition for uniqueness and indexing
  name: { type: String, required: true, unique: true, index: true },
  projectKey: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  standardFilters: {
    issueTypes: [String],
    priorities: [String],
  },
  statusGroups: [
    {
      _id: false, // Prevent Mongoose from creating an _id for subdocuments if not needed
      id: String,
      name: String,
      statuses: [String],
    },
  ],
  // --- UPDATED: Use the flowConfigSchema ---
  triageConfig: { type: flowConfigSchema, required: true },
  cycleStartConfig: { type: flowConfigSchema, required: true },
  cycleEndConfig: { type: flowConfigSchema, required: true },
  createdAt: { type: Date, default: Date.now }
});

const View = mongoose.model('View', viewSchema);

export default View;
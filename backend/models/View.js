// backend/models/View.js
import mongoose from 'mongoose';

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
  triageGroup: { type: String, required: true },
  cycleStartGroup: { type: String, required: true },
  cycleEndGroup: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// REMOVED: schema.index({ name: 1 }); - This was the duplicate index definition.
// The index is now correctly defined within the 'name' field options above.

const View = mongoose.model('View', viewSchema);

export default View;
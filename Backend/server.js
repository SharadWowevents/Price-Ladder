const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config({ quiet: true });

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/priceladder';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Generic Schema to accept flexible document structures from the frontend
const documentSchema = new mongoose.Schema({
  _id: { type: String, required: true }
}, { strict: false, versionKey: false });

// History Schema uses default Auto-ObjectIDs
const historySchema = new mongoose.Schema({}, { strict: false, versionKey: false });

// Dynamic model registry
const models = {
  users: mongoose.model('User', documentSchema),
  items: mongoose.model('Item', documentSchema),
  quotes: mongoose.model('Quote', documentSchema),
  config: mongoose.model('Config', documentSchema),
  history: mongoose.model('History', historySchema)
};

const getModel = (collection) => {
  const model = models[collection];
  if (!model) throw new Error(`Collection ${collection} not found`);
  return model;
};

// --- REST API ROUTES ---

// GET entire collection
app.get('/api/:collection', async (req, res) => {
  try {
    const docs = await getModel(req.params.collection).find({});
    res.json(docs.map(doc => {
      const { _id, ...data } = doc.toObject();
      return { id: _id, data };
    }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET single document
app.get('/api/:collection/:id', async (req, res) => {
  try {
    const doc = await getModel(req.params.collection).findById(req.params.id);
    if (!doc) return res.json({ exists: false, id: req.params.id });
    const { _id, ...data } = doc.toObject();
    res.json({ exists: true, id: _id, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST to collection (auto-generate ID, primarily for history)
app.post('/api/:collection', async (req, res) => {
  try {
    const Model = getModel(req.params.collection);
    const doc = new Model(req.body);
    await doc.save();
    res.json({ success: true, id: doc._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT single document (Set / Replace)
app.put('/api/:collection/:id', async (req, res) => {
  try {
    const Model = getModel(req.params.collection);
    await Model.findByIdAndUpdate(req.params.id, { ...req.body, _id: req.params.id }, { upsert: true, returnDocument: 'after', overwrite: true });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH single document (Update fields)
app.patch('/api/:collection/:id', async (req, res) => {
  try {
    const Model = getModel(req.params.collection);
    await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE single document
app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const Model = getModel(req.params.collection);
    await Model.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
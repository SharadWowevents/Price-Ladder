const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config({ quiet: true });

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/priceladder';

// Generic Schema to accept flexible document structures from the frontend
const documentSchema = new mongoose.Schema({
  _id: { type: String, required: true }
}, { strict: false, versionKey: false });

// Retention period for deleted backup records: 4 weeks (30 days)
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60;
const ONE_MONTH_MS = ONE_MONTH_SECONDS * 1000;

// Deleted Document Schema for storing backup copies of deleted documents (auto-expires after 4 weeks)
const deletedDocumentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  deletedAt: { type: Date, default: Date.now, expires: ONE_MONTH_SECONDS },
  originalCollection: { type: String }
}, { strict: false, versionKey: false });

// History Schema uses default Auto-ObjectIDs
const historySchema = new mongoose.Schema({}, { strict: false, versionKey: false });

// Deleted History Schema (auto-expires after 4 weeks)
const deletedHistorySchema = new mongoose.Schema({
  deletedAt: { type: Date, default: Date.now, expires: ONE_MONTH_SECONDS },
  originalCollection: { type: String }
}, { strict: false, versionKey: false });

// Persistent Delete Queue Schema to survive server crashes mid-delete
const deleteQueueSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // format: "<collection>:<docId>"
  collectionName: { type: String, required: true },
  docId: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'COPIED'], default: 'PENDING' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false });

const DeleteQueue = mongoose.model('DeleteQueue', deleteQueueSchema, 'delete_queue');

// Dynamic model registry (Active collections)
const models = {
  users: mongoose.model('User', documentSchema, 'users'),
  items: mongoose.model('Item', documentSchema, 'items'),
  quotes: mongoose.model('Quote', documentSchema, 'quotes'),
  config: mongoose.model('Config', documentSchema, 'config'),
  history: mongoose.model('History', historySchema, 'history')
};

// Deleted backup model registry (deleted_<collectionName>)
const deletedModels = {
  users: mongoose.model('DeletedUser', deletedDocumentSchema, 'deleted_users'),
  items: mongoose.model('DeletedItem', deletedDocumentSchema, 'deleted_items'),
  quotes: mongoose.model('DeletedQuote', deletedDocumentSchema, 'deleted_quotes'),
  config: mongoose.model('DeletedConfig', deletedDocumentSchema, 'deleted_config'),
  history: mongoose.model('DeletedHistory', deletedHistorySchema, 'deleted_history')
};

// Map singular/plural deleted collection names so both /api/deleted_users and /api/deleted_user work
const allModels = {
  ...models,
  deleted_users: deletedModels.users,
  deleted_user: deletedModels.users,
  deleted_items: deletedModels.items,
  deleted_item: deletedModels.items,
  deleted_quotes: deletedModels.quotes,
  deleted_quote: deletedModels.quotes,
  deleted_config: deletedModels.config,
  deleted_history: deletedModels.history
};

const getModel = (collection) => {
  const model = allModels[collection];
  if (!model) throw new Error(`Collection ${collection} not found`);
  return model;
};

const getDeletedModel = (collection) => {
  const deletedModel = deletedModels[collection];
  if (!deletedModel) throw new Error(`Deleted collection for ${collection} not found`);
  return deletedModel;
};

// --- IN-MEMORY + PERSISTENT DELETE QUEUE & CRASH RECOVERY ---

const memoryQueue = [];
const inFlightKeys = new Set();
let isProcessingQueue = false;

/**
 * Executes a single copy-then-delete operation safely:
 * 1. Records the job in persistent DeleteQueue
 * 2. Copies document to deleted_<collection>
 * 3. Deletes document from original <collection>
 * 4. Removes job from persistent DeleteQueue
 */
const processDeleteOperation = async (collection, id) => {
  const OriginalModel = getModel(collection);
  const DeletedModel = getDeletedModel(collection);
  const queueKey = `${collection}:${id}`;

  // Step 1: Persist intent in DeleteQueue before touching data
  await DeleteQueue.findByIdAndUpdate(
    queueKey,
    { _id: queueKey, collectionName: collection, docId: String(id), status: 'PENDING', createdAt: new Date().toISOString() },
    { upsert: true, returnDocument: 'after' }
  );

  // Step 2: Fetch original document
  const existingDoc = await OriginalModel.findById(id);

  if (existingDoc) {
    const docData = existingDoc.toObject();
    const backupPayload = {
      ...docData,
      _id: docData._id,
      originalCollection: collection,
      deletedAt: new Date()
    };

    // Step 3: Copy FIRST to deleted_<collectionName>
    await DeletedModel.findByIdAndUpdate(
      id,
      backupPayload,
      { upsert: true, returnDocument: 'after', overwrite: true }
    );

    // Mark queue item as COPIED before deleting from original
    await DeleteQueue.findByIdAndUpdate(queueKey, { $set: { status: 'COPIED' } });

    // Step 4: Verify backup exists in deleted_<collectionName>, then delete from original schema
    const backupVerified = await DeletedModel.exists({ _id: id });
    if (!backupVerified) {
      throw new Error(`Backup verification failed for ${collection}/${id}`);
    }

    await OriginalModel.findByIdAndDelete(id);
  }

  // Step 5: Remove completed operation from DeleteQueue
  await DeleteQueue.findByIdAndDelete(queueKey);
};

const drainMemoryQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (memoryQueue.length > 0) {
    const task = memoryQueue.shift();
    try {
      await processDeleteOperation(task.collection, task.id);
      task.resolve();
    } catch (err) {
      task.reject(err);
    } finally {
      inFlightKeys.delete(task.key);
    }
  }

  isProcessingQueue = false;
};

const enqueueDelete = (collection, id) => {
  return new Promise((resolve, reject) => {
    const key = `${collection}:${id}`;
    if (inFlightKeys.has(key)) {
      return resolve(); // Already queued/processing
    }
    inFlightKeys.add(key);
    memoryQueue.push({ key, collection, id, resolve, reject });
    drainMemoryQueue();
  });
};

/**
 * Purges any backup records in deleted_<collection> older than 4 weeks (30 days)
 * to optimize database storage.
 */
const purgeOldDeletedData = async () => {
  try {
    const cutoffDate = new Date(Date.now() - ONE_MONTH_MS);
    const cutoffIso = cutoffDate.toISOString();

    await Promise.all(
      Object.entries(deletedModels).map(async ([colName, DeletedModel]) => {
        const result = await DeletedModel.deleteMany({
          $or: [
            { deletedAt: { $lt: cutoffDate } },
            { deletedAt: { $lt: cutoffIso } }
          ]
        });
        if (result.deletedCount > 0) {
          console.log(`[Storage Cleanup] Purged ${result.deletedCount} expired record(s) (>4 weeks old) from deleted_${colName}`);
        }
      })
    );
  } catch (err) {
    console.error('Error purging expired deleted data:', err);
  }
};

/**
 * Crash Recovery & Parallel Query Reconciliation:
 * Ensures the same data never remains in both original and deleted_<collection>
 * if the server crashed mid-delete.
 */
const reconcileDeletedData = async () => {
  try {
    // 1. Resume any interrupted delete jobs from persistent DeleteQueue
    const pendingJobs = await DeleteQueue.find({});
    if (pendingJobs.length > 0) {
      await Promise.all(
        pendingJobs.map(job => processDeleteOperation(job.collectionName, job.docId))
      );
    }

    // 2. Parallel query across all collections to detect and clean up any duplicate IDs
    // present in both original <collection> and deleted_<collection>
    const collectionNames = Object.keys(models);
    await Promise.all(
      collectionNames.map(async (colName) => {
        const OriginalModel = models[colName];
        const DeletedModel = deletedModels[colName];

        // Query both collections in parallel
        const [originalDocs, deletedDocs] = await Promise.all([
          OriginalModel.find({}, { _id: 1 }).lean(),
          DeletedModel.find({}, { _id: 1 }).lean()
        ]);

        if (!originalDocs.length || !deletedDocs.length) return;

        const deletedIdSet = new Set(deletedDocs.map(d => String(d._id)));
        const duplicateIds = originalDocs
          .map(d => d._id)
          .filter(id => deletedIdSet.has(String(id)));

        if (duplicateIds.length > 0) {
          console.log(`[Crash Recovery] Removing ${duplicateIds.length} duplicate doc(s) from ${colName} already present in deleted_${colName}`);
          await OriginalModel.deleteMany({ _id: { $in: duplicateIds } });
        }
      })
    );

    // 3. Purge any deleted backup records older than 4 weeks
    await purgeOldDeletedData();
  } catch (err) {
    console.error('Error during crash recovery reconciliation:', err);
  }
};

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await reconcileDeletedData();
    // Run storage cleanup check every 12 hours in addition to MongoDB's TTL index
    setInterval(purgeOldDeletedData, 12 * 60 * 60 * 1000);
  })
  .catch(err => console.error('MongoDB connection error:', err));

// --- REST API ROUTES ---

// GET entire collection
app.get('/api/:collection', async (req, res) => {
  try {
    const colName = req.params.collection;
    const Model = getModel(colName);

    // If querying an active collection, run parallel query with deleted_<collection>
    // to guarantee no crashed/in-flight deleted doc is ever returned as active
    if (models[colName] && deletedModels[colName]) {
      const [docs, deletedIds] = await Promise.all([
        Model.find({}),
        deletedModels[colName].find({}, { _id: 1 }).lean()
      ]);
      const deletedSet = new Set(deletedIds.map(d => String(d._id)));
      const activeDocs = docs.filter(doc => !deletedSet.has(String(doc._id)));

      return res.json(activeDocs.map(doc => {
        const { _id, ...data } = doc.toObject();
        return { id: _id, data };
      }));
    }

    const docs = await Model.find({});
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
    const colName = req.params.collection;
    const docId = req.params.id;
    const Model = getModel(colName);

    // Parallel check against deleted_<collection> if reading from an active collection
    if (models[colName] && deletedModels[colName]) {
      const [doc, isDeleted] = await Promise.all([
        Model.findById(docId),
        deletedModels[colName].exists({ _id: docId })
      ]);
      if (!doc || isDeleted) return res.json({ exists: false, id: docId });
      const { _id, ...data } = doc.toObject();
      return res.json({ exists: true, id: _id, data });
    }

    const doc = await Model.findById(docId);
    if (!doc) return res.json({ exists: false, id: docId });
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
    const colName = req.params.collection;
    const docId = req.params.id;
    const Model = getModel(colName);

    // Run parallel query: upsert in active collection & remove any stale record from deleted_<collection>
    const tasks = [
      Model.findByIdAndUpdate(docId, { ...req.body, _id: docId }, { upsert: true, returnDocument: 'after', overwrite: true })
    ];
    if (models[colName] && deletedModels[colName]) {
      tasks.push(deletedModels[colName].findByIdAndDelete(docId));
    }
    await Promise.all(tasks);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH single document (Update fields)
app.patch('/api/:collection/:id', async (req, res) => {
  try {
    const colName = req.params.collection;
    const docId = req.params.id;
    const Model = getModel(colName);

    const tasks = [
      Model.findByIdAndUpdate(docId, { $set: req.body }, { upsert: true })
    ];
    if (models[colName] && deletedModels[colName]) {
      tasks.push(deletedModels[colName].findByIdAndDelete(docId));
    }
    await Promise.all(tasks);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Normalize collection name (e.g., "deleted_users" or "deleted_user" -> "users")
const resolveBaseCollection = (name) => {
  const raw = String(name || '').replace(/^deleted_/, '');
  if (models[raw]) return raw;
  if (models[`${raw}s`]) return `${raw}s`;
  throw new Error(`Collection ${name} not found`);
};

/**
 * Restores a single document from deleted_<collection> back into original <collection>:
 * 1. Reads backup record from deleted_<collection>
 * 2. Writes clean document back into original <collection>
 * 3. Verifies existence in original <collection>, then deletes from deleted_<collection>
 * 4. If restoring an item, also restores its paired quote from deleted_quotes (if present)
 */
const processRestoreOperation = async (collection, id) => {
  const baseCol = resolveBaseCollection(collection);
  const OriginalModel = getModel(baseCol);
  const DeletedModel = getDeletedModel(baseCol);

  const deletedDoc = await DeletedModel.findById(id);
  if (!deletedDoc) return false;

  const { _id, deletedAt, originalCollection, ...cleanData } = deletedDoc.toObject();

  // Step 1: Copy back to original collection first
  await OriginalModel.findByIdAndUpdate(
    _id,
    { ...cleanData, _id },
    { upsert: true, returnDocument: 'after', overwrite: true }
  );

  // Step 2: Verify it exists in original collection before removing from deleted_<collection>
  const verified = await OriginalModel.exists({ _id });
  if (!verified) {
    throw new Error(`Restore verification failed for ${baseCol}/${_id}`);
  }

  // Step 3: Delete from deleted_<collection>
  await DeletedModel.findByIdAndDelete(_id);

  // Step 4: If an item was restored, also restore its paired quote in deleted_quotes if present
  if (baseCol === 'items') {
    const deletedQuote = await deletedModels.quotes.findById(_id);
    if (deletedQuote) {
      const { _id: qId, deletedAt: qDel, originalCollection: qCol, ...quoteData } = deletedQuote.toObject();
      await models.quotes.findByIdAndUpdate(qId, { ...quoteData, _id: qId }, { upsert: true, returnDocument: 'after', overwrite: true });
      await deletedModels.quotes.findByIdAndDelete(qId);
    }
  }

  return true;
};

// POST restore a single document from backup
app.post('/api/restore/:collection/:id', async (req, res) => {
  try {
    const restored = await processRestoreOperation(req.params.collection, req.params.id);
    if (!restored) {
      return res.status(404).json({ error: 'Record not found in backup collection.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST batch restore by date/time range, collection, optional IDs, and max count
app.post('/api/restore-batch', async (req, res) => {
  try {
    const { collection = 'all', fromDateTime, toDateTime, limitCount, ids } = req.body || {};
    const targetCollections = collection === 'all'
      ? ['items', 'users', 'quotes', 'config', 'history']
      : [resolveBaseCollection(collection)];

    const fromTime = fromDateTime ? new Date(fromDateTime).getTime() : null;
    const toTime = toDateTime ? new Date(toDateTime).getTime() : null;
    const idSet = Array.isArray(ids) && ids.length > 0 ? new Set(ids.map(String)) : null;
    const maxItems = Number(limitCount) > 0 ? Number(limitCount) : Infinity;

    // Gather candidate backup records across target collections
    const candidates = [];
    for (const colName of targetCollections) {
      const DeletedModel = deletedModels[colName];
      if (!DeletedModel) continue;
      const docs = await DeletedModel.find({}).lean();
      for (const d of docs) {
        const key = `${colName}:${d._id}`;
        if (idSet && !idSet.has(String(d._id)) && !idSet.has(key)) continue;
        const delTime = d.deletedAt ? new Date(d.deletedAt).getTime() : 0;
        if (fromTime && !isNaN(fromTime) && delTime < fromTime) continue;
        if (toTime && !isNaN(toTime) && delTime > toTime) continue;
        candidates.push({ colName, id: d._id, deletedAt: delTime });
      }
    }

    // Sort newest deleted first so the most recent deletions are prioritized when limitCount is used
    candidates.sort((a, b) => b.deletedAt - a.deletedAt);
    const toRestore = candidates.slice(0, maxItems);

    let restoredCount = 0;
    const restoredItems = [];
    for (const item of toRestore) {
      const ok = await processRestoreOperation(item.colName, item.id);
      if (ok) {
        restoredCount++;
        restoredItems.push({ collection: item.colName, id: item.id });
      }
    }

    res.json({ success: true, restoredCount, restoredItems });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE single document (Copy first to deleted_<collectionName>, then delete from original via queue)
app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const colName = req.params.collection;
    const docId = req.params.id;

    // Clients are NOT allowed to delete data from backup (deleted_*) collections
    if (String(colName).startsWith('deleted_')) {
      return res.status(403).json({
        error: 'Deleting data from backup collections is disabled. You can only restore records from backup.'
      });
    }

    // If deleting from an active collection, use the backup-first queue workflow
    if (models[colName] && deletedModels[colName]) {
      await enqueueDelete(colName, docId);
      return res.json({ success: true, backedUpTo: `deleted_${colName}` });
    }

    res.status(400).json({ error: `Collection ${colName} does not support deletion.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
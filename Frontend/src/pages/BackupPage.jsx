import React, { useState, useEffect } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney } from '../lib/utils';
import { useToast } from '../components/UI';

export default function BackupPage({ defaultCollection = 'all' }) {
  const [collectionFilter, setCollectionFilter] = useState(defaultCollection);
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');
  const [limitCount, setLimitCount] = useState('');
  const [search, setSearch] = useState('');
  
  const [deletedItems, setDeletedItems] = useState([]);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [deletedQuotes, setDeletedQuotes] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isRestoring, setIsRestoring] = useState(false);

  const toast = useToast();

  useEffect(() => {
    const unsubItems = LocalDB.collection('deleted_items').onSnapshot(snap => {
      setDeletedItems(snap.docs.map(d => ({ ...d.data(), _id: d.id, _col: 'items', _colLabel: 'Item' })));
    });
    const unsubUsers = LocalDB.collection('deleted_users').onSnapshot(snap => {
      setDeletedUsers(snap.docs.map(d => ({ ...d.data(), _id: d.id, _col: 'users', _colLabel: 'User' })));
    });
    const unsubQuotes = LocalDB.collection('deleted_quotes').onSnapshot(snap => {
      setDeletedQuotes(snap.docs.map(d => ({ ...d.data(), _id: d.id, _col: 'quotes', _colLabel: 'Quote' })));
    });

    return () => {
      unsubItems();
      unsubUsers();
      unsubQuotes();
    };
  }, []);

  // Combine and sort all backup records
  const allBackupRecords = [
    ...(collectionFilter === 'all' || collectionFilter === 'items' ? deletedItems : []),
    ...(collectionFilter === 'all' || collectionFilter === 'users' ? deletedUsers : []),
    ...(collectionFilter === 'all' || collectionFilter === 'quotes' ? deletedQuotes : [])
  ];

  // Apply filters (Date & Time range, Search term)
  const filteredRecords = allBackupRecords.filter(r => {
    if (search) {
      const s = search.toLowerCase();
      const name = (r.name || r.email || r._id || '').toLowerCase();
      if (!name.includes(s)) return false;
    }

    if (r.deletedAt) {
      const delTime = new Date(r.deletedAt).getTime();
      if (fromDateTime) {
        const fromTime = new Date(fromDateTime).getTime();
        if (!isNaN(fromTime) && delTime < fromTime) return false;
      }
      if (toDateTime) {
        const toTime = new Date(toDateTime).getTime();
        if (!isNaN(toTime) && delTime > toTime) return false;
      }
    }
    return true;
  });

  // Sort newest deleted first
  filteredRecords.sort((a, b) => {
    const ta = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const tb = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return tb - ta;
  });

  const getRecordKey = (r) => `${r._col}:${r._id}`;

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredRecords.map(getRecordKey)));
    }
  };

  const toggleSelectOne = (key) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  // Restore a single row
  const handleRestoreOne = async (record) => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      await LocalDB.restore(record._col, record._id);
      setSelectedKeys(prev => {
        const next = new Set(prev);
        next.delete(getRecordKey(record));
        return next;
      });
      toast(`Restored "${record.name || record.email || record._id}" back to active data.`, 'success');
    } catch (err) {
      toast(err.message || 'Failed to restore record.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Restore selected or date-range batch
  const handleBatchRestore = async (useSelectedOnly = false) => {
    if (isRestoring) return;
    if (filteredRecords.length === 0) {
      return toast('No deleted records match your criteria to restore.', 'error');
    }

    let idsToRestore = null;
    if (useSelectedOnly) {
      if (selectedKeys.size === 0) {
        return toast('Please select at least one record to restore.', 'error');
      }
      idsToRestore = Array.from(selectedKeys);
    }

    const maxCount = limitCount ? parseInt(limitCount, 10) : undefined;
    setIsRestoring(true);
    try {
      const res = await LocalDB.restoreBatch({
        collection: collectionFilter,
        fromDateTime,
        toDateTime,
        limitCount: maxCount,
        ids: idsToRestore
      });

      setSelectedKeys(new Set());
      toast(`Successfully restored ${res.restoredCount} record(s) to original collection.`, 'success');
    } catch (err) {
      toast(err.message || 'Failed to restore records.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Calculate days remaining before 30-day auto-purge
  const formatRetention = (deletedAt) => {
    if (!deletedAt) return '—';
    const delTime = new Date(deletedAt).getTime();
    if (isNaN(delTime)) return '—';
    const expiresAt = delTime + (30 * 24 * 60 * 60 * 1000);
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 0) return 'Expiring soon';
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return `${daysLeft}d left`;
  };

  const totalBackupCount = deletedItems.length + deletedUsers.length + deletedQuotes.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Backup Database & Restore</h2>
          <p className="page-sub">
            View backed-up data from deleted collections. You can restore records back into the original collection, filtered by date, time, and custom amount.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-admin">
            {totalBackupCount} total backed up
          </span>
          <span className="badge badge-team" title="Records older than 30 days are automatically purged">
            30-Day Auto Retention
          </span>
        </div>
      </div>

      {/* Control Card: Date/Time Filter and How Much Data to Restore */}
      <div className="card">
        <div className="card-head">
          <h3>Restore Filters &amp; Selection</h3>
          <p>Select specific date and time ranges to choose how much deleted data to recover.</p>
        </div>
        <div className="card-pad">
          <div className="row-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Backup Collection</label>
              <select value={collectionFilter} onChange={e => { setCollectionFilter(e.target.value); setSelectedKeys(new Set()); }}>
                <option value="all">All Backup Data ({totalBackupCount})</option>
                <option value="items">Deleted Items ({deletedItems.length})</option>
                <option value="users">Deleted Users ({deletedUsers.length})</option>
                <option value="quotes">Deleted Quotes ({deletedQuotes.length})</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>From Date &amp; Time</label>
              <input
                type="datetime-local"
                value={fromDateTime}
                onChange={e => setFromDateTime(e.target.value)}
              />
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>To Date &amp; Time</label>
              <input
                type="datetime-local"
                value={toDateTime}
                onChange={e => setToDateTime(e.target.value)}
              />
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>How much data to restore (Max count)</label>
              <input
                type="number"
                min="1"
                placeholder="All matching (or e.g. 5)"
                value={limitCount}
                onChange={e => setLimitCount(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
            <div className="search-bar" style={{ margin: 0, minWidth: '220px', flex: 1 }}>
              <span className="search-icon">&#128269;</span>
              <input
                placeholder="Search backup records..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <button
              className="btn"
              disabled={isRestoring || filteredRecords.length === 0}
              onClick={() => handleBatchRestore(false)}
            >
              {isRestoring ? 'Restoring...' : `Restore by Date & Time (${filteredRecords.length} matches)`}
            </button>

            {selectedKeys.size > 0 && (
              <button
                className="btn btn-ghost"
                disabled={isRestoring}
                onClick={() => handleBatchRestore(true)}
              >
                Restore Selected ({selectedKeys.size})
              </button>
            )}

            {(fromDateTime || toDateTime || limitCount || search) && (
              <button
                className="link-btn"
                style={{ fontSize: '13px' }}
                onClick={() => { setFromDateTime(''); setToDateTime(''); setLimitCount(''); setSearch(''); }}
              >
                Reset filters
              </button>
            )}
          </div>
          <p className="small-note" style={{ marginTop: '10px', color: 'var(--ink-muted)' }}>
            <strong>Note:</strong> Deleting directly from the backup table is disabled to prevent accidental data loss. Restoring a record will automatically remove it from the deleted collection and save it back into the original schema.
          </p>
        </div>
      </div>

      {/* Backup Database Table */}
      <div className="card">
        <div className="card-head">
          <h3>Backup Database Records</h3>
          <p>
            Showing {filteredRecords.length} backed up record(s). Click "Restore" on any row to restore it immediately.
          </p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredRecords.length > 0 && selectedKeys.size === filteredRecords.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Type</th>
                <th>Name / Identifier</th>
                <th>Details</th>
                <th>Deleted At</th>
                <th>Retention</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="7">
                    {totalBackupCount === 0
                      ? 'Backup database is empty. No deleted records currently stored.'
                      : 'No backup records match the selected date/time or collection filters.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map(r => {
                  const key = getRecordKey(r);
                  const isChecked = selectedKeys.has(key);

                  // Extract human-readable details according to collection
                  let details = '—';
                  if (r._col === 'items') {
                    details = `Cost: ${fmtMoney(r.costPrice)} | Added: ${fmtMoney(r.amountAdded)} | End User %: ${r.pct1 ?? 0}%`;
                  } else if (r._col === 'users') {
                    details = `Email: ${r.email} | Role: ${r.role}`;
                  } else if (r._col === 'quotes') {
                    details = `List: ${fmtMoney(r.listPrice)} | End User: ${fmtMoney(r.boundary1)} | Dealer: ${fmtMoney(r.floorPrice)}`;
                  }

                  return (
                    <tr key={key} style={isChecked ? { background: 'var(--accent-soft)' } : undefined}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(key)}
                        />
                      </td>
                      <td>
                        <span className={`badge ${r._col === 'users' ? 'badge-admin' : 'badge-team'}`}>
                          {r._colLabel}
                        </span>
                      </td>
                      <td className="item-name">
                        {r.name || r.email || r._id}
                        {r.email && r.name && <span className="small-note" style={{ display: 'block' }}>{r.email}</span>}
                      </td>
                      <td style={{ fontSize: '12.5px', color: 'var(--ink-muted)' }}>
                        {details}
                      </td>
                      <td className="mono" style={{ fontSize: '12px' }}>
                        {r.deletedAt ? new Date(r.deletedAt).toLocaleString() : '—'}
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'var(--floor-soft)', color: 'var(--floor)' }}>
                          {formatRetention(r.deletedAt)}
                        </span>
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button
                            className="icon-btn icon-btn-primary"
                            disabled={isRestoring}
                            onClick={() => handleRestoreOne(r)}
                          >
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


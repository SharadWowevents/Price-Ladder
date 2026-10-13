import React, { useState, useEffect } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney, listPriceOf, effectivePct, computeQuote, slugId, recordHistory, recomputeAllQuotes, parseBulkRows, CURRENCY_DEFAULT } from '../lib/utils';
import { GpLine, useToast } from '../components/UI';

const EditableRow = ({ item, formula, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);

  useEffect(() => {
    setForm(item);
  }, [item]);

  const listPrice = listPriceOf(item);
  const pct = effectivePct(item, formula);
  const q = computeQuote(listPrice, pct);
  
  if (!editing) return (
    <tr>
      <td className="item-name">{item.name}</td>
      <td className="num-col">{Number(item.costPrice).toFixed(2)}</td>
      <td className="num-col">{Number(item.amountAdded).toFixed(2)}</td>
      <td className="num-col">{Number(pct.pct1).toFixed(1)}</td>
      <td className="num-col">{Number(pct.pct2).toFixed(1)}</td>
      <td className="num-col">{Number(pct.pctFloor).toFixed(1)}</td>
      <td className="num-col price-cell"><span className="amount">{fmtMoney(listPrice, formula?.currency)}</span><GpLine price={listPrice} costPrice={item.costPrice} currency={formula?.currency}/></td>
      <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary1, formula?.currency)}</span><GpLine price={q.boundary1} costPrice={item.costPrice} currency={formula?.currency}/></td>
      <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary2, formula?.currency)}</span><GpLine price={q.boundary2} costPrice={item.costPrice} currency={formula?.currency}/></td>
      <td className="num-col floor-cell price-cell"><span className="amount">{fmtMoney(q.floorPrice, formula?.currency)}</span><GpLine price={q.floorPrice} costPrice={item.costPrice} currency={formula?.currency}/></td>
      <td>
        <div className="inline-actions">
          <button className="icon-btn" onClick={() => { setForm(item); setEditing(true); }}>Edit</button>
          <button className="icon-btn" onClick={() => onDelete(item.id)}>Del</button>
        </div>
      </td>
    </tr>
  );

  const handleSave = async () => {
    const updated = {
      ...form,
      name: String(form.name || '').trim(),
      costPrice: Number(form.costPrice),
      amountAdded: Number(form.amountAdded),
      pct1: Number(form.pct1),
      pct2: Number(form.pct2),
      pctFloor: Number(form.pctFloor)
    };
    await onSave(updated, () => setEditing(false));
  };

  return (
    <tr className="editing-cell">
      <td><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></td>
      <td><input type="number" value={form.costPrice} onChange={e => setForm({...form, costPrice: e.target.value})} style={{width:'60px'}}/></td>
      <td><input type="number" value={form.amountAdded} onChange={e => setForm({...form, amountAdded: e.target.value})} style={{width:'60px'}}/></td>
      <td><input type="number" value={form.pct1} onChange={e => setForm({...form, pct1: e.target.value})} style={{width:'60px'}}/></td>
      <td><input type="number" value={form.pct2} onChange={e => setForm({...form, pct2: e.target.value})} style={{width:'60px'}}/></td>
      <td><input type="number" value={form.pctFloor} onChange={e => setForm({...form, pctFloor: e.target.value})} style={{width:'60px'}}/></td>
      <td colSpan="4"></td>
      <td>
        <div className="inline-actions">
          <button className="icon-btn icon-btn-primary" onClick={handleSave}>Save</button>
          <button className="icon-btn" onClick={() => { setForm(item); setEditing(false); }}>Cancel</button>
        </div>
      </td>
    </tr>
  );
};

export default function FormulaPage() {
  const [formula, setFormula] = useState({ pct1: 0, pct2: 0, pctFloor: 0, currency: '₹' });
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  
  // Bulk import state
  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  
  // History state
  const [histItem, setHistItem] = useState('__all__');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histResult, setHistResult] = useState(null);
  
  const toast = useToast();

  useEffect(() => {
    const unf = LocalDB.doc('config/formula').onSnapshot(snap => setFormula(snap.exists ? snap.data() : formula));
    const uni = LocalDB.collection('items').orderBy('name').onSnapshot(snap => setItems(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unf(); uni(); };
  }, []);

  useEffect(() => {
    setBulkRows(parseBulkRows(bulkText, items));
  }, [bulkText, items]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    const formEl = e.target;
    const fd = new FormData(formEl);
    const name = fd.get('name');
    const costPrice = Number(fd.get('cost'));
    const amountAdded = Number(fd.get('added'));
    const pct1 = Number(fd.get('p1') || formula.pct1 || 0);
    const pct2 = Number(fd.get('p2') || formula.pct2 || 0);
    const pctFloor = Number(fd.get('pf') || formula.pctFloor || 0);
    
    const item = {
      name, costPrice, amountAdded,
      pct1, pct2, pctFloor
    };
    const id = slugId(name);
    const now = new Date().toISOString();
    
    const listPrice = listPriceOf(item);
    const q = computeQuote(listPrice, item);
    const currency = formula?.currency || CURRENCY_DEFAULT;
    
    await LocalDB.collection('quotes').doc(id).set({ name, listPrice, ...q, currency, updatedAt: now });
    await recordHistory(LocalDB, id, {
      costPrice, amountAdded, listPrice,
      boundary1: q.boundary1, boundary2: q.boundary2, floorPrice: q.floorPrice,
      pct1, pct2, pctFloor, currency, changedAt: now
    });
    await LocalDB.collection('items').doc(id).set({ ...item, createdAt: now });
    
    formEl.reset();
    toast('Item added', 'success');
  };

  const updateItem = async (updated, onDoneEditing) => {
    const listPrice = listPriceOf(updated);
    const q = computeQuote(listPrice, updated);
    const currency = formula?.currency || CURRENCY_DEFAULT;
    const now = new Date().toISOString();
    
    await LocalDB.collection('quotes').doc(updated.id).set({ name: updated.name, listPrice, ...q, currency, updatedAt: now });
    await recordHistory(LocalDB, updated.id, {
      costPrice: Number(updated.costPrice), amountAdded: Number(updated.amountAdded), listPrice,
      boundary1: q.boundary1, boundary2: q.boundary2, floorPrice: q.floorPrice,
      pct1: updated.pct1, pct2: updated.pct2, pctFloor: updated.pctFloor, currency, changedAt: now
    });
    if (onDoneEditing) onDoneEditing();
    await LocalDB.collection('items').doc(updated.id).update(updated);
    toast('Item updated', 'success');
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item from the price list? This cannot be undone.')) return;
    await LocalDB.collection('quotes').doc(id).delete();
    await LocalDB.collection('items').doc(id).delete();
    toast('Item deleted', 'success');
  };

  const saveDefaultFormula = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newFormula = {
      pct1: Number(fd.get('pct1')),
      pct2: Number(fd.get('pct2')),
      pctFloor: Number(fd.get('pctFloor')),
      currency: fd.get('currency') || CURRENCY_DEFAULT,
      updatedAt: new Date().toISOString()
    };
    
    await LocalDB.doc('config/formula').set(newFormula);
    await recomputeAllQuotes(LocalDB, newFormula, items);
    toast('Default saved. Items with their own % keep them; others updated.', 'success');
  };

  const applyDefaultToAll = async () => {
    if (!window.confirm('Set every item’s End User / OEM / Dealer % to match the default? This overwrites custom percentages.')) return;
    const p1 = formula.pct1 || 0, p2 = formula.pct2 || 0, pf = formula.pctFloor || 0;
    
    const writes = items.map(it => LocalDB.collection('items').doc(it.id).update({pct1: p1, pct2: p2, pctFloor: pf}));
    await Promise.all(writes);
    
    const updatedItems = items.map(it => ({...it, pct1: p1, pct2: p2, pctFloor: pf}));
    await recomputeAllQuotes(LocalDB, formula, updatedItems);
    toast('Applied the default % to every item.', 'success');
  };

  const handleBulkImport = async () => {
    const importable = bulkRows.filter(r => r.valid && !r.duplicate);
    if (!importable.length) return;
    
    let done = 0, failed = 0;
    const p1 = formula.pct1 || 0, p2 = formula.pct2 || 0, pf = formula.pctFloor || 0;
    const currency = formula?.currency || CURRENCY_DEFAULT;
    
    for (const r of importable) {
      try {
        const id = slugId(r.name);
        const item = { name: r.name, costPrice: r.costPrice, amountAdded: 0, pct1: p1, pct2: p2, pctFloor: pf };
        const now = new Date().toISOString();
        
        await LocalDB.collection('items').doc(id).set({ ...item, createdAt: now });
        
        const q = computeQuote(r.costPrice, item);
        await LocalDB.collection('quotes').doc(id).set({ name: r.name, listPrice: r.costPrice, ...q, currency, updatedAt: now });
        await recordHistory(LocalDB, id, {
          costPrice: r.costPrice, amountAdded: 0, listPrice: r.costPrice,
          boundary1: q.boundary1, boundary2: q.boundary2, floorPrice: q.floorPrice,
          pct1: p1, pct2: p2, pctFloor: pf, currency, changedAt: now
        });
        done++;
      } catch (e) {
        failed++;
      }
    }
    toast(`${done} item(s) imported.${failed ? ` ${failed} failed.` : ''}`, failed ? 'error' : 'success');
    setBulkText('');
  };

  const handleShowHistory = async () => {
    if (!histItem) return toast('Choose an item first.', 'error');
    if (histItem === '__all__' && !items.length) return setHistResult([]);
    
    try {
      let rows = [];
      if (histItem === '__all__') {
        const perItem = await Promise.all(items.map(async it => {
          const snap = await LocalDB.doc(`items/${it.id}`).collection('history').orderBy('changedAt', 'desc').limit(200).get();
          return snap.docs.map(d => ({ itemName: it.name, ...d.data() }));
        }));
        rows = perItem.flat().sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
      } else {
        const item = items.find(it => it.id === histItem);
        const snap = await LocalDB.doc(`items/${histItem}`).collection('history').orderBy('changedAt', 'desc').limit(200).get();
        rows = snap.docs.map(d => ({ itemName: item?.name || '', ...d.data() }));
      }
      
      if (histFrom) {
        const fromTime = new Date(histFrom + 'T00:00:00').getTime();
        rows = rows.filter(r => new Date(r.changedAt).getTime() >= fromTime);
      }
      if (histTo) {
        const toTime = new Date(histTo + 'T23:59:59').getTime();
        rows = rows.filter(r => new Date(r.changedAt).getTime() <= toTime);
      }
      
      setHistResult(rows);
    } catch (e) {
      toast('Could not load history.', 'error');
    }
  };

  const filteredItems = items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()));
  const importableCount = bulkRows.filter(r => r.valid && !r.duplicate).length;

  return (
    <>
      <div className="page-head">
        <div><h2>Formula & Items</h2><p className="page-sub">Each item can run its own discount %. Only you see this page.</p></div>
      </div>
      
      {/* Default Formula Section */}
      <div className="card">
        <div className="card-head">
          <h3>Default Formula</h3>
          <p>End User / OEM / Dealer Price = List Price &times; (1 &minus; percentage). Used to prefill new items.</p>
        </div>
        <div className="card-pad">
          <form onSubmit={saveDefaultFormula}>
            <div className="pct-grid">
              <div className="field"><label>End User Price discount %</label><input name="pct1" type="number" step="0.1" min="0" max="100" defaultValue={formula?.pct1 ?? 0} /></div>
              <div className="field"><label>OEM Price discount %</label><input name="pct2" type="number" step="0.1" min="0" max="100" defaultValue={formula?.pct2 ?? 0} /></div>
              <div className="field"><label>Dealer Price discount %</label><input name="pctFloor" type="number" step="0.1" min="0" max="100" defaultValue={formula?.pctFloor ?? 0} /></div>
            </div>
            <div className="field" style={{maxWidth: '160px'}}><label>Currency symbol</label><input name="currency" maxLength="3" defaultValue={formula?.currency || CURRENCY_DEFAULT} /></div>
            <div className="inline-actions" style={{justifyContent: 'flex-start', gap: '10px'}}>
              <button className="btn" type="submit">Save default</button>
              <button className="btn btn-ghost" type="button" onClick={applyDefaultToAll}>Apply default to all items</button>
            </div>
            {formula?.updatedAt && <p className="small-note">Last saved {new Date(formula.updatedAt).toLocaleString()}</p>}
          </form>
        </div>
      </div>

      {/* Items Section */}
      <div className="card">
        <div className="card-head">
          <h3>Items</h3>
          <p>Cost price, amount added, and GP stay private to admins &mdash; your team only ever sees the End User, OEM, and Dealer prices.</p>
        </div>
        <div className="card-pad">
          <form className="form-grid-4" onSubmit={handleAddItem}>
            <div className="field" style={{margin:0}}><label>Name</label><input name="name" required /></div>
            <div className="field" style={{margin:0}}><label>Cost price</label><input name="cost" type="number" step="0.01" min="0" required /></div>
            <div className="field" style={{margin:0}}><label>Amount to add</label><input name="added" type="number" step="0.01" min="0" required /></div>
            <button className="btn" type="submit">Add item</button>
            
            <div className="pct-grid" style={{gridColumn: '1 / -1', marginTop: '10px'}}>
              <div className="field" style={{margin:0}}><label>End User %</label><input name="p1" type="number" step="0.1" min="0" max="100" placeholder={`Default: ${formula?.pct1 ?? 0}`} /></div>
              <div className="field" style={{margin:0}}><label>OEM %</label><input name="p2" type="number" step="0.1" min="0" max="100" placeholder={`Default: ${formula?.pct2 ?? 0}`} /></div>
              <div className="field" style={{margin:0}}><label>Dealer %</label><input name="pf" type="number" step="0.1" min="0" max="100" placeholder={`Default: ${formula?.pctFloor ?? 0}`} /></div>
            </div>
          </form>
          <div className="search-bar" style={{ marginTop: '18px', maxWidth: '100%', marginBottom: 0 }}>
            <span className="search-icon">&#128269;</span>
            <input placeholder="Search item or product..." onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Item</th><th className="num-col">Cost Price</th><th className="num-col">Amount Added</th>
              <th className="num-col">End User %</th><th className="num-col">OEM %</th><th className="num-col">Dealer %</th>
              <th className="num-col">List Price</th><th className="num-col">End User Price</th><th className="num-col">OEM Price</th><th className="num-col">Dealer Price</th><th></th>
            </tr></thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr className="empty-row"><td colSpan="11">No items match.</td></tr>
              ) : (
                filteredItems.map(it => (
                  <EditableRow key={it.id} item={it} formula={formula} onSave={updateItem} onDelete={deleteItem} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Import Section */}
      <div className="card">
        <div className="card-head">
          <h3>Bulk Import</h3>
          <p>Select the Item Name and Cost Price columns in Google Sheets, copy, and paste below &mdash; one item per row.</p>
        </div>
        <div className="card-pad">
          <textarea 
            className="bulk-textarea" 
            placeholder="Paste from Google Sheets here..."
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />
          {bulkRows.length > 0 && (
            <div className="table-scroll" style={{maxHeight:'260px', overflowY:'auto', marginTop:'12px'}}>
              <table>
                <thead><tr><th>Item Name</th><th className="num-col">Cost Price</th><th>Status</th></tr></thead>
                <tbody>
                  {bulkRows.map((r, i) => {
                    let status, cls;
                    if (r.isHeader) { status = 'Header row — skipped'; cls = 'disc-line'; }
                    else if (!r.valid) { status = 'Missing name — skipped'; cls = 'gp-neg'; }
                    else if (r.duplicate) { status = 'Already have this item — skipped'; cls = 'disc-line'; }
                    else { status = 'Will import'; cls = 'gp-pos'; }
                    return (
                      <tr key={i}>
                        <td>{r.name || '(blank)'}</td>
                        <td className="num-col">{r.isHeader ? '' : fmtMoney(r.costPrice, formula?.currency)}</td>
                        <td className={`gp-line ${cls}`} style={{margin:0}}>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="small-note">{importableCount} item(s) ready to import.</p>
            </div>
          )}
          <button className="btn" style={{marginTop:'10px'}} disabled={importableCount === 0} onClick={handleBulkImport}>
            {importableCount ? `Import ${importableCount} item(s)` : 'Import items'}
          </button>
        </div>
      </div>

      {/* Price History Section */}
      <div className="card">
        <div className="card-head">
          <h3>Price History</h3>
          <p>Pick an item and a date range to see what its prices were on any earlier date.</p>
        </div>
        <div className="card-pad">
          <div className="form-grid-4">
            <div className="field" style={{margin:0}}>
              <label>Item</label>
              <select value={histItem} onChange={e => setHistItem(e.target.value)}>
                <option value="__all__">All products</option>
                {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
            <div className="field" style={{margin:0}}><label>From</label><input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)} /></div>
            <div className="field" style={{margin:0}}><label>To</label><input type="date" value={histTo} onChange={e => setHistTo(e.target.value)} /></div>
            <button className="btn" onClick={handleShowHistory}>Show history</button>
          </div>
          
          {histResult && (
            histResult.length === 0 ? (
              <p className="small-note" style={{marginTop: '14px'}}>No price changes recorded in this range yet.</p>
            ) : (
              <div className="table-scroll" style={{marginTop:'14px'}}>
                <table>
                  <thead><tr>
                    <th>Item</th><th>When</th><th className="num-col">Cost Price</th><th className="num-col">Amount Added</th><th className="num-col">List Price</th>
                    <th className="num-col">End User</th><th className="num-col">OEM</th><th className="num-col">Dealer</th>
                  </tr></thead>
                  <tbody>
                    {histResult.map((r, i) => (
                      <tr key={i}>
                        <td className="item-name">{r.itemName}</td>
                        <td>{new Date(r.changedAt).toLocaleString()}</td>
                        <td className="num-col">{fmtMoney(r.costPrice, r.currency)}</td>
                        <td className="num-col">{fmtMoney(r.amountAdded, r.currency)}</td>
                        <td className="num-col">{fmtMoney(r.listPrice, r.currency)}</td>
                        <td className="num-col">{fmtMoney(r.boundary1, r.currency)}</td>
                        <td className="num-col">{fmtMoney(r.boundary2, r.currency)}</td>
                        <td className="num-col floor-cell">{fmtMoney(r.floorPrice, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}
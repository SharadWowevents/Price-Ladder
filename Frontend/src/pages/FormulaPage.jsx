import React, { useState, useEffect } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney, listPriceOf, effectivePct, computeQuote, slugId } from '../lib/utils';
import { GpLine, useToast } from '../components/UI';

const EditableRow = ({ item, formula, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);

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
      <td className="num-col price-cell"><span className="amount">{fmtMoney(listPrice, formula.currency)}</span><GpLine price={listPrice} costPrice={item.costPrice} currency={formula.currency}/></td>
      <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary1, formula.currency)}</span></td>
      <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary2, formula.currency)}</span></td>
      <td className="num-col floor-cell price-cell"><span className="amount">{fmtMoney(q.floorPrice, formula.currency)}</span></td>
      <td>
        <div className="inline-actions">
          <button className="icon-btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="icon-btn" onClick={() => onDelete(item.id)}>Del</button>
        </div>
      </td>
    </tr>
  );

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
          <button className="icon-btn icon-btn-primary" onClick={() => { onSave(form); setEditing(false); }}>Save</button>
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
  const toast = useToast();

  useEffect(() => {
    const unf = LocalDB.doc('config/formula').onSnapshot(snap => setFormula(snap.exists ? snap.data() : formula));
    const uni = LocalDB.collection('items').orderBy('name').onSnapshot(snap => setItems(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unf(); uni(); };
  }, []);

  const handleAddItem = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name');
    const item = {
      name, costPrice: Number(fd.get('cost')), amountAdded: Number(fd.get('added')),
      pct1: Number(fd.get('p1') || formula.pct1), pct2: Number(fd.get('p2') || formula.pct2), pctFloor: Number(fd.get('pf') || formula.pctFloor)
    };
    const id = slugId(name);
    await LocalDB.collection('items').doc(id).set({ ...item, createdAt: new Date().toISOString() });
    
    // Recompute quote
    const q = computeQuote(listPriceOf(item), item);
    await LocalDB.collection('quotes').doc(id).set({ name, listPrice: listPriceOf(item), ...q, currency: formula.currency });
    toast('Item added', 'success');
    e.target.reset();
  };

  const updateItem = async (updated) => {
    await LocalDB.collection('items').doc(updated.id).update(updated);
    const q = computeQuote(listPriceOf(updated), updated);
    await LocalDB.collection('quotes').doc(updated.id).set({ name: updated.name, listPrice: listPriceOf(updated), ...q, currency: formula.currency });
    toast('Item updated', 'success');
  };

  const deleteItem = async (id) => {
    await LocalDB.collection('items').doc(id).delete();
    await LocalDB.collection('quotes').doc(id).delete();
    toast('Deleted', 'success');
  };

  const filteredItems = items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="page-head"><div><h2>Formula & Items</h2></div></div>
      
      {/* Items Section */}
      <div className="card">
        <div className="card-head"><h3>Items</h3></div>
        <div className="card-pad">
          <form className="form-grid-4" onSubmit={handleAddItem}>
            <div className="field" style={{margin:0}}><label>Name</label><input name="name" required /></div>
            <div className="field" style={{margin:0}}><label>Cost</label><input name="cost" type="number" required /></div>
            <div className="field" style={{margin:0}}><label>Add</label><input name="added" type="number" required /></div>
            <button className="btn" type="submit">Add item</button>
          </form>
          <div className="search-bar" style={{ marginTop: '18px', maxWidth: '100%' }}>
            <span className="search-icon">&#128269;</span>
            <input placeholder="Search..." onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Item</th><th className="num-col">Cost</th><th className="num-col">Added</th>
              <th className="num-col">EU %</th><th className="num-col">OEM %</th><th className="num-col">DLR %</th>
              <th className="num-col">List</th><th className="num-col">EU Price</th><th className="num-col">OEM Price</th><th className="num-col">DLR Price</th><th></th>
            </tr></thead>
            <tbody>
              {filteredItems.map(it => (
                <EditableRow key={it.id} item={it} formula={formula} onSave={updateItem} onDelete={deleteItem} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
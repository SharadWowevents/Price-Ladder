import React, { useState, useEffect, useRef } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney, listPriceOf, effectivePct, computeQuote, slugId, recordHistory, parseBulkRows, CURRENCY_DEFAULT } from '../lib/utils';
import { GpLine, useToast } from '../components/UI';

const EditableRow = ({ item, formula, onSave, onDelete, categories }) => {
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
      <td>
        {item.category ? (
          <span className="badge badge-team">{item.category}</span>
        ) : (
          <span style={{ color: 'var(--ink-muted)' }}>—</span>
        )}
      </td>
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
      category: String(form.category || '').trim(),
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
      <td>
        <input 
          value={form.category || ''} 
          onChange={e => setForm({...form, category: e.target.value})} 
          placeholder="Category"
          list="item-categories-list"
          style={{ width: '100%', minWidth: '90px' }}
        />
      </td>
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
  const [categoryFormulas, setCategoryFormulas] = useState({});
  const [items, setItems] = useState([]);
  
  // Category Formula form state
  const [categoryName, setCategoryName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryPct1, setCategoryPct1] = useState(0);
  const [categoryPct2, setCategoryPct2] = useState(0);
  const [categoryPctFloor, setCategoryPctFloor] = useState(0);
  const [currencySymbol, setCurrencySymbol] = useState(CURRENCY_DEFAULT);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryInputRef = useRef(null);

  // Add Item category search state
  const [addCategory, setAddCategory] = useState('');
  const [showAddCategoryDropdown, setShowAddCategoryDropdown] = useState(false);
  const addCategoryRef = useRef(null);

  // Table search & filter state
  const [search, setSearch] = useState('');
  const [tableCategoryFilter, setTableCategoryFilter] = useState('__all__');

  // Pagination state (up to 50 items max)
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

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
    const unf = LocalDB.doc('config/formula').onSnapshot(snap => {
      if (snap.exists) {
        const d = snap.data();
        setFormula(d);
        if (d.currency) setCurrencySymbol(d.currency);
        // If user hasn't selected a specific category yet, initialize inputs from defaults
        if (!categoryName) {
          setCategoryPct1(d.pct1 ?? 0);
          setCategoryPct2(d.pct2 ?? 0);
          setCategoryPctFloor(d.pctFloor ?? 0);
        }
      }
    });

    const unc = LocalDB.doc('config/categoryFormulas').onSnapshot(snap => {
      if (snap.exists) {
        setCategoryFormulas(snap.data() || {});
      }
    });

    const uni = LocalDB.collection('items').orderBy('name').onSnapshot(snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unf(); unc(); uni(); };
  }, []);

  useEffect(() => {
    setBulkRows(parseBulkRows(bulkText, items));
  }, [bulkText, items]);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryInputRef.current && !categoryInputRef.current.contains(e.target)) {
        setShowCategorySuggestions(false);
      }
      if (addCategoryRef.current && !addCategoryRef.current.contains(e.target)) {
        setShowAddCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute distinct categories across saved category formulas and existing items
  const allCategories = Array.from(
    new Set([
      ...Object.keys(categoryFormulas).map(k => k.trim()).filter(Boolean),
      ...items.map(it => (it.category || '').trim()).filter(Boolean)
    ])
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const categoryCounts = items.reduce((acc, it) => {
    const cat = (it.category || '').trim().toLowerCase();
    if (cat) acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // Retrieve previously filled / saved values for a category
  const getCategoryValues = (catName) => {
    if (!catName) return { pct1: formula?.pct1 ?? 0, pct2: formula?.pct2 ?? 0, pctFloor: formula?.pctFloor ?? 0 };
    const normalized = catName.trim().toLowerCase();

    // 1. Check in saved categoryFormulas
    const key = Object.keys(categoryFormulas).find(k => k.toLowerCase() === normalized);
    if (key && categoryFormulas[key]) {
      return {
        pct1: categoryFormulas[key].pct1 ?? 0,
        pct2: categoryFormulas[key].pct2 ?? 0,
        pctFloor: categoryFormulas[key].pctFloor ?? 0,
        currency: categoryFormulas[key].currency || formula?.currency || CURRENCY_DEFAULT
      };
    }

    // 2. Check in existing items belonging to this category
    const itemWithCat = items.find(it => (it.category || '').trim().toLowerCase() === normalized && (it.pct1 !== undefined || it.pct2 !== undefined || it.pctFloor !== undefined));
    if (itemWithCat) {
      return {
        pct1: itemWithCat.pct1 ?? formula?.pct1 ?? 0,
        pct2: itemWithCat.pct2 ?? formula?.pct2 ?? 0,
        pctFloor: itemWithCat.pctFloor ?? formula?.pctFloor ?? 0,
        currency: formula?.currency || CURRENCY_DEFAULT
      };
    }

    // 3. Fallback to formula defaults
    return {
      pct1: formula?.pct1 ?? 0,
      pct2: formula?.pct2 ?? 0,
      pctFloor: formula?.pctFloor ?? 0,
      currency: formula?.currency || CURRENCY_DEFAULT
    };
  };

  // Suggestions filter for Category Name input:
  // Shows matching categories based on input text; if no similar name matches, shows nothing
  const matchingSuggestions = categoryName.trim()
    ? allCategories.filter(cat => cat.toLowerCase().includes(categoryName.trim().toLowerCase()))
    : [];

  // When user clicks a category from the suggestions dropdown
  const handleSelectCategory = (cat) => {
    setCategoryName(cat);
    setSelectedCategory(cat);
    setShowCategorySuggestions(false);

    // Put previous filled values of the category into the inputs
    const prevVals = getCategoryValues(cat);
    setCategoryPct1(prevVals.pct1);
    setCategoryPct2(prevVals.pct2);
    setCategoryPctFloor(prevVals.pctFloor);
    if (prevVals.currency) {
      setCurrencySymbol(prevVals.currency);
    }
  };

  // When user saves changes for the category formula
  const handleSaveCategoryFormula = async (e) => {
    e.preventDefault();
    const cat = categoryName.trim();
    if (!cat) {
      return toast('Please enter or select a category name.', 'error');
    }

    const p1 = Number(categoryPct1) || 0;
    const p2 = Number(categoryPct2) || 0;
    const pf = Number(categoryPctFloor) || 0;
    const curr = currencySymbol.trim() || CURRENCY_DEFAULT;
    const now = new Date().toISOString();

    // 1. Save category formula mapping
    const updatedFormulas = {
      ...categoryFormulas,
      [cat]: {
        pct1: p1,
        pct2: p2,
        pctFloor: pf,
        currency: curr,
        updatedAt: now
      }
    };
    await LocalDB.doc('config/categoryFormulas').set(updatedFormulas);
    setCategoryFormulas(updatedFormulas);

    // 2. Also keep default formula config updated
    const updatedFormula = {
      ...formula,
      pct1: p1,
      pct2: p2,
      pctFloor: pf,
      currency: curr,
      updatedAt: now
    };
    await LocalDB.doc('config/formula').set(updatedFormula);
    setFormula(updatedFormula);

    // 3. Apply changes to all existing items belonging to this category
    const matching = items.filter(it => (it.category || '').trim().toLowerCase() === cat.toLowerCase());
    if (matching.length > 0) {
      const writes = matching.map(async (it) => {
        const updated = { ...it, pct1: p1, pct2: p2, pctFloor: pf };
        const listPrice = listPriceOf(updated);
        const q = computeQuote(listPrice, updated);

        await LocalDB.collection('items').doc(it.id).update({ pct1: p1, pct2: p2, pctFloor: pf });
        await LocalDB.collection('quotes').doc(it.id).set({
          name: it.name,
          category: it.category || '',
          listPrice,
          ...q,
          currency: curr,
          updatedAt: now
        });
        await recordHistory(LocalDB, it.id, {
          category: it.category || '',
          costPrice: Number(it.costPrice) || 0,
          amountAdded: Number(it.amountAdded) || 0,
          listPrice,
          boundary1: q.boundary1,
          boundary2: q.boundary2,
          floorPrice: q.floorPrice,
          pct1: p1,
          pct2: p2,
          pctFloor: pf,
          currency: curr,
          changedAt: now
        });
      });
      await Promise.all(writes);
      toast(`Category "${cat}" saved. Updated ${matching.length} item(s).`, 'success');
    } else {
      toast(`Category "${cat}" saved with End User: ${p1}%, OEM: ${p2}%, Dealer: ${pf}%.`, 'success');
    }

    setSelectedCategory(cat);
  };

  // Category search filter in Add Item
  const matchingAddCategories = addCategory.trim()
    ? allCategories.filter(cat => cat.toLowerCase().includes(addCategory.trim().toLowerCase()))
    : allCategories;

  const handleAddItem = async (e) => {
    e.preventDefault();
    const formEl = e.target;
    const fd = new FormData(formEl);
    const name = fd.get('name');
    const category = String(addCategory || fd.get('category') || '').trim();
    const costPrice = Number(fd.get('cost'));
    const amountAdded = Number(fd.get('added'));
    
    // If % was left empty, prefill from category formula or global default
    const catVals = category ? getCategoryValues(category) : formula;
    const rawP1 = fd.get('p1');
    const rawP2 = fd.get('p2');
    const rawPf = fd.get('pf');
    const pct1 = rawP1 !== '' && rawP1 !== null ? Number(rawP1) : (catVals?.pct1 ?? 0);
    const pct2 = rawP2 !== '' && rawP2 !== null ? Number(rawP2) : (catVals?.pct2 ?? 0);
    const pctFloor = rawPf !== '' && rawPf !== null ? Number(rawPf) : (catVals?.pctFloor ?? 0);
    
    const item = {
      name, category, costPrice, amountAdded,
      pct1, pct2, pctFloor
    };
    const id = slugId(name);
    const now = new Date().toISOString();
    
    const listPrice = listPriceOf(item);
    const q = computeQuote(listPrice, item);
    const currency = formula?.currency || CURRENCY_DEFAULT;
    
    await LocalDB.collection('quotes').doc(id).set({ name, category, listPrice, ...q, currency, updatedAt: now });
    await recordHistory(LocalDB, id, {
      category,
      costPrice, amountAdded, listPrice,
      boundary1: q.boundary1, boundary2: q.boundary2, floorPrice: q.floorPrice,
      pct1, pct2, pctFloor, currency, changedAt: now
    });
    await LocalDB.collection('items').doc(id).set({ ...item, createdAt: now });
    
    formEl.reset();
    setAddCategory('');
    setShowAddCategoryDropdown(false);
    toast('Item added', 'success');
  };

  const updateItem = async (updated, onDoneEditing) => {
    const listPrice = listPriceOf(updated);
    const q = computeQuote(listPrice, updated);
    const currency = formula?.currency || CURRENCY_DEFAULT;
    const now = new Date().toISOString();
    
    await LocalDB.collection('quotes').doc(updated.id).set({
      name: updated.name,
      category: updated.category || '',
      listPrice,
      ...q,
      currency,
      updatedAt: now
    });
    await recordHistory(LocalDB, updated.id, {
      category: updated.category || '',
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

  const handleBulkImport = async () => {
    const importable = bulkRows.filter(r => r.valid && !r.duplicate);
    if (!importable.length) return;
    
    let done = 0, failed = 0;
    const p1 = formula.pct1 || 0, p2 = formula.pct2 || 0, pf = formula.pctFloor || 0;
    const currency = formula?.currency || CURRENCY_DEFAULT;
    
    for (const r of importable) {
      try {
        const id = slugId(r.name);
        const item = { name: r.name, category: r.category || '', costPrice: r.costPrice, amountAdded: 0, pct1: p1, pct2: p2, pctFloor: pf };
        const now = new Date().toISOString();
        
        await LocalDB.collection('items').doc(id).set({ ...item, createdAt: now });
        
        const q = computeQuote(r.costPrice, item);
        await LocalDB.collection('quotes').doc(id).set({ name: r.name, category: r.category || '', listPrice: r.costPrice, ...q, currency, updatedAt: now });
        await recordHistory(LocalDB, id, {
          category: r.category || '',
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

  // Filter items by search query and category filter
  const filteredItems = items.filter(it => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || 
      it.name.toLowerCase().includes(q) || 
      (it.category && it.category.toLowerCase().includes(q));
    const matchesCategory = tableCategoryFilter === '__all__' || 
      (it.category || '').toLowerCase() === tableCategoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // Pagination calculations (max items up to 50 in list)
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safeCurrentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const paginatedItems = filteredItems.slice(startIdx, endIdx);

  // Pagination page numbers generator with smart ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [1];
    if (safeCurrentPage > 3) pages.push('ellipsis-1');
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (safeCurrentPage < totalPages - 2) pages.push('ellipsis-2');
    pages.push(totalPages);
    return pages;
  };

  const importableCount = bulkRows.filter(r => r.valid && !r.duplicate).length;

  return (
    <>
      <div className="page-head">
        <div><h2>Formula & Items</h2><p className="page-sub">Each item can run its own discount %. Only you see this page.</p></div>
      </div>
      
      {/* Category Formula Section */}
      <div className="card">
        <div className="card-head">
          <h3>Default Formula</h3>
          <p>End User / OEM / Dealer Price = List Price &times; (1 &minus; percentage). Set category formula to update or prefill items.</p>
        </div>
        <div className="card-pad">
          <form onSubmit={handleSaveCategoryFormula}>
            <div className="pct-grid">
              <div className="field">
                <label>End User Price discount %</label>
                <input 
                  name="pct1" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  value={categoryPct1} 
                  onChange={e => setCategoryPct1(e.target.value)} 
                />
              </div>
              <div className="field">
                <label>OEM Price discount %</label>
                <input 
                  name="pct2" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  value={categoryPct2} 
                  onChange={e => setCategoryPct2(e.target.value)} 
                />
              </div>
              <div className="field">
                <label>Dealer Price discount %</label>
                <input 
                  name="pctFloor" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  value={categoryPctFloor} 
                  onChange={e => setCategoryPctFloor(e.target.value)} 
                />
              </div>
            </div>

            {/* Currency Symbol and Category Name Input with Suggestions */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginTop: '4px', flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0, width: '140px' }}>
                <label>Currency symbol</label>
                <input 
                  name="currency" 
                  maxLength="3" 
                  value={currencySymbol} 
                  onChange={e => setCurrencySymbol(e.target.value)} 
                />
              </div>
              <div className="field" style={{ margin: 0, position: 'relative', flex: 1, minWidth: '240px' }} ref={categoryInputRef}>
                <label>Category Name</label>
                <div className="category-search-wrap">
                  <input 
                    type="text"
                    className="category-search-input"
                    placeholder="Enter category name..."
                    value={categoryName}
                    onChange={e => {
                      const val = e.target.value;
                      setCategoryName(val);
                      setSelectedCategory('');
                      setShowCategorySuggestions(Boolean(val.trim()));
                    }}
                    onFocus={() => {
                      if (categoryName.trim()) setShowCategorySuggestions(true);
                    }}
                    autoComplete="off"
                  />
                  {categoryName && (
                    <button
                      type="button"
                      className="category-clear-btn"
                      onClick={() => {
                        setCategoryName('');
                        setSelectedCategory('');
                        setShowCategorySuggestions(false);
                        setCategoryPct1(formula?.pct1 ?? 0);
                        setCategoryPct2(formula?.pct2 ?? 0);
                        setCategoryPctFloor(formula?.pctFloor ?? 0);
                      }}
                      title="Clear category"
                    >
                      &times;
                    </button>
                  )}
                  {/* Suggestions dropdown: only shown if there are matching similar names */}
                  {showCategorySuggestions && matchingSuggestions.length > 0 && (
                    <div className="category-dropdown">
                      {matchingSuggestions.map(cat => (
                        <div 
                          key={cat}
                          className={`category-dropdown-item ${selectedCategory.toLowerCase() === cat.toLowerCase() ? 'selected' : ''}`}
                          onMouseDown={() => handleSelectCategory(cat)}
                        >
                          <span>{cat}</span>
                          <span className="badge badge-team" style={{ fontSize: '10px' }}>
                            {categoryCounts[cat.toLowerCase()] || 0} item{(categoryCounts[cat.toLowerCase()] || 0) === 1 ? '' : 's'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Single Action Button to save changes */}
            <div className="inline-actions" style={{ justifyContent: 'flex-start', marginTop: '16px' }}>
              <button className="btn" type="submit">
                {selectedCategory ? 'Save changes' : 'Save Category'}
              </button>
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
          {/* Add Item Form with Category Selector */}
          <form className="form-grid-5" onSubmit={handleAddItem}>
            <div className="field" style={{ margin: 0 }}><label>Name</label><input name="name" required /></div>
            
            <div className="field" style={{ margin: 0, position: 'relative' }} ref={addCategoryRef}>
              <label>Category</label>
              <div className="category-search-wrap">
                <input 
                  name="category"
                  value={addCategory}
                  onChange={e => {
                    setAddCategory(e.target.value);
                    setShowAddCategoryDropdown(true);
                  }}
                  onFocus={() => setShowAddCategoryDropdown(true)}
                  placeholder="Select or enter category..."
                  autoComplete="off"
                />
                {addCategory && (
                  <button
                    type="button"
                    className="category-clear-btn"
                    onClick={() => {
                      setAddCategory('');
                      setShowAddCategoryDropdown(false);
                    }}
                    title="Clear"
                  >
                    &times;
                  </button>
                )}
                {showAddCategoryDropdown && matchingAddCategories.length > 0 && (
                  <div className="category-dropdown">
                    {matchingAddCategories.map(cat => (
                      <div 
                        key={cat}
                        className={`category-dropdown-item ${addCategory.toLowerCase() === cat.toLowerCase() ? 'selected' : ''}`}
                        onMouseDown={() => {
                          setAddCategory(cat);
                          setShowAddCategoryDropdown(false);
                        }}
                      >
                        <span>{cat}</span>
                        <span className="badge badge-team" style={{ fontSize: '10px' }}>
                          {categoryCounts[cat.toLowerCase()] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}><label>Cost price</label><input name="cost" type="number" step="0.01" min="0" required /></div>
            <div className="field" style={{ margin: 0 }}><label>Amount to add</label><input name="added" type="number" step="0.01" min="0" required /></div>
            <button className="btn" type="submit">Add item</button>
            
            <div className="pct-grid" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>End User %</label>
                <input 
                  name="p1" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  placeholder={`Default: ${(addCategory ? getCategoryValues(addCategory).pct1 : formula?.pct1) ?? 0}`} 
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>OEM %</label>
                <input 
                  name="p2" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  placeholder={`Default: ${(addCategory ? getCategoryValues(addCategory).pct2 : formula?.pct2) ?? 0}`} 
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Dealer %</label>
                <input 
                  name="pf" 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="100" 
                  placeholder={`Default: ${(addCategory ? getCategoryValues(addCategory).pctFloor : formula?.pctFloor) ?? 0}`} 
                />
              </div>
            </div>
          </form>

          {/* Search bar & Category filter */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar" style={{ margin: 0, flex: 1, minWidth: '220px' }}>
              <span className="search-icon">&#128269;</span>
              <input 
                placeholder="Search item or category..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
              />
            </div>
            <div style={{ minWidth: '180px' }}>
              <select 
                value={tableCategoryFilter} 
                onChange={e => { setTableCategoryFilter(e.target.value); setCurrentPage(1); }}
                style={{
                  padding: '9px 11px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                  width: '100%',
                  outline: 'none'
                }}
              >
                <option value="__all__">All categories ({allCategories.length})</option>
                {allCategories.map(c => (
                  <option key={c} value={c}>{c} ({categoryCounts[c.toLowerCase()] || 0})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Items Table with Category Column */}
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Item</th>
              <th>Category</th>
              <th className="num-col">Cost Price</th>
              <th className="num-col">Amount Added</th>
              <th className="num-col">End User %</th>
              <th className="num-col">OEM %</th>
              <th className="num-col">Dealer %</th>
              <th className="num-col">List Price</th>
              <th className="num-col">End User Price</th>
              <th className="num-col">OEM Price</th>
              <th className="num-col">Dealer Price</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr className="empty-row"><td colSpan="12">No items match.</td></tr>
              ) : (
                paginatedItems.map(it => (
                  <EditableRow 
                    key={it.id} 
                    item={it} 
                    formula={formula} 
                    onSave={updateItem} 
                    onDelete={deleteItem}
                    categories={allCategories}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar with Page Size Selector up to 50 items */}
        {totalItems > 0 && (
          <div className="pagination-bar">
            <div className="pagination-left">
              <span>Showing <strong>{startIdx + 1}</strong>&ndash;<strong>{endIdx}</strong> of <strong>{totalItems}</strong> items</span>
            </div>
            <div className="pagination-right">
              <div className="pagination-size-select">
                <label htmlFor="pageSizeSelect">Show</label>
                <select 
                  id="pageSizeSelect"
                  value={pageSize} 
                  onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                >
                  <option value={10}>10 items</option>
                  <option value={20}>20 items</option>
                  <option value={30}>30 items</option>
                  <option value={50}>50 items (max)</option>
                </select>
              </div>

              <div className="pagination-nav">
                <button 
                  type="button"
                  className="page-btn" 
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  &laquo;
                </button>
                <button 
                  type="button"
                  className="page-btn" 
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  title="Previous Page"
                >
                  &lsaquo;
                </button>

                {getPageNumbers().map((p, idx) => {
                  if (typeof p === 'string') {
                    return <span key={`ellipsis-${idx}`} className="page-ellipsis">&hellip;</span>;
                  }
                  return (
                    <button 
                      type="button"
                      key={p} 
                      className={`page-btn ${safeCurrentPage === p ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}

                <button 
                  type="button"
                  className="page-btn" 
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  title="Next Page"
                >
                  &rsaquo;
                </button>
                <button 
                  type="button"
                  className="page-btn" 
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                >
                  &raquo;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Datalist for categories to aid browser autocomplete */}
      <datalist id="item-categories-list">
        {allCategories.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Bulk Import Section */}
      <div className="card">
        <div className="card-head">
          <h3>Bulk Import</h3>
          <p>Select the Item Name and Cost Price (and optional Category) columns in Google Sheets, copy, and paste below &mdash; one item per row.</p>
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
                <thead><tr><th>Item Name</th><th>Category</th><th className="num-col">Cost Price</th><th>Status</th></tr></thead>
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
                        <td>{r.category ? <span className="badge badge-team">{r.category}</span> : '—'}</td>
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
                {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.category ? ` (${it.category})` : ''}</option>)}
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

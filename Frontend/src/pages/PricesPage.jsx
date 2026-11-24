import React, { useState, useEffect } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney } from '../lib/utils';
import { DiscountLine } from '../components/UI';

export default function PricesPage({ role }) {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('__all__');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    return LocalDB.collection('quotes').orderBy('name').onSnapshot(snap => {
      setQuotes(snap.docs.map(d => d.data()));
    });
  }, []);

  const allCategories = Array.from(
    new Set(quotes.map(q => (q.category || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const categoryCounts = quotes.reduce((acc, q) => {
    const cat = (q.category || '').trim().toLowerCase();
    if (cat) acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const filtered = quotes.filter(q => {
    const s = search.trim().toLowerCase();
    const matchesSearch = !s || 
      (q.name && q.name.toLowerCase().includes(s)) ||
      (q.category && q.category.toLowerCase().includes(s));
    const matchesCategory = categoryFilter === '__all__' || 
      (q.category || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safeCurrentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const paginatedQuotes = filtered.slice(startIdx, endIdx);

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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Price List</h2>
          <p className="page-sub">Quote at the End User Price first. Don’t go below Dealer Price.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar" style={{ margin: 0, flex: 1, minWidth: '220px' }}>
              <span className="search-icon">&#128269;</span>
              <input 
                placeholder="Search item or category..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
              />
            </div>
            {allCategories.length > 0 && (
              <div style={{ minWidth: '180px' }}>
                <select 
                  value={categoryFilter} 
                  onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
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
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Item</th>
              <th>Category</th>
              <th className="num-col">List Price</th>
              <th className="num-col">End User</th>
              <th className="num-col">OEM</th>
              <th className="num-col">Dealer</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="empty-row"><td colSpan="6">No items found.</td></tr>
              ) : (
                paginatedQuotes.map((q, i) => (
                  <tr key={i}>
                    <td className="item-name">{q.name}</td>
                    <td>
                      {q.category ? (
                        <span className="badge badge-team">{q.category}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="num-col price-cell"><span className="amount">{fmtMoney(q.listPrice, q.currency)}</span><DiscountLine listPrice={q.listPrice} price={q.listPrice} /></td>
                    <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary1, q.currency)}</span><DiscountLine listPrice={q.listPrice} price={q.boundary1} /></td>
                    <td className="num-col price-cell"><span className="amount">{fmtMoney(q.boundary2, q.currency)}</span><DiscountLine listPrice={q.listPrice} price={q.boundary2} /></td>
                    <td className="num-col floor-cell price-cell"><span className="amount">{fmtMoney(q.floorPrice, q.currency)}</span><DiscountLine listPrice={q.listPrice} price={q.floorPrice} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div className="pagination-bar">
            <div className="pagination-left">
              <span>Showing <strong>{startIdx + 1}</strong>&ndash;<strong>{endIdx}</strong> of <strong>{totalItems}</strong> items</span>
            </div>
            <div className="pagination-right">
              <div className="pagination-size-select">
                <label htmlFor="pricePageSizeSelect">Show</label>
                <select 
                  id="pricePageSizeSelect"
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
    </>
  );
}

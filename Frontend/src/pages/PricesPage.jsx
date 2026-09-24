import React, { useState, useEffect } from 'react';
import { LocalDB } from '../lib/db';
import { fmtMoney } from '../lib/utils';
import { DiscountLine } from '../components/UI';

export default function PricesPage({ role }) {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return LocalDB.collection('quotes').orderBy('name').onSnapshot(snap => {
      setQuotes(snap.docs.map(d => d.data()));
    });
  }, []);

  const filtered = quotes.filter(q => q.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Price List</h2>
          <p className="page-sub">Quote at the End User Price first. Don’t go below Dealer Price.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="search-bar">
            <span className="search-icon">&#128269;</span>
            <input placeholder="Search item..." onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Item</th><th className="num-col">List Price</th><th className="num-col">End User</th><th className="num-col">OEM</th><th className="num-col">Dealer</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="empty-row"><td colSpan="5">No items found.</td></tr>
              ) : (
                filtered.map((q, i) => (
                  <tr key={i}>
                    <td className="item-name">{q.name}</td>
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
      </div>
    </>
  );
}
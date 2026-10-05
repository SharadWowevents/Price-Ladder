export const CURRENCY_DEFAULT = '₹';

export const fmtMoney = (n, currency = CURRENCY_DEFAULT) => {
  const v = Number(n);
  return isFinite(v) ? currency + v.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—';
};

export const computeQuote = (basicPrice, formula) => {
  const b = Number(basicPrice) || 0;
  const p1 = Number(formula?.pct1) || 0;
  const p2 = Number(formula?.pct2) || 0;
  const pf = Number(formula?.pctFloor) || 0;
  return {
    boundary1: Math.round(b * (1 - p1/100) * 100) / 100,
    boundary2: Math.round(b * (1 - p2/100) * 100) / 100,
    floorPrice: Math.round(b * (1 - pf/100) * 100) / 100
  };
};

export const computeGP = (price, costPrice) => {
  const p = Number(price), c = Number(costPrice);
  if (!isFinite(p) || !isFinite(c) || p === 0) return {rupees: 0, percent: 0, valid: false};
  const rupees = Math.round((p - c) * 100) / 100;
  return {rupees, percent: Math.round((rupees / p) * 1000) / 10, valid: true};
};

export const listPriceOf = (it) => (Number(it.costPrice) || 0) + (Number(it.amountAdded) || 0);

export const effectivePct = (it, formula) => ({
  pct1: (it.pct1 !== undefined && it.pct1 !== null) ? it.pct1 : (formula?.pct1 || 0),
  pct2: (it.pct2 !== undefined && it.pct2 !== null) ? it.pct2 : (formula?.pct2 || 0),
  pctFloor: (it.pctFloor !== undefined && it.pctFloor !== null) ? it.pctFloor : (formula?.pctFloor || 0)
});

export const slugId = (name) => (String(name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'item') + '-' + Math.random().toString(36).slice(2,7);

export const recordHistory = async (db, itemId, entry) => {
  try {
    await db.doc(`items/${itemId}`).collection('history').add(entry);
  } catch (e) {
    // history is a nice-to-have, not critical
  }
};

export const recomputeAllQuotes = async (db, formula, items) => {
  const currency = formula?.currency || CURRENCY_DEFAULT;
  const now = new Date().toISOString();
  const writes = [];
  
  for (const it of items) {
    const listPrice = listPriceOf(it);
    const pct = effectivePct(it, formula);
    const q = computeQuote(listPrice, pct);
    
    writes.push(db.collection('quotes').doc(it.id).set({
      name: it.name,
      listPrice,
      boundary1: q.boundary1,
      boundary2: q.boundary2,
      floorPrice: q.floorPrice,
      currency,
      updatedAt: now
    }));
    
    writes.push(recordHistory(db, it.id, {
      costPrice: Number(it.costPrice) || 0,
      amountAdded: Number(it.amountAdded) || 0,
      listPrice,
      boundary1: q.boundary1, boundary2: q.boundary2, floorPrice: q.floorPrice,
      pct1: pct.pct1, pct2: pct.pct2, pctFloor: pct.pctFloor,
      currency, changedAt: now
    }));
  }
  await Promise.all(writes);
};

export const parseBulkRows = (text, existingItems) => {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/,'')).filter(l => l.trim().length);
  const existingNames = new Set(existingItems.map(it => it.name.trim().toLowerCase()));
  const seenInPaste = new Set();
  
  return lines.map((line, idx) => {
    const cols = line.includes('\t') ? line.split('\t') : line.split(',');
    const name = (cols[0] || '').trim();
    const priceRaw = (cols[1] || '').trim();
    const priceNum = parseFloat(priceRaw.replace(/[^0-9.\-]/g, ''));
    const looksLikeHeader = idx === 0 && isNaN(priceNum) && /^(item|name|product)/i.test(name);
    const key = name.toLowerCase();
    const duplicate = !looksLikeHeader && name && (existingNames.has(key) || seenInPaste.has(key));
    if (!looksLikeHeader && name) seenInPaste.add(key);
    
    return {
      name,
      costPrice: isNaN(priceNum) ? 0 : priceNum,
      isHeader: looksLikeHeader,
      valid: !looksLikeHeader && name.length > 0,
      duplicate
    };
  });
};
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
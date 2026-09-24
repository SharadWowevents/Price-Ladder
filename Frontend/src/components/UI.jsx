import React, { createContext, useContext, useState, useEffect } from 'react';
import { computeGP } from '../lib/utils';

export const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  
  const toast = (text, kind) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind || ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

export const Modal = ({ title, hint, onConfirm, onCancel, confirmText = 'Delete', danger = true, children }) => (
  <div className="modal-overlay" onClick={(e) => e.target.className === 'modal-overlay' && onCancel()}>
    <div className="modal">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : ''}`} onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>
);

export const GpLine = ({ price, costPrice, currency }) => {
  const gp = computeGP(price, costPrice);
  if (!gp.valid) return null;
  const sign = gp.rupees > 0 ? '+' : '';
  return (
    <div className={`gp-line ${gp.rupees < 0 ? 'gp-neg' : 'gp-pos'}`}>
      GP {sign}{gp.rupees} &middot; {sign}{gp.percent}%
    </div>
  );
};

export const DiscountLine = ({ listPrice, price }) => {
  const l = Number(listPrice), p = Number(price);
  if (!isFinite(l) || l === 0) return null;
  const pct = Math.round(((l - p) / l) * 1000) / 10;
  return <div className="gp-line disc-line">{pct}% off list</div>;
};
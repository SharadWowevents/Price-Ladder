import React, { useState, useEffect } from 'react';
import { LocalDB, hashPassword, randomSalt } from './lib/db';
import { ToastProvider, useToast } from './components/UI';
import PricesPage from './pages/PricesPage';
import FormulaPage from './pages/FormulaPage';
import UsersPage from './pages/UsersPage';
import BackupPage from './pages/BackupPage';
import './index.css';

const SESSION_KEY = 'priceLadderSession';

function Shell({ user, onLogout }) {
  const [tab, setTab] = useState('prices');
  const [showChangePw, setShowChangePw] = useState(false);
  const isAdmin = user.role === 'admin';
  const toast = useToast();

  const handleChangePw = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const cur = fd.get('current');
    const next = fd.get('newPw');
    
    if (!next || next.length < 6) return toast('New password needs at least 6 characters.', 'error');
    
    const snap = await LocalDB.collection('users').doc(user.email).get();
    const u = snap.data();
    const curHash = await hashPassword(cur, u.salt);
    if (curHash !== u.passwordHash) return toast('Current password is wrong.', 'error');
    
    const salt = randomSalt();
    const passwordHash = await hashPassword(next, salt);
    await LocalDB.collection('users').doc(user.email).update({ salt, passwordHash });
    toast('Password updated.', 'success');
    setShowChangePw(false);
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">PL</span> Price Ladder</div>
        {isAdmin && (
          <div className="tabs">
            <div className={`tab ${tab === 'prices' ? 'active' : ''}`} onClick={() => setTab('prices')}>Price List</div>
            <div className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Manage Users</div>
            <div className={`tab ${tab === 'formula' ? 'active' : ''}`} onClick={() => setTab('formula')}>Formula & Items</div>
            <div className={`tab ${tab === 'backup' ? 'active' : ''}`} onClick={() => setTab('backup')}>Backup & Restore</div>
          </div>
        )}
        <div className="spacer"></div>
        <div className="who">
          <span className={`role-badge ${isAdmin ? 'badge-admin' : ''}`}>{isAdmin ? 'Admin' : 'Team'}</span>
          <span>{user.name}</span>
          <button className="link-btn" onClick={() => setShowChangePw(true)}>Change password</button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Log out</button>
        </div>
      </div>
      <div className="content">
        {tab === 'prices' && <PricesPage role={user.role} />}
        {tab === 'users' && isAdmin && <UsersPage currentUser={user} />}
        {tab === 'formula' && isAdmin && <FormulaPage />}
        {tab === 'backup' && isAdmin && <BackupPage />}
      </div>
      
      {showChangePw && (
        <div className="modal-overlay" onClick={(e) => e.target.className === 'modal-overlay' && setShowChangePw(false)}>
          <div className="modal">
            <h3>Change your password</h3>
            <p className="hint">Signed in as {user.email}</p>
            <form onSubmit={handleChangePw}>
              <div className="field"><label>Current password</label><input name="current" type="password" required /></div>
              <div className="field"><label>New password</label><input name="newPw" type="password" minLength="6" required /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowChangePw(false)}>Cancel</button>
                <button type="submit" className="btn">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthWall({ onLogin }) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    LocalDB.collection('users').limit(1).get().then(snap => {
      if (snap.empty) setNeedsSetup(true);
      else {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (session?.email) {
          LocalDB.collection('users').doc(session.email).get().then(uSnap => {
            if (uSnap.exists) onLogin(uSnap.data());
          });
        }
      }
      setLoading(false);
    });
  }, [onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email').trim().toLowerCase();
    const pw = fd.get('password');
    
    if (needsSetup) {
      if (pw !== fd.get('password2')) return toast('Passwords do not match', 'error');
      const salt = randomSalt();
      const passwordHash = await hashPassword(pw, salt);
      const user = { email, name: fd.get('name'), role: 'admin', salt, passwordHash };
      await LocalDB.collection('users').doc(email).set(user);
      await LocalDB.doc('config/formula').set({ pct1: 0, pct2: 0, pctFloor: 0, currency: '₹' });
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
      onLogin(user);
      toast('Admin created', 'success');
    } else {
      const snap = await LocalDB.collection('users').doc(email).get();
      if (!snap.exists) return toast('No account found', 'error');
      const u = snap.data();
      const hash = await hashPassword(pw, u.salt);
      if (hash !== u.passwordHash) return toast('Wrong password', 'error');
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
      onLogin(u);
    }
  };

  if (loading) return <div className="center-screen"><div className="fatal"><h1>Loading...</h1></div></div>;

  return (
    <div className="center-screen">
      <div className="auth-card">
        <h1>{needsSetup ? 'Create Admin' : 'Sign In'}</h1>
        <form onSubmit={handleSubmit}>
          {needsSetup && <div className="field"><label>Name</label><input name="name" required /></div>}
          <div className="field"><label>Email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Password</label><input name="password" type="password" required /></div>
          {needsSetup && <div className="field"><label>Confirm</label><input name="password2" type="password" required /></div>}
          <button className="btn btn-block" type="submit">{needsSetup ? 'Setup' : 'Login'}</button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <ToastProvider>
      {user ? <Shell user={user} onLogout={handleLogout} /> : <AuthWall onLogin={setUser} />}
    </ToastProvider>
  );
}
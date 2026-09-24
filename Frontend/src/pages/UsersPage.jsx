import React, { useState, useEffect } from 'react';
import { LocalDB, hashPassword, randomSalt } from '../lib/db';
import { useToast, Modal } from '../components/UI';

export default function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // { type: 'delete' | 'reset', user: Object }
  const toast = useToast();

  useEffect(() => {
    // Listen for real-time updates to the users collection
    const unsub = LocalDB.collection('users').orderBy('name').onSnapshot(snap => {
      setUsers(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    const email = fd.get('email').trim().toLowerCase();
    const pw = fd.get('password');
    const role = fd.get('role');

    const existing = await LocalDB.collection('users').doc(email).get();
    if (existing.exists) {
      return toast('A user with that email already exists.', 'error');
    }

    const salt = randomSalt();
    const passwordHash = await hashPassword(pw, salt);
    
    await LocalDB.collection('users').doc(email).set({
      email, 
      name, 
      role, 
      salt, 
      passwordHash, 
      createdAt: new Date().toISOString()
    });
    
    toast('User created successfully.', 'success');
    e.target.reset();
  };

  const confirmDelete = async (email, role) => {
    if (email === currentUser.email) {
      toast("You can't remove your own account.", 'error');
      setModal(null);
      return;
    }
    if (role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      toast('At least one admin must remain.', 'error');
      setModal(null);
      return;
    }
    
    await LocalDB.collection('users').doc(email).delete();
    toast('User removed.', 'success');
    setModal(null);
  };

  const confirmReset = async (email) => {
    const input = document.getElementById('resetPwInput');
    const pw = input?.value;
    
    if (!pw || pw.length < 6) {
      return toast('Password needs at least 6 characters.', 'error');
    }
    
    const salt = randomSalt();
    const passwordHash = await hashPassword(pw, salt);
    await LocalDB.collection('users').doc(email).update({ salt, passwordHash });
    
    toast('Password reset successfully.', 'success');
    setModal(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Manage Users</h2>
          <p className="page-sub">Create logins for your team. They’ll only ever see the price list.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Add a user</h3></div>
        <div className="card-pad">
          <form onSubmit={handleAddUser}>
            <div className="row-2">
              <div className="field"><label>Name</label><input name="name" required /></div>
              <div className="field"><label>Email</label><input name="email" type="email" required /></div>
            </div>
            <div className="row-2">
              <div className="field"><label>Password</label><input name="password" type="password" required minLength="6" /></div>
              <div className="field">
                <label>Role</label>
                <select name="role">
                  <option value="team">Team (price list only)</option>
                  <option value="admin">Admin (full access)</option>
                </select>
              </div>
            </div>
            <button className="btn" type="submit">Create user</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Existing users</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.length === 0 ? (
                <tr className="empty-row"><td colSpan="4">Loading...</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.email}>
                    <td>{u.name} {u.email === currentUser.email && <span className="small-note">(you)</span>}</td>
                    <td className="mono">{u.email}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-team'}`}>{u.role}</span></td>
                    <td>
                      <div className="inline-actions">
                        <button className="icon-btn" onClick={() => setModal({ type: 'reset', user: u })}>Reset password</button>
                        <button className="icon-btn" onClick={() => setModal({ type: 'delete', user: u })}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {modal?.type === 'delete' && (
        <Modal
          title={`Remove ${modal.user.email}?`}
          hint="They will no longer be able to sign in."
          confirmText="Remove"
          onConfirm={() => confirmDelete(modal.user.email, modal.user.role)}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Password Reset Modal */}
      {modal?.type === 'reset' && (
        <Modal
          title="Reset password"
          hint={`Set a new password for ${modal.user.email}.`}
          confirmText="Save"
          danger={false}
          onConfirm={() => confirmReset(modal.user.email)}
          onCancel={() => setModal(null)}
        >
          <div className="field">
            <label>New password</label>
            <input id="resetPwInput" type="password" minLength="6" autoFocus />
          </div>
        </Modal>
      )}
    </>
  );
}
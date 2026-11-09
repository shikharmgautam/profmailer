'use client';
import { useState, useEffect, useRef } from 'react';

export function getActiveUserId() {
  if (typeof window === 'undefined') return '1';
  return localStorage.getItem('prof_user_id') || '1';
}

export function setActiveUserId(id) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('prof_user_id', id);
  document.cookie = `prof_user_id=${encodeURIComponent(id)}; path=/; max-age=31536000`;
  window.dispatchEvent(new CustomEvent('prof_user_changed', { detail: { userId: id } }));
}

export default function UserSwitcher({ onUserChange }) {
  const [users, setUsers] = useState([]);
  const [currentId, setCurrentId] = useState('1');
  const [currentUser, setCurrentUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserEducation, setNewUserEducation] = useState('');
  const [newUserTarget, setNewUserTarget] = useState('Research Internship');
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef(null);

  const loadUsers = async () => {
    try {
      const activeId = getActiveUserId();
      setCurrentId(activeId);
      const res = await fetch('/api/users');
      if (res.ok) {
        const list = await res.json();
        setUsers(list);
        const found = list.find(u => String(u.id) === String(activeId)) || list[0];
        setCurrentUser(found);
      }
    } catch (e) {
      console.warn('Failed to load users:', e);
    }
  };

  useEffect(() => {
    loadUsers();

    const handleUserChanged = (e) => {
      const newId = e.detail?.userId || getActiveUserId();
      setCurrentId(newId);
      loadUsers();
      if (onUserChange) onUserChange(newId);
    };

    window.addEventListener('prof_user_changed', handleUserChanged);
    return () => window.removeEventListener('prof_user_changed', handleUserChanged);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user) => {
    setActiveUserId(user.id);
    setCurrentId(user.id);
    setCurrentUser(user);
    setDropdownOpen(false);
    if (onUserChange) onUserChange(user.id);
    // Reload page data to reflect the chosen user
    window.location.reload();
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim() || null,
          education: newUserEducation.trim() || null,
          target_degree: newUserTarget
        })
      });
      if (res.ok) {
        const created = await res.json();
        setModalOpen(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserEducation('');
        handleSelectUser(created);
      }
    } catch (err) {
      alert('Error creating profile: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Active User Switcher Pill */}
      <button
        onClick={() => setDropdownOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: '4px 12px 4px 6px',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: '0.85rem',
          transition: 'all 0.15s ease'
        }}
        title="Switch active user or add team member"
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.72rem'
          }}
        >
          {getInitials(currentUser?.name)}
        </span>
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
            {currentUser?.name || 'Select User'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
            {currentUser?.target_degree || 'Member'}
          </div>
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text3)', marginLeft: 4 }}>▼</span>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 290,
            background: '#161b22',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
            zIndex: 1000,
            padding: '8px 0',
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>
            TEAM PROFILES ({users.length} ACTIVE)
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {users.map(u => {
              const isSelected = String(u.id) === String(currentId);
              return (
                <div
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  style={{
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s ease'
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isSelected ? 'var(--accent)' : 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      color: isSelected ? '#fff' : 'var(--text2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 700
                    }}
                  >
                    {getInitials(u.name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.education || u.email || 'No institution listed'}
                    </div>
                  </div>
                  {isSelected && <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>✓</span>}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 12px 4px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => { setDropdownOpen(false); setModalOpen(true); }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>+</span> Add New User / Team Member
            </button>
          </div>
        </div>
      )}

      {/* Add New User Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div
            style={{
              background: '#161b22',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Create User Profile</h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priyanshu Sharma"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#0d1117',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. priyanshu@nitt.edu"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#0d1117',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                  Degree & College
                </label>
                <input
                  type="text"
                  placeholder="e.g. B.Tech Computer Science, NIT Trichy"
                  value={newUserEducation}
                  onChange={e => setNewUserEducation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#0d1117',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                  Target Opportunity
                </label>
                <select
                  value={newUserTarget}
                  onChange={e => setNewUserTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#0d1117',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="Research Internship">Research Internship</option>
                  <option value="1-Year Research Internship">1-Year Research Internship</option>
                  <option value="Summer Research Fellowship">Summer Research Fellowship</option>
                  <option value="MS by Research">MS by Research</option>
                  <option value="Direct PhD">Direct PhD</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                >
                  {creating ? 'Creating...' : 'Create & Switch Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


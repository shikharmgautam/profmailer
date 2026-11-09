'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthNav({ onUserLoaded }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          if (isMounted) {
            setUser(null);
            setLoading(false);
            router.push('/login');
          }
          return;
        }
        const data = await res.json();
        if (isMounted) {
          setUser(data.user);
          setLoading(false);
          if (onUserLoaded) onUserLoaded(data.user);
        }
      } catch (e) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
          router.push('/login');
        }
      }
    }
    checkAuth();
    return () => { isMounted = false; };
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.82rem',
        color: 'var(--text2, #94a3b8)'
      }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} />
        Checking session…
      </div>
    );
  }

  if (!user) {
    return (
      <Link href="/login" className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>
        🔑 Sign In
      </Link>
    );
  }

  const initials = user.name
    ? user.name.split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Active User Card Button */}
      <button
        onClick={() => setDropdownOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '4px 10px 4px 6px',
          borderRadius: '24px',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          background: 'rgba(99, 102, 241, 0.1)',
          color: '#f8fafc',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 800,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
        }}>
          {initials}
        </div>
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{user.name}</span>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              Active
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            {user.target_degree || 'Research Outreach'}
          </div>
        </div>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '4px' }}>▼</span>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '240px',
            background: 'var(--card-bg, #111827)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
            padding: '10px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>{user.name}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', wordBreak: 'break-all' }}>{user.email}</div>
          </div>

          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              color: '#f8fafc',
              textDecoration: 'none',
              fontSize: '0.84rem',
              fontWeight: 500,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            👤 Edit My Profile & Resume
          </Link>

          <Link
            href="/history"
            onClick={() => setDropdownOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              color: '#f8fafc',
              textDecoration: 'none',
              fontSize: '0.84rem',
              fontWeight: 500,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            📋 My Campaigns History
          </Link>

          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '2px 0' }} />

          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              color: '#f87171',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 600,
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}


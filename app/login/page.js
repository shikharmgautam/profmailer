'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const QUICK_TEAM_ACCOUNTS = [
  {
    name: 'Tharun Aadesh',
    email: 'tharunaadesh.maharavi@gmail.com',
    role: 'FPGA & Hardware Design · DRDO Alum',
    initials: 'TA',
    color: '#6366f1'
  },
  {
    name: 'Vaibhav Kannan',
    email: 'vaibhav.kannan@gmail.com',
    role: 'Composites & Multiphysics Modeling · IIT Madras Alum',
    initials: 'VK',
    color: '#06b6d4'
  },
  {
    name: 'Austadish Saikia',
    email: 'saikiaaustadish@gmail.com',
    role: 'Analog/Mixed-Signal IC Design · Prodigy Alum',
    initials: 'AS',
    color: '#10b981'
  }
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [education, setEducation] = useState('');
  const [targetDegree, setTargetDegree] = useState('Research Internship');
  const [researchInterests, setResearchInterests] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleQuickLogin = async (acc) => {
    setEmail(acc.email);
    setPassword('profmailer123');
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: 'profmailer123' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      router.push('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login'
        ? { email: email.trim(), password }
        : {
            name: name.trim(),
            email: email.trim(),
            password,
            education: education.trim(),
            targetDegree,
            researchInterests: researchInterests.trim()
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px 16px',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(99, 102, 241, 0.12) 0%, rgba(10, 14, 26, 1) 70%)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'var(--card-bg, #111827)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.15)',
        padding: '36px 32px'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            fontSize: '24px',
            marginBottom: '12px',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
          }}>
            ✉️
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            ProfMailer Team
          </h1>
          <p style={{ color: 'var(--text2, #94a3b8)', fontSize: '0.88rem', margin: 0 }}>
            Secure Academic Outreach & Research Collaboration
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '4px',
          borderRadius: '10px',
          marginBottom: '24px'
        }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'login' ? 'var(--accent, #6366f1)' : 'transparent',
              color: mode === 'login' ? '#fff' : 'var(--text2, #94a3b8)',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'register' ? 'var(--accent, #6366f1)' : 'transparent',
              color: mode === 'register' ? '#fff' : 'var(--text2, #94a3b8)',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Register Member
          </button>
        </div>

        {/* Quick Team Sign-In (For easy testing & switching) */}
        {mode === 'login' && (
          <div style={{ marginBottom: '22px' }}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#818cf8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px'
            }}>
              ⚡ Quick Team Sign-In (1-Click)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {QUICK_TEAM_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.12)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: acc.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0
                  }}>
                    {acc.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{acc.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.role}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600 }}>Sign In →</span>
                </button>
              ))}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '18px 0',
              color: '#64748b',
              fontSize: '0.75rem'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
              <span style={{ padding: '0 10px', textTransform: 'uppercase' }}>or enter credentials</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.84rem',
            marginBottom: '18px'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Full Name *
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Aditi Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
              Academic / Personal Email *
            </label>
            <input
              type="email"
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="e.g. aditi@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
              Password *
            </label>
            <input
              type="password"
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Degree & Institute
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. B.Tech Computer Science, NIT Trichy"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Target Opportunity
                </label>
                <select
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={targetDegree}
                  onChange={(e) => setTargetDegree(e.target.value)}
                >
                  <option value="Research Internship">Research Internship</option>
                  <option value="1-Year Research Internship">1-Year Research Internship</option>
                  <option value="Summer Internship">Summer Internship</option>
                  <option value="PhD">PhD / Doctoral</option>
                  <option value="Masters / MS">Masters / MS</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Research Interests
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. Distributed Systems, VLSI, Machine Learning"
                  value={researchInterests}
                  onChange={(e) => setResearchInterests(e.target.value)}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '12px',
              fontSize: '0.95rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading ? 'Processing…' : (mode === 'login' ? 'Sign In to Workspace →' : 'Create Team Account →')}
          </button>
        </form>

        {/* Security & Isolation Callout */}
        <div style={{
          marginTop: '24px',
          padding: '12px 14px',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px dashed rgba(99, 102, 241, 0.25)',
          fontSize: '0.76rem',
          color: '#94a3b8',
          textAlign: 'center'
        }}>
          🔒 <strong>Strict Data Isolation:</strong> Each team member accesses and edits only their own profile, custom templates, Gmail tokens, and campaign pipeline.
        </div>
      </div>
    </div>
  );
}


'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserSwitcher from '@/components/UserSwitcher';

function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft', researching: 'Researching', awaiting_approval: 'Ready for Review',
    approved_scheduled: 'Scheduled', sending: 'Sending…', sent: '✓ Sent',
    failed: 'Failed', needs_clarification: 'Needs Input',
  };
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}

export default function HistoryPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/campaigns/list')
      .then(r => r.json())
      .then(data => { setCampaigns(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <div className="logo-icon">📧</div>
          ProfMailer
        </Link>
        <div className="nav-links">
          <Link href="/" className="nav-link">New Campaign</Link>
          <Link href="/history" className="nav-link active">History</Link>
          <Link href="/profile" className="nav-link">Profile</Link>
          <UserSwitcher />
        </div>
      </nav>

      <div className="main-content">
        <div className="flex-between mb-4">
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Campaign History</h1>
          <Link href="/" className="btn btn-primary">+ New Campaign</Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No campaigns yet</h3>
            <p style={{ marginBottom: 20 }}>Start by entering a professor's name and university.</p>
            <Link href="/" className="btn btn-primary">Start Your First Campaign</Link>
          </div>
        ) : (
          <div className="review-panel">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Professor</th>
                  <th>University</th>
                  <th>Status</th>
                  <th>Recipient</th>
                  <th>Date</th>
                  <th>Gmail ID</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/campaign/${c.id}`)}>
                    <td className="professor-cell">{c.professor_name}</td>
                    <td style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{c.university}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text2)' }}>
                      {c.recipient_email || '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {c.sent_at
                        ? '✓ ' + new Date(c.sent_at).toLocaleString()
                        : c.scheduled_send_at
                        ? '⏰ ' + new Date(c.scheduled_send_at).toLocaleString()
                        : new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text3)' }}>
                      {c.message_id ? c.message_id.substring(0, 16) + '…' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft', researching: 'Researching', awaiting_approval: 'Ready for Review',
    approved_scheduled: 'Scheduled', sending: 'Sending…', sent: '✓ Sent',
    failed: 'Failed', needs_clarification: 'Needs Input', cancelled: 'Cancelled',
  };
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}

function EvidencePanel({ verification }) {
  if (!verification?.claims?.length) {
    return <div className="text-muted" style={{ fontSize: '0.85rem', padding: '12px 0' }}>No verification data available.</div>;
  }
  return (
    <div>
      {verification.claims.map((c, i) => (
        <div key={i} className="evidence-item">
          <div className="evidence-claim">"{c.claim}"</div>
          <span className={`evidence-status evidence-${c.status}`}>
            {c.status === 'verified' ? '✓ Verified' :
             c.status === 'incorrect' ? '✕ Incorrect' :
             c.status === 'unverified' ? '? Unverified' : '~ Reasonable inference'}
          </span>
          <div className="evidence-explanation">{c.explanation}</div>
          {c.action_needed && (
            <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--warning)' }}>
              ⚠️ {c.action_needed}
            </div>
          )}
        </div>
      ))}
      {verification.overall_status === 'needs_revision' && (
        <div className="alert alert-warning" style={{ marginTop: 12 }}>
          <span>⚠️</span>
          <div>
            <strong>Issues found:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 16 }}>
              {(verification.issues_to_fix || []).map((issue, i) => (
                <li key={i} style={{ fontSize: '0.82rem' }}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicationsPanel({ publications }) {
  if (!publications?.length) {
    return <div className="text-muted" style={{ fontSize: '0.85rem' }}>No publications found.</div>;
  }
  return (
    <div>
      {publications.map((p, i) => (
        <div key={i} className="pub-card">
          <div className="pub-title">{p.title}</div>
          <div className="pub-meta">
            {p.year} · {p.venue}
            {p.doi && <> · <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>DOI</a></>}
            {p.url && !p.doi && <> · <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>Link</a></>}
          </div>
          {p.abstract_snippet && (
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.4 }}>
              {p.abstract_snippet}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SourcesPanel({ sources }) {
  const all = [...(sources || [])].filter(Boolean);
  if (!all.length) return <div className="text-muted" style={{ fontSize: '0.85rem' }}>No sources collected.</div>;
  return (
    <div>
      {all.map((s, i) => (
        <div key={i} style={{ marginBottom: 8, fontSize: '0.82rem' }}>
          <a href={s.url} target="_blank" rel="noreferrer"
             style={{ color: 'var(--accent2)', wordBreak: 'break-all', textDecoration: 'none' }}>
            🔗 {s.title || s.url}
          </a>
        </div>
      ))}
    </div>
  );
}

export default function CampaignReview() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('email');
  const [editedBody, setEditedBody] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleInstruction, setScheduleInstruction] = useState('');
  const [parsedSchedule, setParsedSchedule] = useState(null);
  const [parsingSchedule, setParsingSchedule] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(data => {
        setCampaign(data);
        setEditedBody(data.personalized_body || '');
        setEditedSubject(data.personalized_subject || '');
        setRecipientEmail(data.recipient_email || '');
        // Default schedule: tomorrow at 10am local
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setScheduleAt(tomorrow.toISOString().slice(0, 16));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleParseSchedule = async () => {
    if (!scheduleInstruction.trim()) return;
    setParsingSchedule(true);
    setParsedSchedule(null);
    try {
      const res = await fetch('/api/parse-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: scheduleInstruction, referenceTime: new Date().toISOString() }),
      });
      const data = await res.json();
      setParsedSchedule(data);
      if (data.scheduled_for_iso && !data.ambiguous) {
        // Convert UTC ISO to local datetime-local input value
        const d = new Date(data.scheduled_for_iso);
        const localStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setScheduleAt(localStr);
      }
    } catch (e) {
      setParsedSchedule({ error: e.message });
    } finally {
      setParsingSchedule(false);
    }
  };

  const handleApprove = async (action) => {
    if (!recipientEmail.trim()) {
      alert('Please provide the recipient email address.');
      return;
    }
    if (action === 'schedule' && !scheduleAt) {
      alert('Please select a date and time to schedule.');
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          recipientEmail: recipientEmail.trim(),
          editedBody,
          editedSubject,
          scheduledSendAt: action === 'schedule' ? new Date(scheduleAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        const updated = await fetch(`/api/campaigns/${id}`).then(r => r.json());
        setCampaign(updated);
      }
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this campaign? This cannot be undone.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const updated = await fetch(`/api/campaigns/${id}`).then(r => r.json());
        setCampaign(updated);
      } else {
        alert(data.error || 'Could not cancel');
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="app-shell">
        <div className="main-content">
          <div className="alert alert-error">Campaign not found.</div>
          <Link href="/" className="btn btn-outline">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isFinal = ['sent', 'failed', 'approved_scheduled', 'cancelled'].includes(campaign.status);
  const canApprove = campaign.status === 'awaiting_approval';
  const canCancel = ['awaiting_approval', 'approved_scheduled', 'needs_clarification'].includes(campaign.status);
  const research = campaign.research_data || {};
  const prof = campaign.professor_profile || {};
  const verification = campaign.verification_results || {};
  const allSources = [
    ...(research.pub_sources || []),
    ...(research.current_sources || []),
    ...(prof.sources || []),
  ].filter(s => s?.url);

  const hasVerificationIssues = verification.overall_status === 'needs_revision';

  return (
    <div className="app-shell">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <div className="logo-icon">📧</div>
          ProfMailer
        </Link>
        <div className="nav-links">
          <Link href="/" className="nav-link">← New Campaign</Link>
          <Link href="/history" className="nav-link">History</Link>
          <StatusBadge status={campaign.status} />
        </div>
      </nav>

      <div className="main-content">
        <div className="flex-between mb-4">
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }}>
              {campaign.professor_name}
            </h1>
            <div style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
              {prof.department ? `${prof.department} · ` : ''}{campaign.university}
              {prof.profile_url && (
                <a href={prof.profile_url} target="_blank" rel="noreferrer"
                   style={{ color: 'var(--accent2)', marginLeft: 8, fontSize: '0.82rem' }}>
                  ↗ Faculty Profile
                </a>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasVerificationIssues && canApprove && (
              <div className="alert alert-warning" style={{ margin: 0, padding: '6px 12px', fontSize: '0.8rem' }}>
                ⚠️ Some claims need review
              </div>
            )}
            {canCancel && (
              <button id="cancel-btn" className="btn btn-danger btn-sm" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : '✕ Cancel'}
              </button>
            )}
          </div>
        </div>

        {/* Result notification */}
        {result && (
          <div className={`alert ${result.success ? 'alert-success' : 'alert-error'} mb-4`}>
            {result.success ? (
              <>
                ✅ {result.status === 'sent'
                  ? `Email sent! Gmail Message ID: ${result.messageId}`
                  : `Scheduled for ${new Date(result.scheduledFor).toLocaleString()}. Backend will send automatically.`}
              </>
            ) : (
              <>❌ {result.error}</>
            )}
          </div>
        )}

        {campaign.status === 'needs_clarification' && campaign.error_message && (
          <div className="alert alert-warning mb-4">
            <span>🔍</span>
            <div>
              <strong>Identity could not be confirmed:</strong> {campaign.error_message}
              <div style={{ marginTop: 6, fontSize: '0.82rem' }}>
                Please start a new campaign with more details (e.g., add department or research area in Additional Instructions).
              </div>
            </div>
          </div>
        )}

        <div className="review-layout">
          {/* Left: Email + evidence */}
          <div>
            <div className="review-panel mb-4">
              <div className="panel-header">
                <div className="panel-title">📧 Email Preview</div>
                {canApprove && (
                  <button
                    id="edit-email-btn"
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditing(e => !e)}
                  >
                    {editing ? '✓ Done Editing' : '✏️ Edit'}
                  </button>
                )}
              </div>
              <div className="panel-body">
                <div className="meta-row">
                  <div className="meta-label">To:</div>
                  <div className="meta-value" style={{ flex: 1 }}>
                    {canApprove ? (
                      <>
                        <input
                          id="recipient-email-input"
                          className="form-input"
                          style={{ padding: '6px 10px' }}
                          value={recipientEmail}
                          onChange={e => setRecipientEmail(e.target.value)}
                          placeholder="professor@university.edu"
                          type="email"
                        />
                        {campaign.recipient_email_source && (
                          <div className="form-hint">📍 Found via: {campaign.recipient_email_source}</div>
                        )}
                        {!campaign.recipient_email && (
                          <div className="form-hint" style={{ color: 'var(--warning)' }}>
                            ⚠️ Email not auto-discovered. Please enter it manually.
                          </div>
                        )}
                      </>
                    ) : (
                      <span>{campaign.recipient_email || <span className="text-muted">Not set</span>}</span>
                    )}
                  </div>
                </div>

                <div className="meta-row">
                  <div className="meta-label">Subject:</div>
                  <div className="meta-value" style={{ flex: 1 }}>
                    {editing ? (
                      <input
                        id="subject-input"
                        className="form-input"
                        style={{ padding: '6px 10px' }}
                        value={editedSubject}
                        onChange={e => setEditedSubject(e.target.value)}
                      />
                    ) : (
                      <strong>{editedSubject}</strong>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {editing ? (
                    <textarea
                      id="email-body-editor"
                      className="form-textarea"
                      style={{ minHeight: 320, fontFamily: 'Georgia, serif', lineHeight: 1.8, fontSize: '0.875rem' }}
                      value={editedBody}
                      onChange={e => setEditedBody(e.target.value)}
                    />
                  ) : (
                    <div className="email-preview">{editedBody || campaign.personalized_body || '(No email generated)'}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Research evidence tabs */}
            <div className="review-panel">
              <div className="panel-header">
                <div className="tabs" style={{ borderBottom: 'none', margin: 0 }}>
                  {[
                    { id: 'evidence', label: '🔍 Verification' },
                    { id: 'publications', label: '📄 Publications' },
                    { id: 'sources', label: '🔗 Sources' },
                    { id: 'professor', label: '👤 Profile' },
                  ].map(t => (
                    <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                      {t.label}
                      {t.id === 'evidence' && hasVerificationIssues && (
                        <span style={{ marginLeft: 4, color: 'var(--warning)' }}>⚠</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-body">
                {tab === 'evidence' && <EvidencePanel verification={verification} />}
                {tab === 'publications' && (
                  <PublicationsPanel publications={research.publications} />
                )}
                {tab === 'sources' && <SourcesPanel sources={allSources} />}
                {tab === 'professor' && (
                  <div>
                    <div className="meta-row"><div className="meta-label">Name</div><div className="meta-value">{prof.full_name || campaign.professor_name}</div></div>
                    <div className="meta-row"><div className="meta-label">Title</div><div className="meta-value">{prof.title || '—'}</div></div>
                    <div className="meta-row"><div className="meta-label">Dept</div><div className="meta-value">{prof.department || '—'}</div></div>
                    <div className="meta-row"><div className="meta-label">Lab</div><div className="meta-value">
                      {prof.lab_name
                        ? <>{prof.lab_name}{prof.lab_url && <> · <a href={prof.lab_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>↗ Lab site</a></>}</>
                        : '—'}
                    </div></div>
                    <div className="meta-row">
                      <div className="meta-label">Research</div>
                      <div className="meta-value">{(prof.research_areas || []).join(', ') || '—'}</div>
                    </div>
                    {research.current_research?.lab_focus && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>Current lab focus:</strong>
                        {research.current_research.lab_focus}
                      </div>
                    )}
                    {research.current_research?.accepting_students === true && (
                      <div className="alert alert-success" style={{ marginTop: 12 }}>
                        ✅ Actively accepting students — source: {research.current_research.accepting_students_source}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div>
            {/* Approval actions */}
            {canApprove && (
              <div className="review-panel mb-4">
                <div className="panel-header">
                  <div className="panel-title">🚀 Send or Schedule</div>
                </div>
                <div className="panel-body">
                  <div className="send-actions">
                    <button
                      id="send-now-btn"
                      className="btn btn-success btn-full"
                      disabled={sending || !recipientEmail.trim()}
                      onClick={() => handleApprove('send_now')}
                    >
                      {sending ? <><div className="spinner" /> Sending...</> : '⚡ Approve & Send Now'}
                    </button>

                    <div className="divider">or schedule</div>

                    {/* Natural language schedule */}
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Natural language (optional)</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          id="schedule-instruction"
                          className="form-input"
                          style={{ fontSize: '0.82rem', padding: '7px 10px' }}
                          value={scheduleInstruction}
                          onChange={e => setScheduleInstruction(e.target.value)}
                          placeholder="e.g. next Tuesday at 10am"
                          onKeyDown={e => e.key === 'Enter' && handleParseSchedule()}
                        />
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={handleParseSchedule}
                          disabled={parsingSchedule || !scheduleInstruction.trim()}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {parsingSchedule ? '...' : 'Parse'}
                        </button>
                      </div>
                      {parsedSchedule && !parsedSchedule.error && (
                        <div style={{ marginTop: 6, fontSize: '0.78rem' }}>
                          {parsedSchedule.ambiguous ? (
                            <span style={{ color: 'var(--warning)' }}>⚠️ {parsedSchedule.clarification_needed}</span>
                          ) : (
                            <span style={{ color: 'var(--success)' }}>✓ {parsedSchedule.scheduled_for_local}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Date & Time</label>
                      <input
                        id="schedule-datetime"
                        type="datetime-local"
                        className="datetime-input"
                        value={scheduleAt}
                        onChange={e => setScheduleAt(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>

                    <button
                      id="schedule-btn"
                      className="btn btn-primary btn-full"
                      disabled={sending || !recipientEmail.trim() || !scheduleAt}
                      onClick={() => handleApprove('schedule')}
                    >
                      {sending ? <><div className="spinner" /> Scheduling...</> : '📅 Approve & Schedule'}
                    </button>

                    <div className="form-hint" style={{ textAlign: 'center', marginTop: 6 }}>
                      The backend sends automatically — even if you close this tab.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Final status display */}
            {isFinal && (
              <div className="review-panel mb-4">
                <div className="panel-header">
                  <div className="panel-title">📊 Status</div>
                </div>
                <div className="panel-body">
                  <StatusBadge status={campaign.status} />
                  {campaign.sent_at && (
                    <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text2)' }}>
                      ✓ Sent at: {new Date(campaign.sent_at).toLocaleString()}
                    </div>
                  )}
                  {campaign.message_id && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text3)', wordBreak: 'break-all' }}>
                      Gmail ID: {campaign.message_id}
                    </div>
                  )}
                  {campaign.scheduled_send_at && campaign.status === 'approved_scheduled' && (
                    <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--info)' }}>
                      ⏰ Will send at: {new Date(campaign.scheduled_send_at).toLocaleString()}
                    </div>
                  )}
                  {campaign.error_message && campaign.status !== 'needs_clarification' && (
                    <div className="alert alert-error" style={{ marginTop: 12 }}>
                      {campaign.error_message}
                    </div>
                  )}
                  {campaign.status === 'failed' && (
                    <Link href="/" className="btn btn-outline btn-full" style={{ marginTop: 12, display: 'flex' }}>
                      Start New Campaign
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Professor card */}
            <div className="review-panel mb-4">
              <div className="panel-header">
                <div className="panel-title">👤 Professor</div>
              </div>
              <div className="panel-body">
                <div style={{ fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {prof.full_name || campaign.professor_name}
                  </div>
                  <div style={{ color: 'var(--text2)', marginBottom: 8, fontSize: '0.82rem', lineHeight: 1.4 }}>
                    {[prof.title, prof.department].filter(Boolean).join(' · ')}
                    {prof.university && <><br />{prof.university}</>}
                  </div>
                  {prof.profile_url && (
                    <a href={prof.profile_url} target="_blank" rel="noreferrer"
                       className="btn btn-outline btn-sm btn-full" style={{ marginBottom: 8, display: 'flex' }}>
                      ↗ View Faculty Profile
                    </a>
                  )}
                  {prof.lab_name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: 4 }}>
                      🧪 {prof.lab_name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Publications summary */}
            {research.publications?.length > 0 && (
              <div className="review-panel">
                <div className="panel-header">
                  <div className="panel-title">📄 {research.publications.length} Publication(s) Found</div>
                </div>
                <div className="panel-body">
                  {research.scholar_profile && (
                    <a href={research.scholar_profile} target="_blank" rel="noreferrer"
                       style={{ color: 'var(--accent2)', fontSize: '0.82rem' }}>
                      View Google Scholar →
                    </a>
                  )}
                  <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text3)' }}>
                    Used in personalization: {research.publications.slice(0, 2).map(p => `"${p.title}"`).join(', ')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

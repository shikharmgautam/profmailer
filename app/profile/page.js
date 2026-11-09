'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [tab, setTab] = useState('resume');

  // Resume parsing state
  const [parsing, setParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [suggestedFields, setSuggestedFields] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p);
      setForm(p || {});
    });
    fetch('/api/auth/status').then(r => r.json()).then(setGmailStatus);
  }, []);

  const handleChange = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      setProfile(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file) => {
    setParsing(true);
    setParseError(null);
    setParseSuccess(null);

    try {
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const payload = {};
          if (isPdf) {
            payload.fileData = reader.result;
            payload.mimeType = 'application/pdf';
          } else {
            payload.resumeText = reader.result;
            payload.mimeType = 'text/plain';
          }

          const res = await fetch('/api/resume/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to parse resume');
          }

          setForm(data.profile);
          setProfile(data.profile);
          if (data.suggested_fields) {
            setSuggestedFields(data.suggested_fields);
          }
          setParseSuccess(`Successfully parsed ${file.name}! Profile has been auto-populated.`);
        } catch (err) {
          setParseError(err.message);
        } finally {
          setParsing(false);
        }
      };

      if (isPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    } catch (err) {
      setParseError(err.message);
      setParsing(false);
    }
  };

  const handleParseText = async () => {
    if (!form.cv_text?.trim()) {
      alert('Please paste resume text or upload a document first.');
      return;
    }
    setParsing(true);
    setParseError(null);
    setParseSuccess(null);
    try {
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: form.cv_text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse text');
      }
      setForm(data.profile);
      setProfile(data.profile);
      if (data.suggested_fields) {
        setSuggestedFields(data.suggested_fields);
      }
      setParseSuccess('Successfully parsed resume text! Profile updated.');
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="app-shell">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <div className="logo-icon">📧</div>
          ProfMailer
        </Link>
        <div className="nav-links">
          <Link href="/" className="nav-link">Campaigns</Link>
          <Link href="/history" className="nav-link">History</Link>
          <Link href="/profile" className="nav-link active">Profile & Resume</Link>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: 840 }}>
        <div className="flex-between mb-4">
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Applicant Profile & Resume</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
              Your academic background powers hyper-personalized emails and helps discover matching research labs.
            </p>
          </div>
          <button
            id="save-profile-btn"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Profile'}
          </button>
        </div>

        {/* Gmail connection */}
        <div className="review-panel mb-4">
          <div className="panel-header">
            <div className="panel-title">📧 Gmail Connection</div>
          </div>
          <div className="panel-body">
            {gmailStatus?.connected ? (
              <div className="flex-between">
                <div>
                  <span className="gmail-badge connected" style={{ display: 'inline-flex' }}>
                    ✓ Connected as {gmailStatus.email}
                  </span>
                  <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text2)' }}>
                    Emails will be sent from this account automatically after approval.
                  </p>
                </div>
                <a href="/api/auth/gmail" className="btn btn-outline btn-sm">Reconnect</a>
              </div>
            ) : (
              <div>
                <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                  Gmail is not connected. You must connect Gmail to send emails automatically.
                </div>
                <a href="/api/auth/gmail" id="connect-gmail-btn" className="btn btn-primary">
                  🔗 Connect Gmail Account
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs mb-4">
          {[
            { id: 'resume', label: '📄 Resume Upload & AI Parser' },
            { id: 'profile', label: '👤 Academic Details & Goals' },
            { id: 'background', label: '🎓 Background & Experience' },
            { id: 'template', label: '📝 Email Template' },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: RESUME UPLOAD */}
        {tab === 'resume' && (
          <div className="form-section">
            <div className="form-section-title">
              <span>📄</span> Upload Resume (PDF / TXT / Markdown)
            </div>

            <div
              className="upload-zone mb-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <div className="upload-zone-icon">📤</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>
                {parsing ? 'Parsing Resume with Gemini AI...' : 'Click to upload your Resume / CV'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
                Supports PDF, TXT, or MD documents. Extracted education, target degree, skills, and projects are auto-populated.
              </div>
            </div>

            {parsing && (
              <div className="alert alert-info mb-4" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                <span>Extracting authentic research background, projects, and degree goals...</span>
              </div>
            )}

            {parseSuccess && (
              <div className="alert alert-success mb-4">
                <span>✓</span> {parseSuccess}
              </div>
            )}

            {parseError && (
              <div className="alert alert-error mb-4">
                <span>⚠️</span> {parseError}
              </div>
            )}

            {suggestedFields.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                  🎯 Suggested Academic Fields for You:
                </div>
                <div className="field-pills">
                  {suggestedFields.map(field => (
                    <span key={field} className="field-pill">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <div className="flex-between mb-2">
                <label className="form-label" style={{ margin: 0 }}>Or Paste Resume / CV Text Directly</label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleParseText}
                  disabled={parsing || !form.cv_text?.trim()}
                >
                  {parsing ? 'Parsing...' : '✨ Parse Text with AI'}
                </button>
              </div>
              <textarea
                id="cv-editor"
                className="form-textarea"
                value={form.cv_text || ''}
                onChange={e => handleChange('cv_text', e.target.value)}
                placeholder="Paste your resume or CV text here..."
                rows={10}
              />
            </div>
          </div>
        )}

        {/* TAB 2: PROFILE & GOALS */}
        {tab === 'profile' && (
          <div className="form-section">
            <div className="form-section-title">
              <span>👤</span> Your Academic Identity & Target Degree
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name <span className="required-star">*</span></label>
                <input
                  id="profile-name"
                  className="form-input"
                  value={form.name || ''}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="e.g. Alex Chen"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Your Email Address</label>
                <input
                  id="profile-email"
                  className="form-input"
                  value={form.email || ''}
                  onChange={e => handleChange('email', e.target.value)}
                  placeholder="e.g. alex.chen@university.edu"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Target Degree / Position <span className="required-star">*</span></label>
                <input
                  id="profile-degree"
                  className="form-input"
                  value={form.target_degree || ''}
                  onChange={e => handleChange('target_degree', e.target.value)}
                  placeholder="e.g. PhD, Master's Thesis, Research Assistantship, Summer Internship"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Current / Most Recent Education</label>
                <input
                  id="profile-education"
                  className="form-input"
                  value={form.education || ''}
                  onChange={e => handleChange('education', e.target.value)}
                  placeholder="e.g. B.S. in Computer Science, UC Berkeley, GPA: 3.9/4.0"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Primary Research Interests</label>
              <input
                id="profile-interests"
                className="form-input"
                value={form.research_interests || ''}
                onChange={e => handleChange('research_interests', e.target.value)}
                placeholder="e.g. Multi-Agent Systems, Reinforcement Learning, Autonomous Vehicles"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Technical Skills & Frameworks</label>
              <input
                id="profile-skills"
                className="form-input"
                value={form.skills || ''}
                onChange={e => handleChange('skills', e.target.value)}
                placeholder="e.g. Python, PyTorch, JAX, ROS2, Distributed Systems"
              />
            </div>
          </div>
        )}

        {/* TAB 3: BACKGROUND & PROJECTS */}
        {tab === 'background' && (
          <div className="form-section">
            <div className="form-section-title">
              <span>🎓</span> Background & Key Projects
            </div>

            <div className="form-group">
              <label className="form-label">Notable Research & Software Projects</label>
              <textarea
                id="profile-projects"
                className="form-textarea"
                value={form.projects || ''}
                onChange={e => handleChange('projects', e.target.value)}
                placeholder="Brief summary of 2-3 key projects, publications, or thesis work you have completed."
                rows={4}
              />
              <div className="form-hint">
                These specific projects will be referenced by the AI to demonstrate authentic alignment with the professor's lab.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Polished Academic Background Narrative</label>
              <textarea
                id="background-editor"
                className="form-textarea"
                value={form.background || ''}
                onChange={e => handleChange('background', e.target.value)}
                placeholder="Brief description of your academic background, coursework, and research motivations."
                rows={6}
              />
            </div>

            <div className="alert alert-warning">
              ⚠️ Grounding guarantee: The AI will strictly reference the details you specify here. It will never invent qualifications, fake publications, or hallucinate credentials.
            </div>
          </div>
        )}

        {/* TAB 4: EMAIL TEMPLATE */}
        {tab === 'template' && (
          <div className="form-section">
            <div className="form-section-title">
              <span>📝</span> Default Email Template
            </div>
            <div className="form-group">
              <div className="form-hint" style={{ marginBottom: 8 }}>
                Available placeholders: <code>{'{professor_name}'}</code> <code>{'{university}'}</code> <code>{'{research_topic}'}</code> <code>{'{research_personalization}'}</code> <code>{'{user_name}'}</code> <code>{'{user_background}'}</code>
              </div>
              <textarea
                id="template-editor"
                className="form-textarea"
                value={form.default_template || ''}
                onChange={e => handleChange('default_template', e.target.value)}
                rows={14}
                style={{ fontFamily: 'Georgia, serif', lineHeight: 1.7, fontSize: '0.875rem' }}
              />
            </div>
            <div className="alert alert-info">
              ℹ️ The AI will fill in placeholders using verified research on the professor's lab and your authentic profile.
            </div>
          </div>
        )}

        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

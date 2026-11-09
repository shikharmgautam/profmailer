'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STAGES = [
  { id: 1, name: 'Identifying professor', desc: 'Searching official faculty profiles' },
  { id: 2, name: 'Discovering publications', desc: 'Finding research contributions' },
  { id: 3, name: 'Analyzing current research', desc: 'Lab activity and projects' },
  { id: 4, name: 'Finding email address', desc: 'Verified from official sources' },
  { id: 5, name: 'Personalizing email', desc: 'Adapting template with verified facts' },
  { id: 6, name: 'Verifying claims', desc: 'Checking every factual assertion' },
  { id: 7, name: 'Ready for review', desc: 'Email prepared for your approval' },
];

function StageIcon({ status, num }) {
  if (status === 'completed') return <span>✓</span>;
  if (status === 'active') return <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--accent2)' }} />;
  if (status === 'failed') return <span>✕</span>;
  return <span style={{ opacity: 0.4 }}>{num}</span>;
}

function ProgressTracker({ campaign }) {
  const stage = campaign.progress_stage || 0;
  const status = campaign.status;

  return (
    <div className="progress-tracker">
      <div className="mb-4">
        <div className="flex-between mb-2">
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
            🔍 Researching {campaign.professor_name}
          </h2>
          <StatusBadge status={status} />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
          {campaign.university}
        </div>
      </div>

      {campaign.error_message && (
        <div className="alert alert-error mb-4">
          <span>⚠️</span>
          <div>
            <strong>Issue found:</strong> {campaign.error_message}
          </div>
        </div>
      )}

      <div className="progress-stages">
        {STAGES.map((s) => {
          const stageStatus =
            stage > s.id ? 'completed'
            : stage === s.id ? (status === 'failed' || status === 'needs_clarification' ? 'failed' : 'active')
            : 'pending';
          return (
            <div key={s.id} className={`stage-item ${stageStatus}`}>
              <div className={`stage-icon ${stageStatus}`}>
                <StageIcon status={stageStatus} num={s.id} />
              </div>
              <div className="stage-content">
                <div className={`stage-name ${stageStatus === 'active' ? 'active-text' : ''}`}>{s.name}</div>
                <div className="stage-desc">
                  {stageStatus === 'active' && campaign.progress_message ? campaign.progress_message : s.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft',
    researching: 'Researching',
    awaiting_approval: 'Ready for Review',
    approved_scheduled: 'Scheduled',
    sending: 'Sending…',
    sent: '✓ Sent',
    failed: 'Failed',
    needs_clarification: 'Needs Input',
  };
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}

function GmailBadge({ gmailStatus }) {
  if (gmailStatus?.connected) {
    return <span className="gmail-badge connected">✓ Gmail: {gmailStatus.email}</span>;
  }
  return (
    <a href="/api/auth/gmail" className="gmail-badge disconnected" style={{ textDecoration: 'none' }}>
      ⚠️ Connect Gmail
    </a>
  );
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('direct'); // 'direct' | 'discover'
  const [gmailStatus, setGmailStatus] = useState(null);
  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);

  // Direct campaign form state
  const [directForm, setDirectForm] = useState({
    professorName: '',
    university: '',
    additionalInstructions: '',
  });
  const [showOptional, setShowOptional] = useState(false);

  // Discover professors state
  const [discoverField, setDiscoverField] = useState('');
  const [discoverRegion, setDiscoverRegion] = useState('India');
  const [discoverDegree, setDiscoverDegree] = useState('PhD');
  const [discovering, setDiscovering] = useState(false);
  const [discoveredProfessors, setDiscoveredProfessors] = useState([]);
  const [countsByCountry, setCountsByCountry] = useState({});
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [profSearchQuery, setProfSearchQuery] = useState('');
  const [discoverError, setDiscoverError] = useState(null);

  // Resume upload modal state
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const resumeFileRef = useRef(null);

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setGmailStatus).catch(() => {});
    fetch('/api/campaigns/list').then(r => r.json()).then(setCampaigns).catch(() => {});
    loadProfile();
  }, []);

  const loadProfile = () => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p);
      if (p?.research_interests && !discoverField) {
        setDiscoverField(p.research_interests);
      }
      if (p?.target_degree) {
        setDiscoverDegree(p.target_degree);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [pollInterval]);

  const pollCampaign = (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${id}`);
        const data = await res.json();
        setActiveCampaign(data);

        if (data.status === 'awaiting_approval' || data.status === 'failed' || data.status === 'needs_clarification') {
          clearInterval(interval);
          setPollInterval(null);
          fetch('/api/campaigns/list').then(r => r.json()).then(setCampaigns).catch(() => {});
          router.push(`/campaign/${id}`);
        }
      } catch (e) {}
    }, 3000);
    setPollInterval(interval);
  };

  const handleStartCampaign = async (name, uni, instructions = '') => {
    setLoading(true);
    setActiveCampaign(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professorName: name,
          university: uni,
          additionalInstructions: instructions,
        }),
      });
      const data = await res.json();
      if (data.campaignId) {
        const campRes = await fetch(`/api/campaigns/${data.campaignId}`);
        const camp = await campRes.json();
        setActiveCampaign(camp);
        setLoading(false);
        pollCampaign(data.campaignId);
      } else {
        alert(data.error || 'Failed to start campaign');
        setLoading(false);
      }
    } catch (e) {
      alert('Network error: ' + e.message);
      setLoading(false);
    }
  };

  const handleDiscover = async (e) => {
    e?.preventDefault();
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoveredProfessors([]);

    try {
      const res = await fetch('/api/discover-professors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: discoverField || profile?.research_interests || '',
          region: discoverRegion,
          targetDegree: discoverDegree,
          applicantBackground: [profile?.education, profile?.projects, profile?.skills].filter(Boolean).join('. '),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to discover professors');
      }

      setDiscoveredProfessors(data.professors || []);
      setCountsByCountry(data.countsByCountry || {});
      setSelectedCountry('All');
      setProfSearchQuery('');
      if (!data.professors?.length) {
        setDiscoverError('No professors found matching this exact query. Try broadening the research field.');
      }
    } catch (err) {
      setDiscoverError(err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleResumeFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const reader = new FileReader();

    setResumeParsing(true);
    reader.onload = async () => {
      try {
        const payload = isPdf
          ? { fileData: reader.result, mimeType: 'application/pdf' }
          : { resumeText: reader.result, mimeType: 'text/plain' };

        const res = await fetch('/api/resume/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setProfile(data.profile);
          if (data.profile.research_interests) setDiscoverField(data.profile.research_interests);
          if (data.profile.target_degree) setDiscoverDegree(data.profile.target_degree);
          setShowResumeModal(false);
          alert('Resume parsed and profile updated successfully!');
        } else {
          alert('Error: ' + (data.error || 'Failed to parse resume'));
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
      } finally {
        setResumeParsing(false);
      }
    };

    if (isPdf) reader.readAsDataURL(file);
    else reader.readAsText(file);
  };

  const handleResumeTextSubmit = async () => {
    if (!resumeText.trim()) return;
    setResumeParsing(true);
    try {
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        if (data.profile.research_interests) setDiscoverField(data.profile.research_interests);
        if (data.profile.target_degree) setDiscoverDegree(data.profile.target_degree);
        setShowResumeModal(false);
        alert('Resume parsed and profile updated successfully!');
      } else {
        alert('Error: ' + (data.error || 'Failed to parse resume'));
      }
    } catch (err) {
      alert('Parse failed: ' + err.message);
    } finally {
      setResumeParsing(false);
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
          <Link href="/" className="nav-link active">Outreach & Discovery</Link>
          <Link href="/history" className="nav-link">History</Link>
          <Link href="/profile" className="nav-link">Profile & Resume</Link>
          {gmailStatus !== null && <GmailBadge gmailStatus={gmailStatus} />}
        </div>
      </nav>

      <div className="main-content">
        {/* Top Applicant Ribbon */}
        <div className="applicant-ribbon">
          <div className="applicant-info">
            <div className="applicant-avatar">
              {profile?.name ? profile.name.slice(0, 2).toUpperCase() : '👤'}
            </div>
            <div className="applicant-meta">
              <div className="applicant-name">
                {profile?.name || 'Applicant Profile'}
                {profile?.target_degree && (
                  <span className="badge badge-verified" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                    Seeking {profile.target_degree}
                  </span>
                )}
              </div>
              <div className="applicant-details">
                {profile?.education ? `${profile.education} · ` : ''}
                {profile?.research_interests ? `Interests: ${profile.research_interests}` : 'No resume uploaded yet'}
              </div>
            </div>
          </div>
          <div className="gap-8">
            <button
              id="upload-resume-quick-btn"
              className="btn btn-outline btn-sm"
              onClick={() => setShowResumeModal(true)}
            >
              📄 Upload / Update Resume
            </button>
            <Link href="/profile" className="btn btn-outline btn-sm">
              ⚙️ Full Profile
            </Link>
          </div>
        </div>

        {activeCampaign ? (
          <ProgressTracker campaign={activeCampaign} />
        ) : (
          <>
            <div className="hero" style={{ paddingBottom: 16 }}>
              <div className="hero-badge">
                <span>✨</span> Powered by Gemini 3.8 + Real-Time Academic Search
              </div>
              <h1>Cold Email Academic Outreach<br />Grounded in Real Research</h1>
              <p>Find matching faculty across universities or target a specific professor. Verified claims, zero hallucinations.</p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="mode-tabs" style={{ maxWidth: 680, margin: '0 auto 24px' }}>
              <button
                id="mode-direct-tab"
                className={`mode-tab ${activeTab === 'direct' ? 'active' : ''}`}
                onClick={() => setActiveTab('direct')}
              >
                <span>🎯</span> Direct Professor Outreach
              </button>
              <button
                id="mode-discover-tab"
                className={`mode-tab ${activeTab === 'discover' ? 'active' : ''}`}
                onClick={() => setActiveTab('discover')}
              >
                <span>🌐</span> Discover Professors & Labs
              </button>
            </div>

            {/* TAB 1: DIRECT PROFESSOR OUTREACH */}
            {activeTab === 'direct' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!directForm.professorName.trim() || !directForm.university.trim()) return;
                  handleStartCampaign(directForm.professorName, directForm.university, directForm.additionalInstructions);
                }}
                className="campaign-form-wrap"
              >
                <div className="form-section">
                  <div className="form-section-title">
                    <span>📋</span> Targeted Professor Details
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Professor's Full Name <span className="required-star">*</span>
                      </label>
                      <input
                        id="prof-name"
                        className="form-input"
                        placeholder="e.g. Usha Kiruthika"
                        value={directForm.professorName}
                        onChange={e => setDirectForm(f => ({ ...f, professorName: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        University / Institution <span className="required-star">*</span>
                      </label>
                      <input
                        id="university"
                        className="form-input"
                        placeholder="e.g. NIT Trichy"
                        value={directForm.university}
                        onChange={e => setDirectForm(f => ({ ...f, university: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label
                      className="form-label"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setShowOptional(x => !x)}
                    >
                      <span>Additional Instructions</span>
                      <span className="optional-tag">Optional</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text3)' }}>
                        {showOptional ? '▲ Hide' : '▼ Show optional fields'}
                      </span>
                    </label>
                  </div>

                  {showOptional && (
                    <div className="form-group">
                      <textarea
                        id="additional-instructions"
                        className="form-textarea"
                        placeholder="e.g. Emphasize my background in multi-agent consensus protocols. Mention my interest in PhD opportunities for Fall 2027."
                        value={directForm.additionalInstructions}
                        onChange={e => setDirectForm(f => ({ ...f, additionalInstructions: e.target.value }))}
                        rows={3}
                      />
                      <div className="form-hint">
                        Any specific guidelines for tone or research emphasis. Publications and email are discovered automatically.
                      </div>
                    </div>
                  )}
                </div>

                <button
                  id="start-research-btn"
                  type="submit"
                  className="btn btn-primary btn-lg btn-full"
                  disabled={loading || !directForm.professorName.trim() || !directForm.university.trim()}
                >
                  {loading ? (
                    <><div className="spinner" /> Starting research...</>
                  ) : (
                    <><span>🔍</span> Research Professor & Prepare Email</>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.8rem', color: 'var(--text3)' }}>
                  Identifies faculty page, verifies citations via OpenAlex, scrapes official contact info, and tailors the email.
                </div>
              </form>
            )}

            {/* TAB 2: DISCOVER PROFESSORS & LABS */}
            {activeTab === 'discover' && (
              <div style={{ maxWidth: 880, margin: '0 auto' }}>
                <form onSubmit={handleDiscover} className="campaign-form-wrap" style={{ maxWidth: '100%', marginBottom: 24 }}>
                  <div className="form-section">
                    <div className="form-section-title flex-between">
                      <span>🔬 Find Matching Professors by Research Field</span>
                      {profile?.research_interests && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setDiscoverField(profile.research_interests);
                            if (profile.target_degree) setDiscoverDegree(profile.target_degree);
                          }}
                        >
                          ⚡ Auto-fill from My Resume
                        </button>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Research Field / Domain <span className="required-star">*</span>
                      </label>
                      <input
                        id="discover-field-input"
                        className="form-input"
                        placeholder="e.g. Multi-Agent Systems, Quantum Machine Learning, Computer Vision in Medical Imaging"
                        value={discoverField}
                        onChange={e => setDiscoverField(e.target.value)}
                        required
                      />
                      {profile?.research_interests && (
                        <div className="form-hint">
                          Tip: Inferred from your profile: <strong>{profile.research_interests}</strong>
                        </div>
                      )}
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Target Region / Country</label>
                        <select
                          id="discover-region-select"
                          className="form-input"
                          value={discoverRegion}
                          onChange={e => setDiscoverRegion(e.target.value)}
                        >
                          <option value="Global">Global (All Regions)</option>
                          <option value="United States">United States</option>
                          <option value="India">India</option>
                          <option value="Europe">Europe / UK</option>
                          <option value="Canada">Canada</option>
                          <option value="Australia">Australia / New Zealand</option>
                          <option value="Asia">Asia (Singapore, Japan, Korea)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Position / Degree Goal</label>
                        <select
                          id="discover-degree-select"
                          className="form-input"
                          value={discoverDegree}
                          onChange={e => setDiscoverDegree(e.target.value)}
                        >
                          <option value="PhD">PhD Student</option>
                          <option value="Master's Thesis">Master's Thesis / MS</option>
                          <option value="Research Assistantship">Research Assistant (RA)</option>
                          <option value="Summer Internship">Research Internship</option>
                          <option value="Postdoctoral">Postdoctoral Researcher</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    id="discover-professors-btn"
                    type="submit"
                    className="btn btn-primary btn-lg btn-full"
                    disabled={discovering || !discoverField.trim()}
                  >
                    {discovering ? (
                      <><div className="spinner" /> Scanning Universities, Labs & Faculty Directories...</>
                    ) : (
                      <><span>🌐</span> Search Top Professors & Colleges</>
                    )}
                  </button>
                </form>

                {discoverError && (
                  <div className="alert alert-error mb-4">
                    <span>⚠️</span> {discoverError}
                  </div>
                )}

                {discoveredProfessors.length > 0 && (() => {
                  const filteredProfessors = discoveredProfessors.filter(p => {
                    const matchesCountry = selectedCountry === 'All' || p.country === selectedCountry;
                    const q = profSearchQuery.toLowerCase().trim();
                    const matchesQuery = !q ||
                      p.name.toLowerCase().includes(q) ||
                      p.university.toLowerCase().includes(q) ||
                      (p.research_focus && p.research_focus.toLowerCase().includes(q)) ||
                      (p.nirf_label && p.nirf_label.toLowerCase().includes(q));
                    return matchesCountry && matchesQuery;
                  });

                  const countryList = Object.keys(countsByCountry);

                  return (
                    <div style={{ marginTop: 28 }}>
                      <div className="flex-between mb-3" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                            🎓 Discovered Faculty ({filteredProfessors.length} of {discoveredProfessors.length})
                          </h2>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginTop: 2 }}>
                            {discoverRegion === 'India' ? (
                              <span>⚡ <strong>Sorted by NIRF Ranking</strong> (Top National Engineering & Research Institutes)</span>
                            ) : (
                              <span>⚡ <strong>Sorted Country-Wise</strong> across {countryList.length || 1} regions</span>
                            )}
                          </div>
                        </div>

                        {/* Search in discovered */}
                        <div style={{ maxWidth: 260, width: '100%' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                            placeholder="🔍 Filter by name or college..."
                            value={profSearchQuery}
                            onChange={e => setProfSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Country Filter Pills for Global view */}
                      {countryList.length > 1 && (
                        <div className="country-filter-bar">
                          <button
                            type="button"
                            className={`country-pill ${selectedCountry === 'All' ? 'active' : ''}`}
                            onClick={() => setSelectedCountry('All')}
                          >
                            <span>🌐 All Countries</span>
                            <span className="country-pill-count">{discoveredProfessors.length}</span>
                          </button>
                          {countryList.map(c => (
                            <button
                              key={c}
                              type="button"
                              className={`country-pill ${selectedCountry === c ? 'active' : ''}`}
                              onClick={() => setSelectedCountry(c)}
                            >
                              <span>{c === 'United States' ? '🇺🇸' : c === 'India' ? '🇮🇳' : c === 'United Kingdom' ? '🇬🇧' : c === 'Canada' ? '🇨🇦' : c === 'Germany' ? '🇩🇪' : c === 'Switzerland' ? '🇨🇭' : c === 'Singapore' ? '🇸🇬' : c === 'Australia' ? '🇦🇺' : '🌍'} {c}</span>
                              <span className="country-pill-count">{countsByCountry[c]}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="professor-card-grid">
                        {filteredProfessors.map((p, idx) => (
                          <div key={idx} className="prof-card">
                            <div className="prof-header">
                              <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                                <div className="prof-name">{p.name}</div>
                                {p.nirf_label && p.country === 'India' ? (
                                  <span className="badge-nirf" title={`NIRF Rank #${p.nirf_rank} in India`}>
                                    🏆 {p.nirf_label}
                                  </span>
                                ) : p.country ? (
                                  <span className="badge-country">
                                    {p.country}
                                  </span>
                                ) : null}
                              </div>
                              <div className="prof-uni">{p.university}</div>
                              <div className="prof-dept">{p.department}</div>
                            </div>

                            <div className="prof-focus">
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>
                                Verified Recent Work ({p.publication_year || 'Latest'})
                              </div>
                              <div style={{ fontWeight: 500 }}>{p.research_focus}</div>
                              {p.publication_venue && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text3)', marginTop: 4 }}>
                                  📍 {p.publication_venue}
                                </div>
                              )}
                            </div>

                            {p.match_reason && (
                              <div className="prof-match">
                                <span>🎯</span>
                                <div>{p.match_reason}</div>
                              </div>
                            )}

                            <div className="prof-footer">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {p.email ? (
                                  <span className="badge badge-verified" title={p.email}>
                                    ✓ {p.email}
                                  </span>
                                ) : (
                                  <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text3)', fontSize: '0.72rem' }}>
                                    Auto-verifying on draft
                                  </span>
                                )}
                                {p.doi && (
                                  <a
                                    href={p.doi}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: '0.76rem', color: 'var(--accent2)', textDecoration: 'none' }}
                                    title="View verified publication on DOI"
                                  >
                                    DOI ↗
                                  </a>
                                )}
                              </div>

                              <button
                                id={`draft-email-prof-${idx}`}
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  handleStartCampaign(
                                    p.name,
                                    p.university,
                                    `Targeting research in ${p.research_focus}. Candidate degree goal: ${discoverDegree}.`
                                  );
                                }}
                              >
                                🚀 Draft Email
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* RECENT CAMPAIGNS TABLE */}
            {campaigns.length > 0 && (
              <div style={{ maxWidth: 880, margin: '40px auto 0' }}>
                <div className="flex-between mb-4">
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text2)' }}>Recent Campaigns</h2>
                  <Link href="/history" className="btn btn-outline btn-sm">View All</Link>
                </div>
                <div className="review-panel">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Professor</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Recipient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.slice(0, 5).map(c => (
                        <tr
                          key={c.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/campaign/${c.id}`)}
                        >
                          <td className="professor-cell">
                            <div>{c.professor_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{c.university}</div>
                          </td>
                          <td><StatusBadge status={c.status} /></td>
                          <td style={{ fontSize: '0.8rem' }}>
                            {c.sent_at ? new Date(c.sent_at).toLocaleDateString() :
                             c.scheduled_send_at ? '⏰ ' + new Date(c.scheduled_send_at).toLocaleString() :
                             new Date(c.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            {c.recipient_email
                              ? <span className="font-mono" style={{ fontSize: '0.78rem' }}>{c.recipient_email}</span>
                              : <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* QUICK RESUME UPLOAD MODAL */}
      {showResumeModal && (
        <div className="modal-overlay" onClick={() => !resumeParsing && setShowResumeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex-between mb-4">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>📄 Upload or Update Resume</h3>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowResumeModal(false)}
                disabled={resumeParsing}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 16 }}>
              Gemini will extract your educational background, target degree, technical skills, and research projects to customize every email and match you with top labs.
            </p>

            <div
              className="upload-zone mb-4"
              onClick={() => resumeFileRef.current?.click()}
            >
              <input
                ref={resumeFileRef}
                type="file"
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={handleResumeFileUpload}
              />
              <div className="upload-zone-icon">📤</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>
                {resumeParsing ? 'Analyzing Document with AI...' : 'Click to Upload Resume Document'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                Accepts PDF, TXT, or MD files
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Or Paste Resume / CV Text</label>
              <textarea
                className="form-textarea"
                rows={6}
                placeholder="Paste summary of your academic background, projects, and degree goals..."
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
              />
            </div>

            <div className="flex-between mt-4">
              <button
                className="btn btn-outline"
                onClick={() => setShowResumeModal(false)}
                disabled={resumeParsing}
              >
                Cancel
              </button>
              <button
                id="modal-parse-btn"
                className="btn btn-primary"
                onClick={handleResumeTextSubmit}
                disabled={resumeParsing || !resumeText.trim()}
              >
                {resumeParsing ? <><div className="spinner" /> Parsing Resume...</> : '✨ Parse & Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

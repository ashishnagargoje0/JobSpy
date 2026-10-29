import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const SOURCES = ['All sources', 'LinkedIn', 'Indeed', 'Naukri', 'Glassdoor', 'Zip Recruiter', 'Google', 'Bayt', 'Bdjobs', 'Hellowork'];

function App() {
  const [query, setQuery] = useState('Golang Developer');
  const [location, setLocation] = useState('Pune');
  const [source, setSource] = useState('All sources');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [notice, setNotice] = useState('Search jobs to fetch live results from JobSpy.');

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(response => { if (!response.ok) throw new Error('API unavailable'); return response.json(); })
      .then(() => setApiStatus('connected'))
      .catch(() => setApiStatus('offline'));
  }, []);

  const filteredJobs = useMemo(() => jobs.filter(job =>
    (source === 'All sources' || job.source.toLowerCase() === source.toLowerCase()) &&
    (!remoteOnly || job.remote) && (!savedOnly || saved.includes(job.id))
  ), [jobs, source, remoteOnly, savedOnly, saved]);

  async function runSearch(e) {
    e?.preventDefault();
    if (!query.trim()) { setNotice('Enter a job title or keyword first.'); return; }
    setLoading(true); setSearched(true); setNotice('Searching selected job boards. This can take a little while.');
    try {
      const response = await fetch(`${API_BASE}/api/jobs/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_term: query.trim(), location: location.trim(),
          sites: ['linkedin', 'indeed', 'naukri', 'glassdoor'],
          results_wanted: 500, is_remote: remoteOnly, country_indeed: 'india'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `API returned ${response.status}`);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setSource('All sources'); setSavedOnly(false);
      const issueCount = Object.keys(data.errors || {}).length;
      setNotice(`${data.count ?? data.jobs?.length ?? 0} live results received from JobSpy.${issueCount ? ` Some sources reported errors (${issueCount}).` : ''}`);
      setApiStatus('connected');
    } catch (error) {
      setApiStatus('offline');
      setNotice(`Could not fetch jobs: ${error.message}. Check that the FastAPI backend is running on port 8000.`);
    } finally { setLoading(false); }
  }

  function toggleSaved(id) { setSaved(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); }
  function exportCsv() {
    if (!filteredJobs.length) { setNotice('There are no results to export.'); return; }
    const cols = ['title','company','location','source','type','level','salary','posted','email','contact_number','url'];
    const csv = [cols.join(','), ...filteredJobs.map(job => cols.map(key => `"${String(job[key] ?? '').replaceAll('"','""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; const safeQuery = (query || 'jobs')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'jobs';
    const date = new Date().toISOString().slice(0, 10);
    link.download = `${safeQuery}_${date}.csv`; link.click(); URL.revokeObjectURL(url);
    setNotice('CSV exported successfully.');
  }
  const stats = [
    { label: 'Matching jobs', value: filteredJobs.length, icon: '↗' },
    { label: 'Sources', value: new Set(filteredJobs.map(j => j.source)).size, icon: '◎' },
    { label: 'Saved jobs', value: saved.length, icon: '♡' }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="JobSpy home"><span className="brand-mark">J</span><span>jobspy<span className="brand-dot">.</span></span></a>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${!savedOnly ? 'active' : ''}`} onClick={() => { setSavedOnly(false); window.scrollTo({top:0,behavior:'smooth'}); }}><span className="nav-icon">⌕</span> Find jobs</button>
      <button className={`nav-item ${savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(v => !v)}><span className="nav-icon">♡</span> Saved jobs <span className="nav-count">{saved.length}</span></button>
      <div className="sidebar-bottom"><div className="help-icon">?</div><div><strong>JobSpy API</strong><p>{apiStatus === 'connected' ? 'Backend connected' : apiStatus === 'checking' ? 'Checking backend…' : 'Backend offline'}</p></div></div>
    </aside>

    <main className="main-content" id="top">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{savedOnly ? 'Saved jobs' : 'Find jobs'}</strong></div><div className="profile"><span className="status-dot" style={{background: apiStatus === 'connected' ? '#31a46c' : apiStatus === 'checking' ? '#d6a43c' : '#c64b4b'}}></span><span>{apiStatus === 'connected' ? 'API connected' : apiStatus === 'checking' ? 'Connecting…' : 'API offline'}</span><div className="avatar">JS</div></div></header>
      <section className="page-heading"><div><div className="eyebrow">JOB DISCOVERY</div><h1>Find your next opportunity<span>.</span></h1><p>Search live job listings using your local JobSpy scraper.</p></div><button className="button button-light" onClick={exportCsv}><span>↓</span> Export CSV</button></section>

      <form className="search-panel" onSubmit={runSearch}>
        <label className="search-field"><span className="field-icon">⌕</span><span className="field-content"><span className="field-label">Job title or keywords</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Golang Developer" /></span></label>
        <div className="search-divider"></div>
        <label className="search-field location-field"><span className="field-icon">⌖</span><span className="field-content"><span className="field-label">Location</span><input value={location} onChange={e => setLocation(e.target.value)} placeholder="City or remote" /></span></label>
        <button className="button button-primary search-button" type="submit" disabled={loading}><span>{loading ? '…' : '⌕'}</span> {loading ? 'Searching…' : 'Search jobs'}</button>
      </form>

      <div className="stats-grid">{stats.map(s => <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className="stat-icon">{s.icon}</span></div><div className="stat-value">{String(s.value).padStart(2,'0')}</div></div>)}</div>

      <section className="results-section">
        <div className="results-heading"><div><h2>{savedOnly ? 'Saved jobs' : 'Job matches'}</h2><p>{filteredJobs.length} {searched ? 'results' : 'results yet'} <span className="demo-pill">{searched ? 'LIVE SEARCH' : 'READY TO SEARCH'}</span></p></div><button className="text-button" onClick={() => { setQuery(''); setLocation(''); setSource('All sources'); setRemoteOnly(false); setSavedOnly(false); setNotice('Filters cleared. Enter a keyword to search again.'); }}>Clear filters <span>↗</span></button></div>
        <div className="filter-bar"><div className="filter-left"><label className="select-wrap"><span>Source</span><select value={source} onChange={e => setSource(e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select><span className="select-arrow">⌄</span></label><label className="check-filter"><input type="checkbox" checked={remoteOnly} onChange={e => setRemoteOnly(e.target.checked)} /><span className="custom-check">✓</span> Remote only</label></div><div className="sort-label"><span className="sort-dot"></span> Live JobSpy results</div></div>

        <div className="job-list">{filteredJobs.map(job => <article className="job-card" key={job.id}><div className="company-logo" data-source={job.source}>{(job.company || 'NA').split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase()}</div><div className="job-main"><div className="job-title-row"><h3>{job.title}</h3><button className={`save-button ${saved.includes(job.id) ? 'is-saved' : ''}`} onClick={() => toggleSaved(job.id)} aria-label={saved.includes(job.id) ? 'Remove saved job' : 'Save job'} title={saved.includes(job.id) ? 'Unsave job' : 'Save job'}>{saved.includes(job.id) ? '♥' : '♡'}</button></div><div className="company-line"><strong>{job.company || 'Company not listed'}</strong><span className="bullet">·</span><span>{job.location || 'Location not listed'}</span></div><p className="job-description">{job.description || 'No description provided.'}</p><div className="tag-row">{(job.tags || []).map((tag, i) => <span className="skill-tag" key={`${tag}-${i}`}>{tag}</span>)}</div><div className="job-meta"><span className="source-tag"><span className="source-dot" data-source={job.source}></span>{job.source}</span><span>{job.type || 'Not listed'}</span><span>{job.level || 'Not listed'}</span><span>{job.posted || 'Date not listed'}</span></div></div><div className="job-side"><div className="salary">{job.salary || 'Not listed'}</div>{job.url ? <a className="apply-link" href={job.url} target="_blank" rel="noreferrer">View job <span>↗</span></a> : <span className="apply-link">Link unavailable</span>}</div></article>)}
          {filteredJobs.length === 0 && <div className="empty-state"><div className="empty-icon">⌕</div><h3>{loading ? 'Searching job boards…' : savedOnly ? 'No saved jobs yet' : searched ? 'No matching jobs' : 'Ready when you are'}</h3><p>{loading ? 'Scraping can take a little while. Please keep this page open.' : searched ? 'Try another keyword, location, or source filter.' : 'Enter a job title and location above, then search live listings.'}</p>{!loading && searched && <button className="button button-light" onClick={() => {setQuery('');setLocation('');setSource('All sources');setRemoteOnly(false);setSavedOnly(false);}}>Clear filters</button>}</div>}
        </div>
      </section>
      <div className="footer-note">
        <span className="footer-mark">J</span>
        <span>
          <strong>JobSpy by <a href="https://codecrushers.in" target="_blank" rel="noreferrer">CodeCrushers.in</a></strong>
          <span className="footer-disclaimer">For educational purposes only. Job listings are collected from supported third-party job boards; availability and accuracy depend on each source.</span>
        </span>
        <a href="https://github.com/ashishnagargoje0/JobSpy" target="_blank" rel="noreferrer">Powered by JobSpy ↗</a>
      </div>
    </main>
    {notice && <div className="toast" role="status"><span>●</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

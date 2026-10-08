'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowUpRight, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Check, X, Clock, UserRound, LayoutDashboard, LogOut, Leaf, LoaderCircle, RefreshCw, IndianRupee, ShieldCheck, AlertCircle, Mail, Phone, CheckCheck } from 'lucide-react';
import { Brand } from '../../components/site-chrome';
import { api, indiaToday, formatDate, formatTime, money } from '../../lib/api';

const hourRows = Array.from({ length: 11 }, (_, index) => index + 9);
const minuteValue = time => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
const dayOffset = (date, amount) => { const next = new Date(`${date || indiaToday()}T12:00:00`); next.setDate(next.getDate() + amount); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`; };

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [date, setDate] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [demo, setDemo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('calendar');
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [liveStatus, setLiveStatus] = useState('connecting');
  const [streamCycle, setStreamCycle] = useState(0);
  const request = useRef(0);
  const snapshotRevision = useRef(0);
  const liveCleanup = useRef(() => {});
  const viewContext = useRef({ user, date });
  const modalRef = useRef(null);
  viewContext.current = { user, date };

  useEffect(() => {
    setDate(indiaToday());
    api('/admin/session').then(value => {
      setUser(value.user);
      if (typeof value.demo === 'boolean') setDemo(value.demo);
    }).catch(() => {}).finally(() => setChecking(false));
    api('/catalog').then(value => {
      setCatalog(value);
      if (typeof value.demo === 'boolean') setDemo(value.demo);
    }).catch(() => {});
  }, []);
  const applyBookings = value => {
    setData(value);
    setSelected(current => current ? value.bookings.find(booking => booking.reference === current.reference) || null : null);
    setError('');
  };
  const clearAdminSession = message => {
    liveCleanup.current();
    request.current++;
    snapshotRevision.current++;
    viewContext.current = { user: null, date: '' };
    setUser(null);
    setData(null);
    setSelected(null);
    setAction('');
    setActionError('');
    setActionPending(false);
    setNotice('');
    setPassword('');
    setLoading(false);
    setLiveStatus('disconnected');
    setError(message);
  };
  const load = async (quiet = false) => {
    if (!user || !date) return;
    const current = ++request.current;
    const revision = snapshotRevision.current;
    const currentView = () => viewContext.current.user === user && viewContext.current.date === date;
    if (!quiet) setLoading(true);
    try {
      const value = await api(`/admin/bookings?date=${encodeURIComponent(date)}`);
      if (currentView() && current === request.current && revision === snapshotRevision.current) applyBookings(value);
    } catch (e) { if (currentView() && current === request.current && revision === snapshotRevision.current) setError(e.message); }
    finally { if (currentView() && current === request.current) setLoading(false); }
  };
  useEffect(() => {
    if (!user || !date) {
      setData(null);
      setSelected(null);
      setAction('');
      setActionError('');
      setActionPending(false);
      setNotice('');
      setLoading(false);
      setLiveStatus('disconnected');
      if (user && !date) setError('Choose a date to view its appointments.');
      return;
    }
    let active = true;
    let stream = null;
    let reconnectTimer = null;
    let sessionController = null;
    let reconnectDelay = 1000;
    const currentView = () => active && viewContext.current.user === user && viewContext.current.date === date;
    const cleanup = () => {
      active = false;
      clearTimeout(reconnectTimer);
      sessionController?.abort();
      if (stream) {
        stream.onopen = null;
        stream.onerror = null;
        stream.removeEventListener('bookings', receiveBookings);
        stream.removeEventListener('session-expired', expireSession);
        stream.close();
        stream = null;
      }
      request.current++;
      snapshotRevision.current++;
      if (liveCleanup.current === cleanup) liveCleanup.current = () => {};
    };
    const expireSession = () => {
      if (currentView()) clearAdminSession('Your administrator session has expired. Please sign in again.');
    };
    const scheduleReconnect = () => {
      if (!currentView()) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
    const checkSessionAndReconnect = async () => {
      if (!currentView()) return;
      setLiveStatus('reconnecting');
      if (stream) {
        stream.onopen = null;
        stream.onerror = null;
        stream.removeEventListener('bookings', receiveBookings);
        stream.removeEventListener('session-expired', expireSession);
        stream.close();
        stream = null;
      }
      sessionController?.abort();
      const controller = new AbortController();
      sessionController = controller;
      try {
        const response = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!currentView() || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { expireSession(); return; }
        if (response.ok) {
          const value = await response.json();
          if (!currentView() || controller.signal.aborted) return;
          if (!value.user) { expireSession(); return; }
          if (typeof value.demo === 'boolean') setDemo(value.demo);
        }
      } catch (e) {
        if (controller.signal.aborted || !currentView()) return;
      } finally {
        if (sessionController === controller) sessionController = null;
      }
      scheduleReconnect();
    };
    const receiveBookings = event => {
      if (!currentView()) return;
      try {
        const value = JSON.parse(event.data);
        if (!Array.isArray(value.bookings) || !value.stats) throw new Error('Invalid booking snapshot');
        snapshotRevision.current++;
        applyBookings(value);
        setLoading(false);
        setLiveStatus('connected');
        reconnectDelay = 1000;
      } catch {
        setError('A live booking update could not be read. Reconnecting to the calendar…');
        checkSessionAndReconnect();
      }
    };
    const connect = () => {
      if (!currentView()) return;
      if (!window.EventSource) {
        setLiveStatus('unavailable');
        setError('Live updates are unavailable in this browser. Use Refresh to retrieve the latest bookings.');
        return;
      }
      const source = new EventSource(`/api/admin/bookings/live?date=${encodeURIComponent(date)}`);
      stream = source;
      source.addEventListener('bookings', receiveBookings);
      source.addEventListener('session-expired', expireSession);
      source.onerror = () => { if (currentView() && stream === source) checkSessionAndReconnect(); };
    };
    liveCleanup.current = cleanup;
    setData(null);
    setSelected(null);
    setAction('');
    setActionError('');
    setActionPending(false);
    setNotice('');
    setError('');
    setLiveStatus('connecting');
    load();
    connect();
    return cleanup;
  }, [user, date, streamCycle]);
  useEffect(() => { if (!selected || selected.status !== 'confirmed') setAction(''); }, [selected?.reference, selected?.status]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement;
    modalRef.current?.focus();
    const key = event => {
      if (event.key === 'Escape' && !actionPending) { setSelected(null); setAction(''); }
      if (event.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll('button:not(:disabled), a, input');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key); const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [Boolean(selected), actionPending]);

  const login = async event => { event.preventDefault(); setLoginPending(true); setError(''); try { const value = await api('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setUser(value.user); if (typeof value.demo === 'boolean') setDemo(value.demo); } catch (e) { setError(e.message); } finally { setLoginPending(false); } };
  const logout = async () => {
    liveCleanup.current();
    setLiveStatus('disconnected');
    try { await api('/admin/logout', { method: 'POST' }); clearAdminSession(''); }
    catch (e) { setError(e.message); setStreamCycle(value => value + 1); }
  };
  const mutate = async () => {
    const revision = snapshotRevision.current;
    const currentView = () => viewContext.current.user === user && viewContext.current.date === date;
    setActionPending(true);
    setActionError('');
    try {
      const value = await api(`/admin/bookings/${encodeURIComponent(selected.reference)}/${action}`, { method: 'POST' });
      if (!currentView()) return;
      if (revision === snapshotRevision.current) setSelected(value.booking);
      setNotice(`Sample appointment ${action === 'cancel' ? 'cancelled' : 'completed'}.`);
      setAction('');
      await load(true);
    } catch (e) { if (currentView()) setActionError(e.message); }
    finally { if (currentView()) setActionPending(false); }
  };
  const open = booking => { setSelected(booking); setAction(''); setActionError(''); };
  const filtered = data?.bookings.filter(booking => filter === 'all' || booking.status === filter) || [];
  const stats = data?.stats || { appointments: 0, revenue: 0, confirmed: 0, cancelled: 0 };
  const liveLabel = liveStatus === 'connected' ? 'Live connected' : liveStatus === 'reconnecting' ? 'Reconnecting…' : liveStatus === 'connecting' ? 'Connecting live…' : liveStatus === 'unavailable' ? 'Live unavailable' : 'Live disconnected';
  const liveGuidance = liveStatus === 'connected' ? 'Bookings update live' : liveStatus === 'reconnecting' ? 'Reconnecting · Latest received bookings shown' : liveStatus === 'connecting' ? 'Connecting to live bookings…' : 'Live updates unavailable · Use Refresh';

  if (checking) return <div className="admin-loading"><LoaderCircle className="spin" /><p>Preparing your salon workspace…</p></div>;
  if (!user) return <section className="admin-login"><div className="admin-login-story"><Brand light /><div><p className="eyebrow">THE SPACE BEHIND THE EXPERIENCE</p><h1>A smoother day.<br /><em>A happier salon.</em></h1><p>One thoughtful workspace for appointments,<br />availability, and a little less admin.</p><div className="login-preview-card"><span className="avatar">M</span><div>Signature Cut<small>10:00 AM · Maya · Sample appointment</small></div><span className="status-pill confirmed"><Check size={11} />Confirmed</span></div></div><span className="eyebrow">EDEN SALON DEMO · ADMIN WORKSPACE</span></div><div className="admin-login-form"><Link href="/" className="text-link"><ArrowLeft size={16} />Back to the salon demo</Link><div><span className="service-icon"><ShieldCheck size={23} strokeWidth={1.3} /></span><p className="eyebrow">WELCOME TO YOUR WORKSPACE</p><h2>A little order.<br /><em>A lot of possibility.</em></h2><p>Sign in to explore the sample salon calendar.</p><form onSubmit={login}><div className="form-fields"><label>Email address<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder={demo === true ? 'owner@eden.demo' : 'Your administrator email'} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" /></label></div>{error && <div className="inline-error" role="alert">{error}</div>}<button className="button full" disabled={loginPending}>{loginPending ? <><LoaderCircle size={17} className="spin" />Signing in…</> : <>Open your workspace<ArrowUpRight size={17} /></>}</button>{demo === true && <button type="button" className="button outline full demo-login" onClick={() => { setEmail('owner@eden.demo'); setPassword('EdenDemo2026!'); setError(''); }}>Use demo login<Leaf size={16} /></button>}<p className="small-note">{demo === true ? 'Demo access is for local Firestore only. This is an independent portfolio administration system.' : demo === false ? 'Connected to Cloud Firestore. Sign in with the configured administrator credentials.' : 'Sign in with the configured administrator credentials.'}</p></form></div><span className="admin-login-footer">BUILT BY PRITAM BADAGI · INDEPENDENT PORTFOLIO CONCEPT</span></div></section>;

  return <div className="admin-shell"><aside className="admin-sidebar"><Brand /><span className="eyebrow admin-workspace-label">SALON WORKSPACE</span><button className="admin-nav-item active" onClick={() => setView('calendar')}><CalendarDays size={19} />Appointments<span>{stats.appointments}</span></button><button className="admin-nav-item" onClick={() => setView('list')}><LayoutDashboard size={19} />Visit overview</button><Link href="/services" className="admin-nav-item"><Leaf size={19} />Sample services<ArrowUpRight size={14} /></Link><div className="sidebar-note"><Leaf size={25} strokeWidth={1.2} /><h3>A calmer salon day.</h3><p>Available slots update as you book, complete, and cancel sample visits.</p><Link href="/book">Try customer booking<ArrowUpRight size={14} /></Link></div><div className="admin-user"><span className="avatar small">P</span><div>{user.name || 'Demo owner'}<small>Demo administrator</small></div><button onClick={logout} aria-label="Sign out"><LogOut size={17} /></button></div></aside><div className="admin-content"><header className="admin-topbar"><span>Workspace<span className="breadcrumb-divider">/</span>Appointments</span><div><span className="live-indicator" role="status" aria-live="polite" title={liveGuidance}><span style={{ backgroundColor: liveStatus === 'connected' ? '#849861' : '#b08a52' }} />{demo === true ? 'Local Firestore' : demo === false ? 'Cloud Firestore' : 'Firestore'} · {liveLabel}</span><Link href="/" className="text-link">View website<ArrowUpRight size={15} /></Link><button onClick={logout} className="mobile-logout" aria-label="Sign out"><LogOut size={18} /></button></div></header><div className="dashboard-main"><div className="dashboard-heading"><div><p className="eyebrow">A FRESH START TO YOUR SALON DAY</p><h1>Your day, <em>beautifully organised.</em></h1><p>A little overview of every moment on the calendar.</p></div><Link href="/book" className="button small">New sample visit<ArrowUpRight size={16} /></Link></div><div className="stats-grid"><div><span><CalendarDays size={17} />Appointments</span><strong>{stats.appointments}</strong><small>Scheduled on this day</small></div><div><span><CheckCheck size={17} />Confirmed</span><strong>{stats.confirmed}</strong><small>Moments to look forward to</small></div><div><span><IndianRupee size={17} />Booked value</span><strong>{money(stats.revenue)}</strong><small>Reserved value · no payments</small></div><div><span><X size={17} />Cancelled</span><strong>{stats.cancelled}</strong><small>Slots made available again</small></div></div>{error && <div className="inline-error" role="alert">{error}<button onClick={() => load()}>Retry</button></div>}{notice && <div className="inline-success" role="status"><Check size={17} />{notice}</div>}<section className="calendar-panel"><div className="calendar-toolbar"><div className="calendar-day-title"><h2>{date && formatDate(date, { month: 'long', weekday: 'long' })}</h2><span>{date?.slice(0, 4)} · India Standard Time</span></div><div className="calendar-controls"><button aria-label="Previous day" onClick={() => setDate(dayOffset(date, -1))}><ChevronLeft size={18} /></button><button className="today-button" onClick={() => setDate(indiaToday())}>Today</button><button aria-label="Next day" onClick={() => setDate(dayOffset(date, 1))}><ChevronRight size={18} /></button><input type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="Calendar date" /><button aria-label="Refresh appointments" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div></div><div className="calendar-filter-row"><div className="status-filters">{[['all', 'All visits'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="view-switch"><button aria-label="Calendar view" className={view === 'calendar' ? 'selected' : ''} onClick={() => setView('calendar')}><CalendarDays size={16} /></button><button aria-label="List view" className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><LayoutDashboard size={16} /></button></div></div>{loading && !data ? <div className="state-box"><LoaderCircle className="spin" /><p>Gathering today's moments…</p></div> : view === 'calendar' ? <div className="calendar-scroll"><div className="day-calendar"><div className="calendar-staff-row"><div className="time-column-label">TIME</div>{catalog?.staff.map(staff => <div key={staff.id}><span className="avatar small" style={{ backgroundColor: staff.color || '#dbe1d4' }}>{staff.initials}</span><span><strong>{staff.name}</strong><small>{staff.role} · Demo</small></span></div>)}</div><div className="calendar-body"><div className="calendar-times">{hourRows.map(hour => <div key={hour}>{formatTime(`${String(hour).padStart(2, '0')}:00`)}</div>)}</div>{catalog?.staff.map(staff => <div className="staff-track" key={staff.id}>{hourRows.map(hour => <div className={`hour-cell ${hour === 13 ? 'lunch-hour' : ''}`} key={hour}>{hour === 13 && <span>RESET & LUNCH</span>}</div>)}{filtered.filter(booking => booking.staffId === staff.id).map(booking => <button key={booking.id || booking.reference} className={`calendar-booking ${booking.status}`} style={{ top: `${(minuteValue(booking.time) - 540) * 1.2}px`, height: `${Math.max(36, booking.duration * 1.2 - 4)}px` }} onClick={() => open(booking)}><span>{formatTime(booking.time)}<span className="booking-status-dot" /></span><strong>{booking.serviceName}</strong>{booking.duration >= 45 && <small>{booking.customer.name}</small>}</button>)}</div>)}</div></div></div> : <div className="appointment-list">{!filtered.length ? <div className="state-box"><CalendarDays size={30} strokeWidth={1} /><h3>A little room on the calendar.</h3><p>No {filter === 'all' ? '' : filter} appointments for this day.</p><Link href="/book" className="text-link">Create a sample visit<ArrowUpRight size={16} /></Link></div> : filtered.map(booking => <button key={booking.reference} className="appointment-row" onClick={() => open(booking)}><span className="appointment-time">{formatTime(booking.time)}<small>{booking.duration} min</small></span><span className="appointment-description"><strong>{booking.serviceName}</strong><small>{booking.customer.name} · {booking.staffName}</small></span><span className={`status-pill ${booking.status}`}>{booking.status}</span><strong className="appointment-price">{money(booking.price)}</strong><ArrowUpRight size={18} /></button>)}</div>}<div className="calendar-legend"><span><i className="confirmed" />Confirmed</span><span><i className="completed" />Completed</span><span><i className="cancelled" />Cancelled</span><small>{liveGuidance} · Demo staff and appointments</small></div></section><p className="dashboard-footnote">EDEN SALON DEMO · Independent portfolio project by Pritam Badagi. No real appointments or payments.</p></div></div>{selected && <div className="modal-backdrop" onClick={() => { if (!actionPending) { setSelected(null); setAction(''); } }}><section ref={modalRef} tabIndex={-1} className="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="visit-title" onClick={event => event.stopPropagation()}><div className="modal-heading"><p className="eyebrow">SAMPLE APPOINTMENT DETAILS</p><button aria-label="Close appointment details" disabled={actionPending} onClick={() => { setSelected(null); setAction(''); }}><X size={20} /></button></div><span className={`status-pill ${selected.status}`}>{selected.status}</span><h2 id="visit-title">{selected.serviceName}</h2><p className="booking-reference">{selected.reference}</p><div className="modal-detail"><CalendarDays size={18} /><span>{formatDate(selected.date, { year: 'numeric' })}</span></div><div className="modal-detail"><Clock size={18} /><span>{formatTime(selected.time)} – {formatTime(selected.endTime)} · {selected.duration} min</span></div><div className="modal-detail"><UserRound size={18} /><span>{selected.staffName} · Sample stylist</span></div><div className="modal-customer"><span className="eyebrow">BOOKED FOR</span><h3>{selected.customer.name}</h3><p><Mail size={15} />{selected.customer.email}</p><p><Phone size={15} />{selected.customer.phone}</p></div><div className="modal-total"><span>Sample total</span><strong>{money(selected.price)}</strong></div>{actionError && <div className="inline-error" role="alert">{actionError}</div>}{selected.status === 'confirmed' && (action ? <div className="modal-confirm"><p>{action === 'cancel' ? 'Cancel this demo visit and release the reserved slot?' : 'Mark this demo visit as completed?'}</p><button className={`button full ${action === 'cancel' ? 'danger' : ''}`} onClick={mutate} disabled={actionPending}>{actionPending ? <><LoaderCircle size={16} className="spin" />Updating…</> : action === 'cancel' ? 'Yes, cancel this visit' : 'Yes, mark as completed'}</button><button className="text-link" onClick={() => setAction('')} disabled={actionPending}>Go back</button></div> : <div className="modal-actions"><button className="button full" onClick={() => setAction('complete')} disabled={new Date(`${selected.date}T${selected.time}:00+05:30`).getTime() > Date.now()} title="Visits can be completed after their start time"><CheckCheck size={17} />Mark as completed</button><button className="button outline full" onClick={() => setAction('cancel')}>Cancel sample visit</button></div>)}<p className="small-note">Changes affect the portfolio demo only.</p></section></div>}</div>;
}

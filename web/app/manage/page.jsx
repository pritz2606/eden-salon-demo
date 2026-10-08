'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock, UserRound, ShieldCheck, Leaf, LoaderCircle, ArrowRight, AlertCircle, Check, RefreshCw } from 'lucide-react';
import { api, formatDate, formatTime, money } from '../../lib/api';

export default function ManagePage() {
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (ref = reference, code = token) => {
    setLoading(true); setError(''); setNotice('');
    try { const data = await api(`/bookings/${encodeURIComponent(ref.trim())}`, { headers: { Authorization: `Bearer ${code.trim()}` } }); setBooking(data.booking); }
    catch (e) { setError(e.message); setBooking(null); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem('eden-last-booking')); } catch {}
    const ref = params.get('reference') || saved?.reference;
    const code = params.get('token') || saved?.token;
    if (ref && code) { setReference(ref); setToken(code); load(ref, code); }
  }, []);

  const cancel = async () => {
    setCancelLoading(true); setError('');
    try { const data = await api(`/bookings/${encodeURIComponent(booking.reference)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token.trim()}` } }); setBooking(data.booking); setConfirmCancel(false); setNotice('Your sample appointment has been cancelled. The time is available for someone else to book.'); }
    catch (e) { setError(e.message); }
    finally { setCancelLoading(false); }
  };

  return <>
    <section className="page-intro manage-intro"><p className="eyebrow">YOUR VISIT, AT A GLANCE</p><h1>A little less admin.<br /><em>A little more ease.</em></h1><p>View your sample appointment or cancel a visit.<br />Your booking reference and private access code are all you need.</p></section>
    <section className="manage-layout"><div>{!booking && <form className="manage-form" onSubmit={event => { event.preventDefault(); load(); }}><span className="service-icon"><CalendarDays size={23} strokeWidth={1.3} /></span><h2>Find your booking.</h2><p>Use the details from your booking confirmation.</p><div className="form-fields"><label>Booking reference<input value={reference} onChange={event => setReference(event.target.value)} required placeholder="e.g. EDN-…" autoComplete="off" spellCheck={false} /></label><label>Private access code<input value={token} onChange={event => setToken(event.target.value)} required placeholder="Your private booking access code" type="password" autoComplete="off" /></label></div><button className="button full" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={17} />Finding your visit…</> : <>View my booking<ArrowRight size={17} /></>}</button></form>}{error && <div className="inline-error" role="alert"><AlertCircle size={18} />{error}</div>}{notice && <div className="inline-success" role="status"><Check size={18} />{notice}</div>}{booking && <article className="managed-booking"><div className="managed-booking-top"><span className="eyebrow">YOUR SAMPLE APPOINTMENT</span><span className={`status-pill ${booking.status}`}>{booking.status}</span></div><h2>{booking.serviceName}</h2><p className="booking-reference">REFERENCE · {booking.reference}</p><div className="managed-detail-grid"><div><CalendarDays size={20} strokeWidth={1.4} /><small>THE DAY</small><strong>{formatDate(booking.date, { year: 'numeric' })}</strong></div><div><Clock size={20} strokeWidth={1.4} /><small>THE MOMENT</small><strong>{formatTime(booking.time)} – {formatTime(booking.endTime)}</strong><span>India Standard Time</span></div><div><UserRound size={20} strokeWidth={1.4} /><small>YOUR SAMPLE STYLIST</small><strong>{booking.staffName}</strong></div><div><Leaf size={20} strokeWidth={1.4} /><small>THE DETAILS</small><strong>{booking.duration} min · {money(booking.price)}</strong></div></div><div className="managed-customer"><span>BOOKED FOR</span><strong>{booking.customer.name}</strong><p>{booking.customer.email}</p></div>{booking.status === 'confirmed' ? confirmCancel ? <div className="cancel-confirm"><AlertCircle size={21} /><div><h3>Cancel this sample visit?</h3><p>Your slot will be released immediately. You can always book another moment.</p><div><button className="button danger small" onClick={cancel} disabled={cancelLoading}>{cancelLoading ? 'Cancelling…' : 'Yes, cancel my visit'}</button><button className="button outline small" onClick={() => setConfirmCancel(false)} disabled={cancelLoading}>Keep my visit</button></div></div></div> : <div className="managed-actions"><button className="text-link" onClick={() => load()} disabled={loading}><RefreshCw size={15} />{loading ? 'Refreshing…' : 'Refresh details'}</button><button className="cancel-link" onClick={() => setConfirmCancel(true)}>Cancel appointment</button></div> : <div className="managed-actions"><span className="small-note">This appointment is {booking.status}.</span><Link href="/book" className="text-link">Find another moment<ArrowUpRight size={17} /></Link></div>}</article>}</div><aside className="manage-aside"><Leaf size={36} strokeWidth={1} /><h3>Plans change.<br /><em>We get it.</em></h3><p>Manage your visit at your own pace. Your private access code keeps your booking details between you and the demo system.</p><div className="privacy-note"><ShieldCheck size={18} /><p>Keep your management link private. It gives access to view and cancel this sample appointment.</p></div><Link href="/book" className="text-link">Book a new visit<ArrowUpRight size={17} /></Link><span className="demo-label">NO REAL SALON APPOINTMENTS</span></aside></section>
  </>;
}

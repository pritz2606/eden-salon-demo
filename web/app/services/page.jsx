'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock, Scissors, Sparkles, Leaf, Flower2, LoaderCircle, RefreshCw } from 'lucide-react';
import { api, money } from '../../lib/api';

const categoryIcons = { Hair: Scissors, Skin: Sparkles, Wellness: Leaf, Nails: Flower2 };
export default function ServicesPage() {
  const [catalog, setCatalog] = useState(null);
  const [category, setCategory] = useState('All');
  const [error, setError] = useState('');
  const load = () => { setError(''); api('/catalog').then(setCatalog).catch(e => setError(e.message)); };
  useEffect(() => { const wanted = new URLSearchParams(window.location.search).get('category'); if (['Hair', 'Skin', 'Wellness', 'Nails'].includes(wanted)) setCategory(wanted); load(); }, []);
  const categories = ['All', ...new Set(catalog?.services.map(service => service.category) || ['Hair', 'Skin', 'Wellness', 'Nails'])];
  return <>
    <section className="page-intro"><p className="eyebrow">THE SAMPLE SERVICE MENU</p><h1>Little rituals.<br /><em>Lovely possibilities.</em></h1><p>Find a fresh look, a softer glow, or a moment of calm.<br />All services and prices below are for this portfolio demo.</p></section>
    <section className="section menu-section"><div className="filter-tabs" role="group" aria-label="Filter service category">{categories.map(value => <button key={value} className={value === category ? 'selected' : ''} onClick={() => setCategory(value)}>{value}{value === 'All' && <span>{catalog?.services.length || 8}</span>}</button>)}</div>{error ? <div className="state-box error"><p>{error}</p><button className="text-link" onClick={load}>Try again<RefreshCw size={16} /></button></div> : !catalog ? <div className="state-box"><LoaderCircle className="spin" /><p>Preparing the sample menu…</p></div> : <div className="menu-grid">{catalog.services.filter(service => category === 'All' || service.category === category).map(service => { const Icon = categoryIcons[service.category] || Leaf; return <article className="menu-card" key={service.id}><div className="menu-card-top"><span className="service-icon"><Icon size={23} strokeWidth={1.3} /></span><span className="eyebrow">{service.category}</span></div><h3>{service.name}</h3><p>{service.description}</p><div className="menu-card-bottom"><span><strong>{money(service.price)}</strong><small><Clock size={13} />{service.duration} min</small></span><Link href={`/book?service=${service.id}`} className="round-arrow" aria-label={`Book ${service.name}`}><ArrowUpRight size={21} /></Link></div></article>; })}</div>}<p className="small-note">Sample pricing in Indian rupees · Service duration includes the treatment only · All times shown in India Standard Time.</p></section>
    <section className="service-bottom-callout"><Leaf size={32} strokeWidth={1} /><div><p className="eyebrow">NOT SURE WHERE TO START?</p><h2>Start with a little <em>self-care.</em></h2><p>Choose a service and explore available slots. You can review everything before confirming.</p></div><Link href="/book" className="button">Find your moment<ArrowUpRight size={18} /></Link></section>
  </>;
}

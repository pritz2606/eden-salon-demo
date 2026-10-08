'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Leaf, Menu, X, MapPin, Instagram, Clock, ArrowRight } from 'lucide-react';

export function Brand({ light = false }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="Eden Salon demo home"><Leaf size={22} strokeWidth={1.3} /><span>eden<span className="brand-dot">.</span><small>SALON DEMO</small></span></Link>;
}

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .08 });
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  const admin = pathname.startsWith('/admin');
  return <>
    <div className="concept-banner"><span className="tiny-dot" />Eden Salon demo · Independent portfolio concept · No real appointments<span className="banner-credit">BY PRITAM BADAGI</span></div>
    {!admin && <header className="site-header"><div className="header-inner"><Brand /><nav className={menu ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">{[['/', 'Home'], ['/services', 'Services'], ['/about', 'Our story']].map(([href, label]) => <Link key={href} href={href} className={pathname === href ? 'active' : ''}>{label}</Link>)}</nav><div className="header-actions"><Link href="/manage" className="my-booking">My booking</Link><Link href="/book" className="button small">Book a visit<ArrowUpRight size={16} /></Link><button className="menu-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}>{menu ? <X /> : <Menu />}</button></div></div></header>}
    <main>{children}</main>
    {!admin && <footer className="site-footer"><div className="footer-top"><div><Brand light /><p>Make room for a little<br />more you.</p></div><div className="footer-links"><span className="eyebrow">EXPLORE</span><Link href="/services">The sample menu</Link><Link href="/book">Book a visit<ArrowUpRight size={14} /></Link><Link href="/manage">Manage your booking</Link><Link href="/about">Our story</Link></div><div className="footer-location"><span className="eyebrow">ROOTED IN MARGAO</span><p><MapPin size={17} />Malbhat, Margao<br />Goa, India</p><p className="footer-note">A design and engineering exploration<br />inspired by a local salon.</p></div><div className="footer-note-box"><Leaf size={25} strokeWidth={1} /><p>Thoughtful design.<br />A smoother salon day.</p><Link href="/admin">Explore the admin demo<ArrowRight size={16} /></Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Eden Salon demo · Built by Pritam Badagi</span><span>Sample services, team & pricing</span><Link href="/about#concept">About this concept<ArrowUpRight size={13} /></Link></div></footer>}
  </>;
}

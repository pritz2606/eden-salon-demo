'use client';
import { useEffect, useRef } from 'react';

export default function BotanicalScene({ compact = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = event => {
      if (!ref.current) return;
      const bounds = ref.current.getBoundingClientRect();
      ref.current.style.setProperty('--pointer-x', `${(event.clientX - bounds.left - bounds.width / 2) / 35}deg`);
      ref.current.style.setProperty('--pointer-y', `${-(event.clientY - bounds.top - bounds.height / 2) / 35}deg`);
    };
    const el = ref.current;
    el?.addEventListener('pointermove', move);
    return () => el?.removeEventListener('pointermove', move);
  }, []);
  return <div ref={ref} className={`botanical-scene ${compact ? 'compact' : ''}`} aria-hidden="true"><div className="sculpture-shadow" /><div className="sculpture-perspective"><div className="sculpture-spin"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="sculpture-core"><div className="sculpture-leaf leaf-one" /><div className="sculpture-leaf leaf-two" /><div className="sculpture-leaf leaf-three" /><div className="sculpture-stem" /></div><span className="floating-pearl pearl-one" /><span className="floating-pearl pearl-two" /></div></div><span className="scene-caption">A MOMENT OF BALANCE</span></div>;
}

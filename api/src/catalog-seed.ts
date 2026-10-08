import { Salon, Service, Staff } from './models';

// Illustrative demo prices and fictional team, not the salon's verified menu.
export const demoServices: Service[] = [
  { id: 'signature-cut', name: 'Signature cut & finish', category: 'Hair', description: 'A considered cut, a fresh shape, and a beautiful blow-dry finish.', duration: 45, price: 650, order: 1 },
  { id: 'balayage-colour', name: 'Balayage & colour', category: 'Hair', description: 'Soft dimension and a colour consultation for your next chapter.', duration: 120, price: 3200, order: 2 },
  { id: 'hair-spa', name: 'Restorative hair spa', category: 'Hair', description: 'A nourishing scalp-to-strand treatment with a relaxing finish.', duration: 60, price: 1200, order: 3 },
  { id: 'glow-facial', name: 'The glow facial', category: 'Skin', description: 'A gentle cleanse, exfoliation, and hydration ritual for brighter skin.', duration: 60, price: 1500, order: 4 },
  { id: 'skin-reset', name: 'Deep skin reset', category: 'Skin', description: 'A longer tailored facial ritual with time to unwind.', duration: 75, price: 2100, order: 5 },
  { id: 'head-ritual', name: 'Head & shoulder ritual', category: 'Wellness', description: 'Release the day with a restorative head and shoulder massage.', duration: 45, price: 850, order: 6 },
  { id: 'classic-manicure', name: 'Classic manicure', category: 'Nails', description: 'Neat shaping, careful cuticle work, and your choice of polish.', duration: 45, price: 750, order: 7 },
  { id: 'spa-pedicure', name: 'Spa pedicure', category: 'Nails', description: 'A soothing foot soak, nourishing care, and a polished finish.', duration: 60, price: 950, order: 8 },
];

export const demoStaff: Staff[] = [
  { id: 'maya', name: 'Maya', role: 'Senior hair stylist', initials: 'MA', color: '#8B9A77', specialties: ['Hair'], order: 1 },
  { id: 'isha', name: 'Isha', role: 'Skin & beauty specialist', initials: 'IS', color: '#C58F75', specialties: ['Skin', 'Nails', 'Wellness'], order: 2 },
  { id: 'dev', name: 'Dev', role: 'Stylist & wellness specialist', initials: 'DE', color: '#A69FBC', specialties: ['Hair', 'Wellness'], order: 3 },
];

export const demoSalon: Salon = {
  name: 'Eden — Salon & Spa',
  location: 'Margao, Goa',
  address: 'Margao, Goa · Independent portfolio concept',
  hours: 'Daily · 09:00–20:00 (demo hours)',
  timezone: 'Asia/Kolkata',
  bufferMinutes: 15,
  breakHours: '13:00–14:00',
};

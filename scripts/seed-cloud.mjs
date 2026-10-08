import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { config } = require('../api/dist/config.js');
const { demoSalon, demoServices, demoStaff } = require('../api/dist/catalog-seed.js');
const { indiaDate, occupiedLocks, parseTime, formatTime, BUFFER_MINUTES } = require('../api/dist/time.js');
if (config.demo || process.env.EDEN_SAMPLE_DATA !== 'true') {
  throw new Error('Cloud sample setup requires explicit FIREBASE_MODE=cloud and EDEN_SAMPLE_DATA=true.');
}
const app = initializeApp({ projectId: config.projectId, credential: applicationDefault() }, 'eden-cloud-sample-setup');
const db = getFirestore(app);
const date = indiaDate();
const createdAt = new Date().toISOString();
const examples = [
  { staff: 'maya', service: 'signature-cut', time: '09:15', name: 'Anika Demo' },
  { staff: 'isha', service: 'glow-facial', time: '10:30', name: 'Rhea Demo' },
  { staff: 'dev', service: 'signature-cut', time: '11:00', name: 'Arjun Demo' },
  { staff: 'maya', service: 'balayage-colour', time: '14:15', name: 'Priya Demo' },
  { staff: 'isha', service: 'classic-manicure', time: '15:30', name: 'Sara Demo' },
  { staff: 'dev', service: 'head-ritual', time: '17:00', name: 'Nikhil Demo' },
];
try {
  await db.runTransaction(async tx => {
    const bootstrap = db.doc('system/bootstrap');
    const marker = await tx.get(bootstrap);
    if (marker.exists) throw new Error('This database has already been initialized. No data was changed.');
    const existing = await Promise.all(['services', 'staff', 'salon', 'bookings', 'slotLocks'].map(collection => tx.get(db.collection(collection).limit(1))));
    if (existing.some(snapshot => !snapshot.empty)) throw new Error('The database already contains salon data. Sample setup will not overwrite it.');
    for (const service of demoServices) tx.create(db.doc(`services/${service.id}`), service);
    for (const staff of demoStaff) tx.create(db.doc(`staff/${staff.id}`), staff);
    tx.create(db.doc('salon/details'), { ...demoSalon, name: 'Eden Salon demo' });
    examples.forEach((example, index) => {
      const service = demoServices.find(item => item.id === example.service);
      const staff = demoStaff.find(item => item.id === example.staff);
      const reference = `EDN-${(index + 1).toString(16).padStart(10, '0').toUpperCase()}`;
      const start = parseTime(example.time);
      const lockIds = occupiedLocks(staff.id, date, start, service.duration);
      tx.create(db.doc(`bookings/${reference}`), {
        id: reference, reference, date, time: example.time, endTime: formatTime(start + service.duration),
        serviceId: service.id, serviceName: service.name, staffId: staff.id, staffName: staff.name,
        price: service.price, duration: service.duration, bufferMinutes: BUFFER_MINUTES,
        customer: { name: example.name, email: `guest${index + 1}@example.test`, phone: `900000000${index + 1}` },
        status: 'confirmed', createdAt,
        manageTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'), lockIds,
      });
      for (const id of lockIds) tx.create(db.doc(`slotLocks/${id}`), { bookingId: reference, staffId: staff.id, date });
    });
    tx.create(bootstrap, { seededAt: createdAt, seedDate: date, version: 1, sample: true });
  });
  console.info('Cloud Firestore sample catalogue and six fictional appointments are ready.');
} finally {
  await db.terminate();
  await deleteApp(app);
}

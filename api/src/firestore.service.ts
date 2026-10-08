import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { applicationDefault, cert, deleteApp, initializeApp, App } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config';
import { demoSalon, demoServices, demoStaff } from './catalog-seed';
import { StoredBooking } from './models';
import { BUFFER_MINUTES, formatTime, indiaDate, occupiedLocks, parseTime } from './time';
import { vercelGoogleAuth } from './google-credential';

@Injectable()
export class FirestoreService implements OnModuleInit, OnModuleDestroy {
  readonly db: Firestore;
  private readonly firebaseApp: App;
  private readonly logger = new Logger(FirestoreService.name);
  private readonly federatedAuth: boolean;

  constructor() {
    const authClient = vercelGoogleAuth();
    this.federatedAuth = Boolean(authClient);
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credential = config.demo ? undefined : serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault();
    this.firebaseApp = initializeApp({ projectId: config.projectId, ...(credential ? { credential } : {}) }, 'eden-api');
    this.db = getFirestore(this.firebaseApp);
    // Firebase Admin's Firestore wrapper accepts only its built-in credentials.
    // The underlying official Google client supports a GoogleAuth authClient;
    // apply it before the first operation, solely in explicit federation mode.
    if (authClient) this.db.settings({ authClient });
  }

  async onModuleInit(): Promise<void> {
    if (this.federatedAuth) {
      // Vercel's OIDC token belongs to the HTTP request context, which is not
      // guaranteed to exist during cold-start Nest initialization. Database
      // operations authenticate and fail closed within the actual request.
      this.logger.log('Cloud Firestore with Vercel OIDC configured; awaiting an authenticated request.');
      return;
    }
    // An initial read makes startup fail if the database cannot be reached.
    await this.db.doc('system/bootstrap').get();
    if (config.demo) await this.seedEmulator();
    this.logger.log(config.demo ? 'Connected to local Firestore emulator; demo data ready.' : 'Connected to Cloud Firestore; automatic demo seeding disabled.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.terminate();
    await deleteApp(this.firebaseApp);
  }

  private async seedEmulator(): Promise<void> {
    const bootstrapRef = this.db.doc('system/bootstrap');
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

    await this.db.runTransaction(async (transaction) => {
      const initialized = await transaction.get(bootstrapRef);
      if (initialized.exists) return;
      for (const service of demoServices) transaction.set(this.db.doc(`services/${service.id}`), service);
      for (const staff of demoStaff) transaction.set(this.db.doc(`staff/${staff.id}`), staff);
      transaction.set(this.db.doc('salon/details'), demoSalon);
      examples.forEach((example, index) => {
        const service = demoServices.find((item) => item.id === example.service)!;
        const staff = demoStaff.find((item) => item.id === example.staff)!;
        const reference = `EDN-${(index + 1).toString(16).padStart(10, '0').toUpperCase()}`;
        const start = parseTime(example.time);
        const lockIds = occupiedLocks(staff.id, date, start, service.duration);
        const stored: StoredBooking = {
          id: reference, reference, date, time: example.time, endTime: formatTime(start + service.duration),
          serviceId: service.id, serviceName: service.name, staffId: staff.id, staffName: staff.name,
          price: service.price, duration: service.duration, bufferMinutes: BUFFER_MINUTES,
          customer: { name: example.name, email: `guest${index + 1}@example.test`, phone: `900000000${index + 1}` },
          status: 'confirmed', createdAt,
          // Seed bookings have no recoverable guest token; only the demo admin can manage them.
          manageTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'), lockIds,
        };
        transaction.set(this.db.doc(`bookings/${reference}`), stored);
        for (const id of lockIds) transaction.set(this.db.doc(`slotLocks/${id}`), { bookingId: reference, staffId: staff.id, date });
      });
      transaction.set(bootstrapRef, { seededAt: createdAt, seedDate: date, version: 1, demo: true });
    });
  }
}

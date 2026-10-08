import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DocumentSnapshot, QuerySnapshot, Transaction } from 'firebase-admin/firestore';
import { config } from './config';
import { CreateBookingDto, SlotsQueryDto } from './dto';
import { FirestoreService } from './firestore.service';
import { Booking, publicBooking, Salon, Service, Staff, StoredBooking } from './models';
import {
  assertBookingDate, assertCalendarDate, assertStart, BUFFER_MINUTES, CLOSE_MINUTE,
  formatTime, lockId, occupiedLocks, OPEN_MINUTE, parseTime, SLOT_MINUTES, startTimestamp,
  TIMEZONE, withinHours,
} from './time';

@Injectable()
export class BookingsService {
  constructor(private readonly store: FirestoreService) {}

  async catalog() {
    const [services, staff, salon] = await Promise.all([
      this.store.db.collection('services').get(), this.store.db.collection('staff').get(),
      this.store.db.doc('salon/details').get(),
    ]);
    if (!salon.exists) throw new NotFoundException('The salon catalog has not been configured.');
    return {
      services: services.docs.map((doc) => doc.data() as Service).sort((a, b) => (a.order || 0) - (b.order || 0)),
      staff: staff.docs.map((doc) => doc.data() as Staff).sort((a, b) => (a.order || 0) - (b.order || 0)),
      salon: salon.data() as Salon, demo: config.demo,
    };
  }

  async slots(query: SlotsQueryDto) {
    assertBookingDate(query.date);
    const [serviceDoc, staffDoc] = await this.store.db.getAll(
      this.store.db.doc(`services/${query.serviceId}`), this.store.db.doc(`staff/${query.staffId}`),
    );
    const { service, staff } = this.serviceAndStaff(serviceDoc, staffDoc);
    const dayRefs = [];
    for (let minute = OPEN_MINUTE; minute < CLOSE_MINUTE; minute += SLOT_MINUTES) {
      dayRefs.push(this.store.db.doc(`slotLocks/${lockId(staff.id, query.date, minute)}`));
    }
    const locks = new Set((await this.store.db.getAll(...dayRefs)).filter((doc) => doc.exists).map((doc) => doc.id));
    const slots = [];
    const now = Date.now();
    for (let minute = OPEN_MINUTE; minute + service.duration + BUFFER_MINUTES <= CLOSE_MINUTE; minute += SLOT_MINUTES) {
      const required = occupiedLocks(staff.id, query.date, minute, service.duration);
      slots.push({
        time: formatTime(minute), endTime: formatTime(minute + service.duration),
        available: withinHours(minute, service.duration) && startTimestamp(query.date, minute) > now && required.every((id) => !locks.has(id)),
      });
    }
    return { date: query.date, slots, timezone: TIMEZONE, bufferMinutes: BUFFER_MINUTES };
  }

  async create(input: CreateBookingDto): Promise<{ booking: Booking; manageToken: string }> {
    assertCalendarDate(input.date);
    const start = parseTime(input.time);
    const phone = input.customer.phone.replace(/[ ()-]/g, '');
    if (!/^\+?\d{8,15}$/.test(phone)) throw new BadRequestException('Enter a valid phone number with 8–15 digits.');
    const normalized = {
      serviceId: input.serviceId, staffId: input.staffId, date: input.date, time: input.time,
      customer: { name: input.customer.name.trim(), email: input.customer.email.trim().toLowerCase(), phone },
    };
    const fingerprint = this.hash(JSON.stringify(normalized));
    const idempotencyRef = this.store.db.doc(`idempotency/${this.hash(input.idempotencyKey)}`);
    const reference = `EDN-${randomBytes(5).toString('hex').toUpperCase()}`;
    const newRef = this.store.db.doc(`bookings/${reference}`);

    return this.store.db.runTransaction(async (transaction) => {
      const prior = await transaction.get(idempotencyRef);
      if (prior.exists) {
        const previous = prior.data()!;
        if (previous.fingerprint !== fingerprint) throw new ConflictException('This request key was already used for different booking details.');
        const previousDoc = await transaction.get(this.store.db.doc(`bookings/${previous.reference}`));
        if (!previousDoc.exists) throw new ConflictException('The previous booking could not be recovered.');
        const stored = previousDoc.data() as StoredBooking;
        return { booking: publicBooking(stored), manageToken: this.token(stored.id) };
      }
      const [serviceDoc, staffDoc] = await transaction.getAll(
        this.store.db.doc(`services/${input.serviceId}`), this.store.db.doc(`staff/${input.staffId}`),
      );
      const { service, staff } = this.serviceAndStaff(serviceDoc, staffDoc);
      assertStart(input.date, start, service.duration);
      const lockIds = occupiedLocks(staff.id, input.date, start, service.duration);
      const lockRefs = lockIds.map((id) => this.store.db.doc(`slotLocks/${id}`));
      const existingLocks = await transaction.getAll(...lockRefs);
      if (existingLocks.some((doc) => doc.exists)) throw new ConflictException('That time has just been taken. Choose another available slot.');

      const manageToken = this.token(reference);
      const stored: StoredBooking = {
        id: reference, reference, date: input.date, time: input.time, endTime: formatTime(start + service.duration),
        serviceId: service.id, serviceName: service.name, staffId: staff.id, staffName: staff.name,
        price: service.price, duration: service.duration, bufferMinutes: BUFFER_MINUTES,
        customer: normalized.customer, status: 'confirmed', createdAt: new Date().toISOString(),
        manageTokenHash: this.hash(manageToken), lockIds,
      };
      transaction.create(newRef, stored);
      lockRefs.forEach((ref) => transaction.create(ref, { bookingId: reference, staffId: staff.id, date: input.date }));
      transaction.create(idempotencyRef, { reference, fingerprint, createdAt: stored.createdAt });
      return { booking: publicBooking(stored), manageToken };
    });
  }

  async guestBooking(reference: string, token: string): Promise<{ booking: Booking }> {
    const snapshot = await this.store.db.doc(`bookings/${reference}`).get();
    const stored = this.authorizedBooking(snapshot, token);
    return { booking: publicBooking(stored) };
  }

  async cancel(reference: string, token?: string, adminEmail?: string): Promise<{ booking: Booking }> {
    const ref = this.store.db.doc(`bookings/${reference}`);
    const auditRef = this.store.db.collection('bookingEvents').doc();
    return this.store.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const stored = adminEmail ? this.existingBooking(snapshot) : this.authorizedBooking(snapshot, token || '');
      if (stored.status === 'cancelled') return { booking: publicBooking(stored) };
      if (stored.status === 'completed') throw new ConflictException('A completed appointment cannot be cancelled.');
      if (!adminEmail && startTimestamp(stored.date, parseTime(stored.time)) <= Date.now()) {
        throw new ConflictException('This appointment has already started. Please contact the salon to make changes.');
      }
      const locks = stored.lockIds.length ? await transaction.getAll(...stored.lockIds.map((id) => this.store.db.doc(`slotLocks/${id}`))) : [];
      const updated: StoredBooking = { ...stored, status: 'cancelled', cancelledAt: new Date().toISOString() };
      for (const lock of locks) {
        // Never remove a lock now owned by a different booking.
        if (lock.exists && lock.data()!.bookingId === reference) transaction.delete(lock.ref);
      }
      transaction.update(ref, { status: updated.status, cancelledAt: updated.cancelledAt });
      transaction.create(auditRef, { bookingId: reference, action: 'cancelled', actor: adminEmail || 'guest', createdAt: updated.cancelledAt });
      return { booking: publicBooking(updated) };
    });
  }

  async complete(reference: string, adminEmail: string): Promise<{ booking: Booking }> {
    const ref = this.store.db.doc(`bookings/${reference}`);
    const auditRef = this.store.db.collection('bookingEvents').doc();
    return this.store.db.runTransaction(async (transaction: Transaction) => {
      const stored = this.existingBooking(await transaction.get(ref));
      if (stored.status === 'completed') return { booking: publicBooking(stored) };
      if (stored.status === 'cancelled') throw new ConflictException('A cancelled appointment cannot be completed.');
      if (startTimestamp(stored.date, parseTime(stored.time)) > Date.now()) {
        throw new ConflictException('An upcoming appointment cannot be marked completed before it starts.');
      }
      const updated: StoredBooking = { ...stored, status: 'completed', completedAt: new Date().toISOString() };
      transaction.update(ref, { status: updated.status, completedAt: updated.completedAt });
      // Completed services retain their allocated interval and turnaround time.
      transaction.create(auditRef, { bookingId: reference, action: 'completed', actor: adminEmail, createdAt: updated.completedAt });
      return { booking: publicBooking(updated) };
    });
  }

  async dayBookings(date: string) {
    assertCalendarDate(date);
    const result = await this.store.db.collection('bookings').where('date', '==', date).get();
    return this.dayPayload(result);
  }

  dayPayload(result: QuerySnapshot) {
    const bookings = result.docs.map((doc) => publicBooking(doc.data() as StoredBooking)).sort((a, b) => a.time.localeCompare(b.time));
    return {
      bookings,
      stats: {
        appointments: bookings.length,
        revenue: bookings.filter((booking) => booking.status !== 'cancelled').reduce((total, booking) => total + booking.price, 0),
        confirmed: bookings.filter((booking) => booking.status === 'confirmed').length,
        cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
        completed: bookings.filter((booking) => booking.status === 'completed').length,
      },
      timezone: TIMEZONE, demo: config.demo,
    };
  }

  private serviceAndStaff(serviceDoc: DocumentSnapshot, staffDoc: DocumentSnapshot): { service: Service; staff: Staff } {
    if (!serviceDoc.exists || !staffDoc.exists) throw new NotFoundException('The selected service or specialist does not exist.');
    const service = serviceDoc.data() as Service;
    const staff = staffDoc.data() as Staff;
    if (!staff.specialties.includes(service.category)) throw new BadRequestException('This specialist does not offer the selected service.');
    if (!Number.isInteger(service.duration) || service.duration <= 0 || service.duration % SLOT_MINUTES !== 0) {
      throw new BadRequestException('This service is not configured with a valid appointment duration.');
    }
    return { service, staff };
  }

  private existingBooking(snapshot: DocumentSnapshot): StoredBooking {
    if (!snapshot.exists) throw new NotFoundException('Appointment not found.');
    return snapshot.data() as StoredBooking;
  }

  private authorizedBooking(snapshot: DocumentSnapshot, token: string): StoredBooking {
    // Return the same response for unknown references and wrong tokens.
    if (!snapshot.exists || token.length < 32 || token.length > 128) throw new UnauthorizedException('Use the private management link from your booking confirmation.');
    const stored = snapshot.data() as StoredBooking;
    const presented = Buffer.from(this.hash(token), 'hex');
    const expected = Buffer.from(stored.manageTokenHash, 'hex');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new UnauthorizedException('Use the private management link from your booking confirmation.');
    }
    return stored;
  }

  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

  private token(reference: string): string {
    return createHmac('sha256', config.manageSecret).update(`eden-booking-management:${reference}`).digest('base64url');
  }
}

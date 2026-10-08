import { Injectable, MessageEvent, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response } from 'express';
import { QuerySnapshot } from 'firebase-admin/firestore';
import { Observable } from 'rxjs';
import { AdminService, ValidatedAdminSession } from './admin.service';
import { BookingsService } from './bookings.service';
import { FirestoreService } from './firestore.service';
import { config } from './config';
import { assertCalendarDate } from './time';

@Injectable()
export class LiveBookingsService implements OnModuleDestroy {
  private readonly activeStreams = new Set<() => void>();
  private shuttingDown = false;

  constructor(
    private readonly store: FirestoreService,
    private readonly bookings: BookingsService,
    private readonly admin: AdminService,
  ) {}

  watchDay(date: string, request: Request, response: Response): Observable<MessageEvent> {
    assertCalendarDate(date);
    return new Observable<MessageEvent>((subscriber) => {
      if (this.shuttingDown) { subscriber.complete(); return; }
      let closed = false;
      let stopBookings: (() => void) | undefined;
      let stopSession: (() => void) | undefined;
      let stopRevocations: (() => void) | undefined;
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let session: ValidatedAdminSession | undefined;
      let pending: QuerySnapshot | undefined;
      let generation = 0;
      let flushing = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        pending = undefined;
        stopBookings?.();
        stopSession?.();
        stopRevocations?.();
        if (expiryTimer) clearTimeout(expiryTimer);
        if (lifetimeTimer) clearTimeout(lifetimeTimer);
        if (heartbeat) clearInterval(heartbeat);
        response.removeListener('close', shutdown);
        this.activeStreams.delete(shutdown);
      };
      const abortResponse = () => {
        // Completing an Observable alone lets Nest's concatMap drain queued
        // SSE writes. Destroy the downstream transport so those private frames
        // cannot be delivered after revocation, expiry, or shutdown.
        if (!response.destroyed) response.destroy();
      };
      const shutdown = () => { cleanup(); abortResponse(); subscriber.complete(); };
      const sessionExpired = () => {
        if (closed || subscriber.closed) return;
        cleanup();
        // This terminal notification is best-effort. Aborting the transport
        // takes priority over delivering it to a slow or buffered connection.
        subscriber.next({ type: 'session-expired', data: { message: 'Your admin session has expired. Sign in again.' } });
        abortResponse();
        subscriber.complete();
      };
      const listenerFailed = () => {
        if (closed || subscriber.closed) return;
        cleanup();
        // The safe message is best-effort; transport abort also prevents queued
        // customer data draining after an authorization/listener failure.
        subscriber.error(new ServiceUnavailableException('Live booking updates are temporarily unavailable.'));
        abortResponse();
      };
      const armExpiry = (expiresAt: number) => {
        if (expiryTimer) clearTimeout(expiryTimer);
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) { sessionExpired(); return; }
        expiryTimer = setTimeout(sessionExpired, remaining);
        expiryTimer.unref();
      };

      const flushLatest = async () => {
        if (flushing || closed) return;
        flushing = true;
        try {
          while (pending && !closed && !subscriber.closed) {
            const snapshot = pending;
            const snapshotGeneration = generation;
            pending = undefined;
            // Re-check the JWT and server session immediately before each
            // emission. A queued snapshot cannot bypass logout or expiry.
            const current = await this.admin.validatedSession(request);
            if (closed || subscriber.closed) return;
            if (!current || current.documentId !== session?.documentId) { sessionExpired(); return; }
            if (snapshotGeneration !== generation) continue;
            armExpiry(current.expiresAt);
            if (!closed) subscriber.next({ type: 'bookings', data: this.bookings.dayPayload(snapshot) });
          }
        } catch { listenerFailed(); }
        finally {
          flushing = false;
          if (pending && !closed) void flushLatest();
        }
      };

      const start = async () => {
        try {
          const current = await this.admin.validatedSession(request);
          if (closed || subscriber.closed) return;
          if (!current) { sessionExpired(); return; }
          session = current;
          stopRevocations = this.admin.onSessionRevoked(current.documentId, sessionExpired);
          armExpiry(current.expiresAt);
          if (closed) return;
          // Commit SSE headers promptly, even if the first Firestore query
          // snapshot takes longer to arrive. Heartbeats contain no customer data.
          subscriber.next({ comment: 'connected' });
          heartbeat = setInterval(() => {
            if (!closed && !subscriber.closed) subscriber.next({ comment: 'keepalive' });
          }, 15000);
          heartbeat.unref();
          stopSession = this.store.db.doc(`adminSessions/${current.documentId}`).onSnapshot((snapshot) => {
            if (closed || subscriber.closed) return;
            const stored = snapshot.data();
            if (!snapshot.exists || stored?.email !== current.user.email || !Number.isFinite(stored?.expiresAt)) {
              sessionExpired(); return;
            }
            armExpiry(Math.min(current.expiresAt, stored!.expiresAt));
          }, listenerFailed);
          if (closed) { stopSession(); return; }
          stopBookings = this.store.db.collection('bookings').where('date', '==', date).onSnapshot((snapshot) => {
            if (closed || subscriber.closed) return;
            generation += 1;
            pending = snapshot;
            void flushLatest();
          }, listenerFailed);
          if (closed) stopBookings();
        } catch { listenerFailed(); }
      };

      this.activeStreams.add(shutdown);
      response.once('close', shutdown);
      if (config.vercel) {
        // End before Vercel Hobby's 300-second request limit. Destroying the
        // transport also bounds buffered SSE writes; EventSource reconnects
        // through the normal session check and receives a fresh day snapshot.
        lifetimeTimer = setTimeout(shutdown, 240000);
        lifetimeTimer.unref();
      }
      void start();
      // Nest unsubscribes this Observable when the downstream socket closes.
      return cleanup;
    });
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const close of [...this.activeStreams]) close();
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { Subject } from 'rxjs';
import { config } from './config';
import { LoginDto } from './dto';
import { FirestoreService } from './firestore.service';

export interface AdminUser { name: string; email: string; role: 'admin' }
export interface AdminRequest extends Request { admin?: AdminUser }
export interface ValidatedAdminSession { user: AdminUser; documentId: string; expiresAt: number }

@Injectable()
export class AdminService {
  private readonly passwordHash = hashSync(config.adminPassword, 12);
  private readonly revokedSessions = new Subject<string>();

  constructor(private readonly jwt: JwtService, private readonly store: FirestoreService) {}

  async login(input: LoginDto, response: Response) {
    // Always run the password comparison, even for an unknown email.
    const passwordMatches = await compare(input.password, this.passwordHash);
    if (input.email !== config.adminEmail || !passwordMatches) throw new UnauthorizedException('Email or password is incorrect.');
    const sessionId = randomBytes(24).toString('base64url');
    const token = await this.jwt.signAsync({ sub: config.adminEmail, role: 'admin', sid: sessionId }, {
      expiresIn: '8h', algorithm: 'HS256', issuer: 'eden-salon-api', audience: 'eden-owner',
    });
    await this.store.db.doc(`adminSessions/${this.sessionHash(sessionId)}`).create({
      email: config.adminEmail, createdAt: new Date().toISOString(), expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    });
    response.cookie(config.cookieName, token, {
      httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/api/admin', maxAge: 8 * 60 * 60 * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { user: this.user(), demo: config.demo };
  }

  async session(request: Request): Promise<{ user: AdminUser | null; demo: boolean }> {
    return { user: await this.readSession(request), demo: config.demo };
  }

  async readSession(request: Request): Promise<AdminUser | null> {
    try { return (await this.validatedSession(request))?.user || null; }
    catch { return null; }
  }

  async validatedSession(request: Request): Promise<ValidatedAdminSession | null> {
    const token: unknown = request.cookies?.[config.cookieName];
    if (typeof token !== 'string' || token.length > 4096) return null;
    let payload: { sub: string; role: string; sid: string; exp: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; role: string; sid: string; exp: number }>(token, {
        algorithms: ['HS256'], issuer: 'eden-salon-api', audience: 'eden-owner',
      });
    } catch {
      return null;
    }
    if (payload.sub !== config.adminEmail || payload.role !== 'admin' ||
      typeof payload.sid !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(payload.sid) ||
      !Number.isFinite(payload.exp)) return null;
    const documentId = this.sessionHash(payload.sid);
    const session = await this.store.db.doc(`adminSessions/${documentId}`).get();
    if (!session.exists || session.data()!.email !== config.adminEmail || !Number.isFinite(session.data()!.expiresAt)) return null;
    const expiresAt = Math.min(payload.exp * 1000, session.data()!.expiresAt);
    if (expiresAt <= Date.now()) return null;
    return { user: this.user(), documentId, expiresAt };
  }

  onSessionRevoked(documentId: string, callback: () => void): () => void {
    const subscription = this.revokedSessions.subscribe((revoked) => { if (revoked === documentId) callback(); });
    return () => subscription.unsubscribe();
  }

  async logout(request: Request, response: Response) {
    const token: unknown = request.cookies?.[config.cookieName];
    if (typeof token === 'string' && token.length <= 4096) {
      let sessionId: string | undefined;
      try {
        const payload = await this.jwt.verifyAsync<{ sid?: string }>(token, {
          algorithms: ['HS256'], issuer: 'eden-salon-api', audience: 'eden-owner',
        });
        sessionId = payload.sid;
      } catch { /* An expired or malformed cookie is still cleared. */ }
      if (typeof sessionId === 'string') {
        const documentId = this.sessionHash(sessionId);
        await this.store.db.doc(`adminSessions/${documentId}`).delete();
        // Close same-process live streams before returning the logout response.
        // A Firestore document listener handles revocation from other processes.
        this.revokedSessions.next(documentId);
      }
    }
    response.clearCookie(config.cookieName, { httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/api/admin' });
    response.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }

  private user(): AdminUser {
    return { name: config.demo ? 'Eden demo owner' : 'Salon owner', email: config.adminEmail, role: 'admin' };
  }

  private sessionHash(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex');
  }
}

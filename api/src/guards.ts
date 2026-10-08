import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AdminRequest, AdminService } from './admin.service';
import { config } from './config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly admin: AdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const user = await this.admin.readSession(request);
    if (!user) throw new UnauthorizedException('Sign in to access the owner dashboard.');
    request.admin = user;
    return true;
  }
}

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.header('origin');
    if (origin && !config.webOrigins.includes(origin)) throw new ForbiddenException('This request origin is not allowed.');
    // Cloud admin cookie requests must originate from the configured HTTPS site.
    if (!config.demo && request.path.startsWith('/api/admin') && !origin) {
      throw new ForbiddenException('An allowed browser origin is required.');
    }
    return true;
  }
}

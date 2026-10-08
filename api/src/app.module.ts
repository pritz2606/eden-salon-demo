import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { AppController } from './app.controller';
import { BookingsService } from './bookings.service';
import { config } from './config';
import { FirestoreService } from './firestore.service';
import { AdminGuard, OriginGuard } from './guards';
import { LiveBookingsService } from './live-bookings.service';

@Module({
  imports: [
    JwtModule.register({ secret: config.jwtSecret }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 180 }]),
  ],
  controllers: [AppController],
  providers: [
    FirestoreService, BookingsService, AdminService, AdminGuard, LiveBookingsService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

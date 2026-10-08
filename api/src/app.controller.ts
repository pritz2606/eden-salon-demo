import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res, Sse, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AdminRequest, AdminService } from './admin.service';
import { BookingsService } from './bookings.service';
import { config } from './config';
import { CreateBookingDto, DateQueryDto, LoginDto, ReferenceDto, SlotsQueryDto } from './dto';
import { FirestoreService } from './firestore.service';
import { AdminGuard } from './guards';
import { LiveBookingsService } from './live-bookings.service';

@Controller()
export class AppController {
  constructor(private readonly bookings: BookingsService, private readonly admin: AdminService, private readonly store: FirestoreService, private readonly liveBookings: LiveBookingsService) {}

  @Get('health')
  @SkipThrottle()
  async health() {
    await this.store.db.doc('system/bootstrap').get();
    return { status: 'ok', database: config.demo ? 'firestore-emulator' : 'cloud-firestore', demo: config.demo, timezone: 'Asia/Kolkata' };
  }

  @Get('catalog')
  catalog() { return this.bookings.catalog(); }

  @Get('slots')
  slots(@Query() query: SlotsQueryDto) { return this.bookings.slots(query); }

  @Post('bookings')
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  create(@Body() input: CreateBookingDto) { return this.bookings.create(input); }

  @Get('bookings/:reference')
  guestBooking(@Param() params: ReferenceDto, @Headers('authorization') authorization?: string) {
    return this.bookings.guestBooking(params.reference, this.bearer(authorization));
  }

  @Post('bookings/:reference/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  guestCancel(@Param() params: ReferenceDto, @Headers('authorization') authorization?: string) {
    return this.bookings.cancel(params.reference, this.bearer(authorization));
  }

  @Post('admin/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.admin.login(input, response);
  }

  @Get('admin/session')
  session(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.admin.session(request);
  }

  @Post('admin/logout')
  @HttpCode(200)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.admin.logout(request, response); }

  @Get('admin/bookings')
  @UseGuards(AdminGuard)
  adminBookings(@Query() query: DateQueryDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.bookings.dayBookings(query.date);
  }

  @Sse('admin/bookings/live')
  @UseGuards(AdminGuard)
  adminBookingsLive(@Query() query: DateQueryDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.liveBookings.watchDay(query.date, request, response);
  }

  @Post('admin/bookings/:reference/cancel')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  adminCancel(@Param() params: ReferenceDto, @Req() request: AdminRequest) {
    return this.bookings.cancel(params.reference, undefined, request.admin!.email);
  }

  @Post('admin/bookings/:reference/complete')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  adminComplete(@Param() params: ReferenceDto, @Req() request: AdminRequest) {
    return this.bookings.complete(params.reference, request.admin!.email);
  }

  private bearer(authorization?: string): string {
    return /^Bearer [A-Za-z0-9_-]{32,128}$/.test(authorization || '') ? authorization!.slice(7) : '';
  }
}

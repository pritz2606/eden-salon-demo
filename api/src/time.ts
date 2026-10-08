import { BadRequestException } from '@nestjs/common';

export const TIMEZONE = 'Asia/Kolkata';
export const OPEN_MINUTE = 9 * 60;
export const CLOSE_MINUTE = 20 * 60;
export const BREAK_START = 13 * 60;
export const BREAK_END = 14 * 60;
export const SLOT_MINUTES = 15;
export const BUFFER_MINUTES = 15;

export function indiaDate(now = Date.now()): string {
  return new Date(now + 330 * 60000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function assertCalendarDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Date must use YYYY-MM-DD.');
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('Choose a valid calendar date.');
  }
}

export function assertBookingDate(date: string): void {
  assertCalendarDate(date);
  const today = indiaDate();
  if (date < today || date > addDays(today, 60)) {
    throw new BadRequestException('Appointments can be booked from today up to 60 days ahead, in India time.');
  }
}

export function parseTime(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadRequestException('Time must use HH:mm.');
  const [hours, minutes] = time.split(':').map(Number);
  if (minutes % SLOT_MINUTES !== 0) throw new BadRequestException('Start times must be on a 15-minute boundary.');
  return hours * 60 + minutes;
}

export function formatTime(minute: number): string {
  return `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}

export function startTimestamp(date: string, minute: number): number {
  return Date.parse(`${date}T${formatTime(minute)}:00+05:30`);
}

export function withinHours(start: number, duration: number): boolean {
  const occupiedEnd = start + duration + BUFFER_MINUTES;
  return start >= OPEN_MINUTE && occupiedEnd <= CLOSE_MINUTE &&
    !(start < BREAK_END && occupiedEnd > BREAK_START);
}

export function assertStart(date: string, start: number, duration: number): void {
  assertBookingDate(date);
  if (!withinHours(start, duration)) {
    throw new BadRequestException('Choose a time within 09:00–20:00, outside the 13:00–14:00 break, with room for the service and 15-minute turnaround.');
  }
  if (startTimestamp(date, start) <= Date.now()) {
    throw new BadRequestException('This appointment time has already passed in India time.');
  }
}

export function lockId(staffId: string, date: string, minute: number): string {
  return `${staffId}_${date}_${minute}`;
}

export function occupiedLocks(staffId: string, date: string, start: number, duration: number): string[] {
  const ids: string[] = [];
  for (let minute = start; minute < start + duration + BUFFER_MINUTES; minute += SLOT_MINUTES) {
    ids.push(lockId(staffId, date, minute));
  }
  return ids;
}

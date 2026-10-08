export interface Service {
  id: string;
  name: string;
  category: 'Hair' | 'Skin' | 'Wellness' | 'Nails';
  description: string;
  duration: number;
  price: number;
  order?: number;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  specialties: string[];
  order?: number;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  reference: string;
  date: string;
  time: string;
  endTime: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  price: number;
  duration: number;
  bufferMinutes: number;
  customer: Customer;
  status: BookingStatus;
  createdAt: string;
  cancelledAt?: string;
  completedAt?: string;
}

export interface StoredBooking extends Booking {
  manageTokenHash: string;
  lockIds: string[];
}

export interface Salon {
  name: string;
  location: string;
  address: string;
  hours: string;
  timezone: string;
  bufferMinutes: number;
  breakHours: string;
}

export function publicBooking(stored: StoredBooking): Booking {
  // Whitelist every public field, including the nested customer. Future
  // server-only Firestore fields must never flow through REST or live events.
  return {
    id: stored.id, reference: stored.reference, date: stored.date,
    time: stored.time, endTime: stored.endTime,
    serviceId: stored.serviceId, serviceName: stored.serviceName,
    staffId: stored.staffId, staffName: stored.staffName,
    price: stored.price, duration: stored.duration, bufferMinutes: stored.bufferMinutes,
    customer: { name: stored.customer.name, email: stored.customer.email, phone: stored.customer.phone },
    status: stored.status, createdAt: stored.createdAt,
    ...(stored.cancelledAt ? { cancelledAt: stored.cancelledAt } : {}),
    ...(stored.completedAt ? { completedAt: stored.completedAt } : {}),
  };
}

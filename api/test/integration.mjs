import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Run only against the local demo. The test creates future appointments and
// cancels them afterward; it never clears existing Firestore data.
const base = process.env.EDEN_TEST_API || 'http://127.0.0.1:4100/api';
const origin = process.env.EDEN_TEST_ORIGIN || 'http://127.0.0.1:3100';
const customer = { name: 'Concurrency Test', email: 'concurrency@example.test', phone: '9000000010' };
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const date = new Date(Date.parse(`${today}T00:00:00Z`) + 59 * 86400000).toISOString().slice(0, 10);
const cleanup = [];
let cookie = '';

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', origin, ...options.headers },
  });
  const body = await response.json();
  return { response, status: response.status, body };
}

function post(path, data, extra = {}) {
  return request(path, { method: 'POST', body: JSON.stringify(data), ...extra });
}

function input(staffId = 'maya', serviceId = 'hair-spa', time = '09:00') {
  return { staffId, serviceId, date, time, customer, idempotencyKey: randomUUID() };
}

try {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.demo, true, 'Integration checks are forbidden against cloud mode');
  assert.equal(health.body.database, 'firestore-emulator');
  const unauthenticated = await request(`/admin/bookings?date=${date}`);
  assert.equal(unauthenticated.status, 401);
  const emptySession = await request('/admin/session');
  assert.equal(emptySession.status, 200);
  assert.equal(emptySession.body.user, null);
  const arrayCustomer = await post('/bookings', { ...input(), customer: [] });
  assert.equal(arrayCustomer.status, 400, 'A nested customer array must be rejected before entering booking logic');

  const raceInputs = [input(), input(), input()];
  const raced = await Promise.all(raceInputs.map((payload) => post('/bookings', payload)));
  assert.deepEqual(raced.map((result) => result.status).sort(), [201, 409, 409], 'Exactly one competing booking must succeed');
  const winningIndex = raced.findIndex((result) => result.status === 201);
  const created = raced[winningIndex].body;
  cleanup.push(created);
  assert.equal(created.booking.bufferMinutes, 15);
  assert.equal(created.booking.endTime, '10:00');
  assert.equal(created.booking.manageTokenHash, undefined);
  assert.equal(created.booking.lockIds, undefined);

  const retry = await post('/bookings', raceInputs[winningIndex]);
  assert.equal(retry.status, 201);
  assert.equal(retry.body.booking.id, created.booking.id);
  assert.equal(retry.body.manageToken, created.manageToken);
  const changedRetry = await post('/bookings', { ...raceInputs[winningIndex], time: '09:15' });
  assert.equal(changedRetry.status, 409);

  const wrongToken = await request(`/bookings/${created.booking.reference}`, { headers: { authorization: `Bearer ${'x'.repeat(43)}` } });
  assert.equal(wrongToken.status, 401);
  const privateBooking = await request(`/bookings/${created.booking.reference}`, { headers: { authorization: `Bearer ${created.manageToken}` } });
  assert.equal(privateBooking.status, 200);
  const shorterOverlap = await post('/bookings', input('maya', 'signature-cut', '09:30'));
  assert.equal(shorterOverlap.status, 409, 'Unequal-duration overlap must be rejected');
  const bufferOverlap = await post('/bookings', input('maya', 'signature-cut', '10:00'));
  assert.equal(bufferOverlap.status, 409, 'Turnaround buffer must remain allocated');

  const firstCancellation = await post(`/bookings/${created.booking.reference}/cancel`, {}, { headers: { authorization: `Bearer ${created.manageToken}` } });
  assert.equal(firstCancellation.status, 200);
  assert.equal(firstCancellation.body.booking.status, 'cancelled');
  const repeatedCancellation = await post(`/bookings/${created.booking.reference}/cancel`, {}, { headers: { authorization: `Bearer ${created.manageToken}` } });
  assert.equal(repeatedCancellation.status, 200);

  const rebooked = await post('/bookings', input());
  assert.equal(rebooked.status, 201, 'Cancellation must release all interval locks');
  cleanup.push(rebooked.body);
  const differentStaff = await post('/bookings', input('dev'));
  assert.equal(differentStaff.status, 201, 'Different specialists can accept the same time');
  cleanup.push(differentStaff.body);

  const badDate = await request('/slots?date=2026-02-31&serviceId=hair-spa&staffId=maya');
  assert.equal(badDate.status, 400);
  const badSpecialty = await request(`/slots?date=${date}&serviceId=glow-facial&staffId=maya`);
  assert.equal(badSpecialty.status, 400);
  const badOrigin = await post('/admin/login', { email: 'owner@eden.demo', password: 'EdenDemo2026!' }, { headers: { origin: 'https://untrusted.example' } });
  assert.equal(badOrigin.status, 403);
  const wrongPassword = await post('/admin/login', { email: 'owner@eden.demo', password: 'not-the-password' });
  assert.equal(wrongPassword.status, 401);
  const loggedIn = await post('/admin/login', { email: 'owner@eden.demo', password: 'EdenDemo2026!' });
  assert.equal(loggedIn.status, 200);
  const setCookie = loggedIn.response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(';')[0];
  const adminDay = await request(`/admin/bookings?date=${date}`, { headers: { cookie } });
  assert.equal(adminDay.status, 200);
  assert.equal(adminDay.body.bookings.filter((booking) => booking.id === created.booking.id).length, 1);
  const futureCompletion = await post(`/admin/bookings/${rebooked.body.booking.reference}/complete`, {}, { headers: { cookie } });
  assert.equal(futureCompletion.status, 409);
  const loggedOut = await post('/admin/logout', {}, { headers: { cookie } });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.response.headers.get('set-cookie'), /Expires=/i);
  const revokedSession = await request(`/admin/bookings?date=${date}`, { headers: { cookie } });
  assert.equal(revokedSession.status, 401, 'Logout must revoke the session, including a replayed old cookie');

  console.log('PASS: Firestore connection, atomic concurrency, unequal durations, turnaround buffer, idempotency, private guest access, cancellation lock release, independent staff, validation, origin protection, admin authentication, cookie flags, session revocation, and guarded status transitions.');
} finally {
  for (const item of cleanup) {
    const result = await post(`/bookings/${item.booking.reference}/cancel`, {}, { headers: { authorization: `Bearer ${item.manageToken}` } });
    if (result.status !== 200) console.error(`Cleanup could not cancel integration appointment (${result.status}).`);
  }
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' · ') : data.message || 'Something went wrong. Please try again.');
  return data;
}

export function indiaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: 'numeric', ...options }).format(new Date(`${date}T12:00:00`));
}

export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export const money = value => `₹${Number(value).toLocaleString('en-IN')}`;

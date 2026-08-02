import { Platform } from 'react-native';

// Fallback ensures native builds (TestFlight/App Store) don't crash on startup when
// EXPO_PUBLIC_BACKEND_URL isn't baked in by EAS. Web deploys always set this; native
// builds MAY be missing it if the EAS build wasn't given the secret.
const BACKEND_FALLBACK = 'https://bookmycleaning.xyz';
const IMAGES_FALLBACK = 'https://bookscrubby.com';

const RAW = (process.env.EXPO_PUBLIC_BACKEND_URL || BACKEND_FALLBACK).replace(/\/+$/, '');
export const BASE_URL = RAW;
const API = `${BASE_URL}/api`;

export const HTTP_UNAUTHORIZED = 401;

// The app's OWN backend (image management). On web it is same-origin;
// on native builds it comes from EXPO_PUBLIC_IMAGES_URL, falling back to bookscrubby.com.
function computeImagesBase() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return (process.env.EXPO_PUBLIC_IMAGES_URL || IMAGES_FALLBACK).replace(/\/+$/, '');
}
export const IMAGES_BASE = computeImagesBase();
const IMAGES_API = `${IMAGES_BASE}/api`;

export function resolveImageUrl(url) {
  if (!url) return url;
  return url.startsWith('http') ? url : `${IMAGES_BASE}${url}`;
}

export async function fetchAppImages() {
  const res = await fetch(`${IMAGES_API}/app-images`);
  if (!res.ok) throw new Error('Failed to load images');
  return res.json();
}

export async function uploadAppImage(asset, label, password) {
  const form = new FormData();
  const name = asset.fileName || asset.name || 'image.jpg';
  const type = asset.mimeType || asset.type || 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append('file', new File([blob], name, { type: blob.type || type }));
  } else {
    form.append('file', { uri: asset.uri, name, type });
  }
  form.append('label', label || '');
  const res = await fetch(`${IMAGES_API}/app-images/upload`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password },
    body: form,
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired \u2014 please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}). ${text.slice(0, 120)}`);
  }
  return res.json();
}

export async function deleteAppImage(imageId, password) {
  const res = await fetch(`${IMAGES_API}/app-images/${imageId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Password': password },
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function reorderAppImages(ids, password) {
  const res = await fetch(`${IMAGES_API}/app-images/reorder`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: ids }),
  });
  if (!res.ok) throw new Error('Reorder failed');
  return res.json();
}

export async function submitQuote(payload) {
  const res = await fetch(`${API}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not submit request (${res.status}). ${text.slice(0, 120)}`);
  }
  return res.json();
}

export async function adminLogin(password) {
  const res = await fetch(`${IMAGES_API}/admin/login`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Incorrect password');
  if (!res.ok) throw new Error('Login failed — please try again');
  return true;
}

export async function fetchQuotes(password) {
  const res = await fetch(`${IMAGES_API}/leads`, {
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) {
    const err = new Error('unauthorized');
    err.code = 401;
    throw err;
  }
  if (!res.ok) throw new Error('Failed to load leads');
  return res.json();
}

export async function setImageFit(imageId, fit, password) {
  const res = await fetch(`${IMAGES_API}/app-images/${imageId}`, {
    method: 'PATCH',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fit }),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export async function fetchAppSettings() {
  const res = await fetch(`${IMAGES_API}/app-settings`);
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function updateAppSettings(payload, password) {
  const res = await fetch(`${IMAGES_API}/app-settings`, {
    method: 'PUT',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) throw new Error('Save failed');
  return res.json();
}

export async function uploadLogo(asset, password) {
  const form = new FormData();
  const name = asset.fileName || asset.name || 'logo.png';
  const type = asset.mimeType || asset.type || 'image/png';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append('file', new File([blob], name, { type: blob.type || type }));
  } else {
    form.append('file', { uri: asset.uri, name, type });
  }
  const res = await fetch(`${IMAGES_API}/app-settings/logo`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password },
    body: form,
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) throw new Error('Logo upload failed');
  return res.json();
}

export async function resetLogo(password) {
  const res = await fetch(`${IMAGES_API}/app-settings/logo`, {
    method: 'DELETE',
    headers: { 'X-Admin-Password': password },
  });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}

export async function checkinCleaner(name, pin) {
  const res = await fetch(`${IMAGES_API}/cleaners/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin }),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Wrong PIN — ask the office for the current cleaner PIN.');
  if (!res.ok) throw new Error('Check-in failed — please try again.');
  return res.json();
}

export async function sendCleanerLocation(cleanerId, pin, lat, lng) {
  const res = await fetch(`${IMAGES_API}/cleaners/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaner_id: cleanerId, pin, lat, lng }),
  });
  if (res.status === HTTP_UNAUTHORIZED) {
    const e = new Error('PIN changed — please check in again.');
    e.code = 401;
    throw e;
  }
  if (!res.ok) throw new Error('Location update failed');
  return res.json();
}

export async function stopCleanerSharing(cleanerId, pin) {
  const res = await fetch(`${IMAGES_API}/cleaners/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaner_id: cleanerId, pin }),
  });
  return res.ok;
}

export async function fetchCleaners(password) {
  const res = await fetch(`${IMAGES_API}/cleaners`, { headers: { 'X-Admin-Password': password } });
  if (res.status === HTTP_UNAUTHORIZED) {
    const e = new Error('unauthorized');
    e.code = 401;
    throw e;
  }
  if (!res.ok) throw new Error('Failed to load team');
  return res.json();
}

export async function deleteCleaner(cleanerId, password) {
  const res = await fetch(`${IMAGES_API}/cleaners/${cleanerId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Password': password },
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function fetchStaffPin(password) {
  const res = await fetch(`${IMAGES_API}/staff/pin`, { headers: { 'X-Admin-Password': password } });
  if (!res.ok) throw new Error('Failed to load PIN');
  return res.json();
}

export async function updateStaffPin(pin, password) {
  const res = await fetch(`${IMAGES_API}/staff/pin`, {
    method: 'PUT',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text.includes('4-8') ? 'PIN must be 4-8 digits' : 'PIN update failed');
  }
  return res.json();
}

export async function createAssignment(payload, password) {
  const res = await fetch(`${IMAGES_API}/assignments`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Could not assign — please try again.');
  return res.json();
}

export async function fetchAssignments(password) {
  const res = await fetch(`${IMAGES_API}/assignments`, { headers: { 'X-Admin-Password': password } });
  if (!res.ok) throw new Error('Failed to load assignments');
  return res.json();
}

export async function deleteAssignment(assignmentId, password) {
  const res = await fetch(`${IMAGES_API}/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Password': password },
  });
  if (!res.ok) throw new Error('Unassign failed');
  return res.json();
}

export async function fetchCleanerJobs(cleanerId, pin) {
  const res = await fetch(`${IMAGES_API}/cleaners/${cleanerId}/jobs`, { headers: { 'X-Cleaner-Pin': pin } });
  if (res.status === HTTP_UNAUTHORIZED) {
    const e = new Error('PIN changed — please check in again.');
    e.code = 401;
    throw e;
  }
  if (!res.ok) throw new Error('Failed to load jobs');
  return res.json();
}

export async function changeAdminPassword(newPassword, password) {
  const res = await fetch(`${IMAGES_API}/admin/password`, {
    method: 'PUT',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text.includes('6 characters') ? 'Password must be at least 6 characters' : 'Password update failed');
  }
  return res.json();
}

export async function setAssignmentStatus(assignmentId, cleanerId, pin, status) {
  const res = await fetch(`${IMAGES_API}/assignments/${assignmentId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaner_id: cleanerId, pin, status }),
  });
  if (!res.ok) throw new Error('Status update failed');
  return res.json();
}

export async function fetchAssignmentHistory(cleanerId, password) {
  const qs = cleanerId ? `?cleaner_id=${encodeURIComponent(cleanerId)}` : '';
  const res = await fetch(`${IMAGES_API}/assignments/history${qs}`, {
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) {
    const e = new Error('unauthorized');
    e.code = 401;
    throw e;
  }
  if (!res.ok) throw new Error('Failed to load history');
  return res.json();
}

export async function uploadAssignmentPhoto(assignmentId, kind, cleanerId, pin, asset) {
  const form = new FormData();
  const name = asset.fileName || asset.name || `${kind}.jpg`;
  const type = asset.mimeType || asset.type || 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append('file', new File([blob], name, { type: blob.type || type }));
  } else {
    form.append('file', { uri: asset.uri, name, type });
  }
  form.append('kind', kind);
  form.append('cleaner_id', cleanerId);
  form.append('pin', pin);
  const res = await fetch(`${IMAGES_API}/assignments/${assignmentId}/photos`, {
    method: 'POST',
    body: form,
  });
  if (res.status === HTTP_UNAUTHORIZED) {
    const e = new Error('PIN changed — please check in again.');
    e.code = 401;
    throw e;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Photo upload failed (${res.status}). ${text.slice(0, 120)}`);
  }
  return res.json();
}

export async function deleteAssignmentPhoto(assignmentId, photoId, cleanerId, pin) {
  const qs = `?cleaner_id=${encodeURIComponent(cleanerId)}&pin=${encodeURIComponent(pin)}`;
  const res = await fetch(`${IMAGES_API}/assignments/${assignmentId}/photos/${photoId}${qs}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Photo delete failed');
  return res.json();
}

export async function sendReviewRequest(assignmentId, password) {
  const res = await fetch(`${IMAGES_API}/assignments/${assignmentId}/send-review`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try {
      detail = JSON.parse(text).detail || '';
    } catch {
      detail = text.slice(0, 120);
    }
    throw new Error(detail || 'Review send failed');
  }
  return res.json();
}

export async function fetchClientNotes(customerName, phone, password) {
  const qs = new URLSearchParams({ customer_name: customerName, phone: phone || '' }).toString();
  const res = await fetch(`${IMAGES_API}/clients/notes?${qs}`, {
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) throw new Error('Failed to load client notes');
  return res.json();
}

export async function saveClientNotes(customerName, phone, notes, password) {
  const res = await fetch(`${IMAGES_API}/clients/notes`, {
    method: 'PUT',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_name: customerName, phone: phone || '', notes: notes || '' }),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try { detail = JSON.parse(text).detail || ''; } catch { detail = text.slice(0, 120); }
    throw new Error(detail || 'Failed to save notes');
  }
  return res.json();
}

export async function mergeClients({ fromName, fromPhone, intoName, intoPhone }, password) {
  const res = await fetch(`${IMAGES_API}/clients/merge`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_name: fromName,
      from_phone: fromPhone || '',
      into_name: intoName,
      into_phone: intoPhone || '',
    }),
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try { detail = JSON.parse(text).detail || ''; } catch { detail = text.slice(0, 120); }
    throw new Error(detail || 'Merge failed');
  }
  return res.json();
}

export async function previewOwnerDigest(password) {
  const res = await fetch(`${IMAGES_API}/admin/digest/preview`, {
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) throw new Error('Failed to load digest preview');
  return res.json();
}

export async function sendOwnerDigestNow(password) {
  const res = await fetch(`${IMAGES_API}/admin/digest/send-now`, {
    method: 'POST',
    headers: { 'X-Admin-Password': password },
  });
  if (res.status === HTTP_UNAUTHORIZED) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try { detail = JSON.parse(text).detail || ''; } catch { detail = text.slice(0, 120); }
    throw new Error(detail || 'Digest send failed');
  }
  return res.json();
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h > 0) return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
  return `${m}m`;
}


export function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || '';
    const date = d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return iso || '';
  }
}

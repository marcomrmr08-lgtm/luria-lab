// Utilidades de interfaz: escapado, fechas, avisos, ventanas y almacenamiento local de archivos

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function aFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function sumarDias(iso, n) {
  const d = aFecha(iso); d.setDate(d.getDate() + n); return hoyISO(d);
}
export function fmtFecha(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  const s = new Intl.DateTimeFormat('es-ES', opts).format(aFecha(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const fmtCorta = (iso) => iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(aFecha(iso)).replace('.', '') : '';
export const fmtNum = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export function nombreMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  const s = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Avisos ----------
let toastTimer;
export function toast(msg, { enlace, texto = 'Abrir', error = false, ms = 6000, alPulsar } = {}) {
  const t = document.getElementById('toast');
  t.className = 'toast visible' + (error ? ' error' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${enlace ? `<a href="${esc(enlace)}" target="_blank" rel="noopener">${esc(texto)}</a>` : ''}${alPulsar ? `<button type="button" class="toast-btn">${esc(texto)}</button>` : ''}`;
  t.querySelector('.toast-btn')?.addEventListener('click', () => { t.className = 'toast'; alPulsar(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, ms);
}

// ---------- Ventanas modales ----------
export function abrirModal(html, montar) {
  const d = document.getElementById('modal');
  d.innerHTML = `<div class="modal-cuerpo">${html}</div>`;
  if (!d.open) d.showModal();
  d.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarModal));
  montar?.(d);
  return d;
}
export function cerrarModal() {
  const d = document.getElementById('modal');
  if (d.open) d.close();
  d.innerHTML = '';
}

// ---------- Ejecutar una acción con indicador de carga ----------
export async function conCarga(boton, fn) {
  const txt = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Un momento…'; }
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || String(e), { error: true, ms: 9000 }); }
  finally { if (boton && boton.isConnected) { boton.disabled = false; boton.innerHTML = txt; } }
}

// ---------- Archivos locales (IndexedDB) ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('luria-lab', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('archivos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function idbSet(clave, valor) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('archivos', 'readwrite');
    tx.objectStore('archivos').put(valor, clave);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
export async function idbGet(clave) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('archivos', 'readonly');
    const q = tx.objectStore('archivos').get(clave);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}

export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Iconos (trazo) ----------
const P = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  diario: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  guia: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  pdp: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  hexa: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  atras: '<path d="M15 6l-6 6 6 6"/>',
  sig: '<path d="M9 6l6 6-6 6"/>',
  descargar: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  hoja: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  dos: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>',
  bocadillo: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  birrete: '<path d="M2 8l10-5 10 5-10 5z"/><path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  papelera: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  externo: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v6H4V5h6"/>',
};
export const icon = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

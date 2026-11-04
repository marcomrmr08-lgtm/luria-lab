// Conexión con Google: inicio de sesión, Drive, Docs, Sheets y (opcional) el calendario propio de la app. Sin acceso al correo.
// Permisos limitados: la app solo ve los archivos que ella crea (drive.file)
// y su carpeta oculta de datos (drive.appdata).
import { CONFIG } from './config.js';

let token = null;
let caduca = 0;
let clienteToken = null;

export const configurado = () => Boolean(CONFIG.CLIENT_ID);
export const conectado = () => Boolean(token) && Date.now() < caduca - 60_000;

function cargarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el inicio de sesión de Google. ¿Hay conexión?'));
    document.head.appendChild(s);
  });
}

// Debe llamarse desde un toque del usuario (abre la ventana de Google).
// El permiso de calendario es opcional: solo se pide si el alumno activa Google Calendar.
export const PERMISO_CALENDARIO = 'https://www.googleapis.com/auth/calendar.app.created';
let conCalendario = false;
export const tieneCalendario = () => conectado() && conCalendario;
export async function conectar({ calendario = false } = {}) {
  if (!configurado()) throw new Error('La app aún no tiene configurado el ID de cliente de Google.');
  await cargarGis();
  const scopes = CONFIG.SCOPES.split(' ').concat(calendario ? [PERMISO_CALENDARIO] : []);
  clienteToken = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.CLIENT_ID, scope: scopes.join(' '), callback: () => {} });
  await new Promise((res, rej) => {
    clienteToken.callback = (r) => {
      if (r.error) return rej(new Error('Google no dio permiso: ' + r.error));
      if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...CONFIG.SCOPES.split(' '))) {
        return rej(new Error('Faltan permisos. Vuelve a conectar y marca todas las casillas.'));
      }
      conCalendario = google.accounts.oauth2.hasGrantedAllScopes(r, PERMISO_CALENDARIO);
      token = r.access_token; caduca = Date.now() + Number(r.expires_in) * 1000;
      try { localStorage.setItem('ll-google', '1'); } catch {}
      res();
    };
    clienteToken.error_callback = (e) => rej(new Error(e?.type === 'popup_closed' ? 'Se cerró la ventana de Google.' : 'No se pudo conectar con Google.'));
    clienteToken.requestAccessToken({ prompt: '' });
  });
}

export function desconectar() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null; caduca = 0; conCalendario = false;
  try { localStorage.removeItem('ll-google'); } catch {}
}
export const conectadoAntes = () => { try { return localStorage.getItem('ll-google') === '1'; } catch { return false; } };

async function api(url, opts = {}) {
  if (!conectado()) await conectar();
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
  if (r.status === 401) { token = null; throw new Error('La sesión de Google ha caducado. Pulsa «Conectar con Google» y repite.'); }
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).error?.message || ''; } catch {}
    if (/calendar-json\.googleapis\.com|Calendar API/i.test(msg) && /disabled|not been used|has not been/i.test(msg)) {
      throw new Error('Falta activar la «Google Calendar API» en Google Cloud (proyecto Luria Lab). Actívala y vuelve a intentarlo en un par de minutos.');
    }
    if (/sheets\.googleapis\.com|Sheets API/i.test(msg) && /disabled|not been used|has not been/i.test(msg)) {
      throw new Error('Falta activar la «Google Sheets API» en Google Cloud (proyecto Luria Lab). Actívala y vuelve a intentarlo en un par de minutos.');
    }
    throw new Error(`Google respondió con un error (${r.status})${msg ? ': ' + msg : ''}`);
  }
  return r;
}
const json = async (url, opts) => (await api(url, opts)).json();
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';

export const enlaceDoc = (id) => `https://docs.google.com/document/d/${id}/edit`;
export const enlaceArchivo = (id) => `https://drive.google.com/file/d/${id}/view`;

async function multipart(meta, cuerpo, tipo, id) {
  const b = 'll' + Math.random().toString(36).slice(2);
  const blob = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${tipo}\r\n\r\n`,
    cuerpo, `\r\n--${b}--`,
  ]);
  const url = id ? `${SUBIDA}/${id}?uploadType=multipart&fields=id` : `${SUBIDA}?uploadType=multipart&fields=id`;
  return json(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: blob });
}

// ---------- Datos de la app (carpeta oculta) ----------
let idDatos = null;
export async function leerDatos() {
  const q = encodeURIComponent(`name='${CONFIG.ARCHIVO_DATOS}'`);
  const r = await json(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
  if (!r.files?.length) return null;
  idDatos = r.files[0].id;
  return (await api(`${DRIVE}/files/${idDatos}?alt=media`)).json();
}
export async function escribirDatos(obj) {
  const cuerpo = JSON.stringify(obj);
  if (idDatos) return multipart({}, cuerpo, 'application/json', idDatos);
  const r = await multipart({ name: CONFIG.ARCHIVO_DATOS, parents: ['appDataFolder'] }, cuerpo, 'application/json');
  idDatos = r.id; return r;
}

// ---------- Carpetas y documentos ----------
async function existe(id) {
  try { const f = await json(`${DRIVE}/files/${id}?fields=id,trashed`); return !f.trashed; } catch { return false; }
}
async function crearCarpeta(nombre, padre) {
  const meta = { name: nombre, mimeType: 'application/vnd.google-apps.folder', ...(padre ? { parents: [padre] } : {}) };
  return (await json(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).id;
}
// ruta: ['Luria Lab', 'Casos', 'Caso 07']; cache: objeto donde se guardan los ids
export async function carpeta(ruta, cache) {
  let padre = null;
  for (let i = 0; i < ruta.length; i++) {
    const k = ruta.slice(0, i + 1).join('/');
    let id = cache[k];
    if (!id || !(await existe(id))) { id = await crearCarpeta(ruta[i], padre); cache[k] = id; }
    padre = id;
  }
  return padre;
}

export async function docDesdeHtml(nombre, html, padre) {
  return (await multipart({ name: nombre, mimeType: 'application/vnd.google-apps.document', parents: [padre] }, html, 'text/html; charset=UTF-8')).id;
}
export async function subirArchivo(nombre, blob, tipo, padre, convertirA) {
  const meta = { name: nombre, parents: [padre], ...(convertirA ? { mimeType: convertirA } : {}) };
  return (await multipart(meta, blob, tipo)).id;
}
// Subida de archivos grandes (audios y vídeos) en dos pasos
export async function subirGrande(nombre, blob, tipo, padre) {
  if (blob.size < 4_000_000) return subirArchivo(nombre, blob, tipo, padre);
  const r = await api(`${SUBIDA}?uploadType=resumable&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify({ name: nombre, parents: [padre] }),
  });
  const destino = r.headers.get('Location');
  if (!destino) throw new Error('Google no devolvió la dirección de subida. Inténtalo de nuevo.');
  const r2 = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': tipo }, body: blob });
  if (!r2.ok) throw new Error(`No se pudo subir el archivo (${r2.status}).`);
  return (await r2.json()).id;
}
export async function borrarArchivo(id) {
  try { await api(`${DRIVE}/files/${id}`, { method: 'DELETE' }); } catch (e) { if (!/\((404|410)\)/.test(e.message)) throw e; }
}
export async function copiar(id, nombre, padre) {
  return (await json(`${DRIVE}/files/${id}/copy?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, parents: [padre] }) })).id;
}
export async function renombrar(id, nombre) {
  await json(`${DRIVE}/files/${id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre }) });
}
export async function descargarArchivo(id) {
  return (await api(`${DRIVE}/files/${id}?alt=media`)).arrayBuffer();
}
// ---------- Google Sheets (hoja de horas) ----------
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const enlaceHoja = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export const existeArchivo = (id) => existe(id);
export async function pestanas(id) {
  const r = await json(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`);
  return r.sheets.map((s) => s.properties);
}
export async function loteHoja(id, requests) {
  return json(`${SHEETS}/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
}

// Nota: la app no lee el contenido de los diarios. Solo los crea (copia de la plantilla)
// y rellena la cabecera en el momento de crearlos, antes de que escribas nada.
const DOCS = 'https://docs.googleapis.com/v1/documents';
async function lote(docId, requests) {
  return json(`${DOCS}/${docId}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
}
export async function reemplazarMarcas(docId, mapa) {
  const requests = Object.entries(mapa).map(([k, v]) => ({
    replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: String(v ?? '') },
  }));
  if (requests.length) await lote(docId, requests);
}

// Borra el archivo de datos de Drive (con su historial de versiones) y lo crea de nuevo, limpio
export async function recrearDatos(obj) {
  const q = encodeURIComponent(`name='${CONFIG.ARCHIVO_DATOS}'`);
  const r = await json(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
  for (const f of r.files || []) await api(`${DRIVE}/files/${f.id}`, { method: 'DELETE' });
  idDatos = null;
  return escribirDatos(obj);
}

// ---------- Google Calendar (solo el calendario «Luria Lab» que crea la app) ----------
const CAL = 'https://www.googleapis.com/calendar/v3';
let calVerificado = null;
export async function asegurarCalendario(id) {
  if (id && calVerificado === id) return id;
  if (id) {
    try { await json(`${CAL}/calendars/${encodeURIComponent(id)}?fields=id`); calVerificado = id; return id; }
    catch (e) { if (!/\((404|410)\)/.test(e.message)) throw e; } // solo se crea otro si el anterior ya no existe
  }
  const c = await json(`${CAL}/calendars`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: 'Luria Lab', description: 'Prácticas · creado por la app Luria Lab', timeZone: 'Europe/Madrid' }) });
  calVerificado = c.id;
  return c.id;
}
export async function crearEvento(cal, ev) {
  return (await json(`${CAL}/calendars/${encodeURIComponent(cal)}/events?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })).id;
}
export async function cambiarEvento(cal, id, ev) {
  return (await json(`${CAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}?fields=id`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })).id;
}
export async function borrarEvento(cal, id) {
  try { await api(`${CAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { if (!/\((404|410)\)/.test(e.message)) throw e; }
}
export async function borrarCalendario(cal) {
  try { await api(`${CAL}/calendars/${encodeURIComponent(cal)}`, { method: 'DELETE' }); } catch (e) { if (!/\((404|410)\)/.test(e.message)) throw e; }
}

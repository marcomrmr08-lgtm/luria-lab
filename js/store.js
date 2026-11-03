// Estado de la app: se guarda siempre en este dispositivo y, si hay conexión con
// Google, se sincroniza con un archivo oculto en el Drive del alumno.
import { TUTORIAS_METODOLOGICAS, SEMINARIOS, HORARIO_TM, TIPOS_HOJA } from './calendario.js';

const CLAVE = 'luria-lab-v1';
let estado = null;
let alGuardar = null;

function porDefecto() {
  return {
    version: 1,
    updatedAt: 0,
    ajustes: {
      nombre: '',
      objetivoHoras: 450,
      periodo: 'Septiembre 2026 – marzo 2027',
      horas: { espejo: 2, coterapia: 2, tutoria_metodologica: 5, tutoria_caso: 3, seminario: 3, practica_pdp: 0 },
      correoFormacion: '',
      correoPracticas: '',
      plantillaDiarioId: null,
      plantillaPropia: false,
      plantillaHorasId: null,
      plantillaHorasNombre: '',
      carpetas: {},
    },
    terapeutas: [],
    actividades: [],
    horasPrevias: [],
    informes: {},
  };
}

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

// Tutorías metodológicas y seminarios vienen ya cargados en la agenda
function asegurarPrecargadas(s) {
  const ids = new Set(s.actividades.map((a) => a.id));
  for (const t of TUTORIAS_METODOLOGICAS) {
    const id = `tm-${t.n}`;
    if (!ids.has(id)) s.actividades.push({ id, tipo: 'tutoria_metodologica', numero: t.n, titulo: t.titulo, fecha: t.fecha, hora: HORARIO_TM, estado: 'programada', precargada: true, ficha: {}, tarea: {} });
  }
  for (const t of SEMINARIOS) {
    const id = `sem-${t.n}`;
    if (!ids.has(id)) s.actividades.push({ id, tipo: 'seminario', numero: t.n, titulo: t.titulo, fecha: t.fecha, hora: '', estado: 'programada', precargada: true, ficha: {} });
  }
}

function completar(s) {
  const d = porDefecto();
  s.ajustes = { ...d.ajustes, ...(s.ajustes || {}), horas: { ...d.ajustes.horas, ...(s.ajustes?.horas || {}) } };
  for (const k of ['terapeutas', 'actividades', 'horasPrevias']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.informes) s.informes = {};
  asegurarPrecargadas(s);
  return s;
}

export function cargar() {
  try { estado = JSON.parse(localStorage.getItem(CLAVE)); } catch { estado = null; }
  estado = completar(estado || porDefecto());
  return estado;
}

export const datos = () => estado;

export function guardar() {
  estado.updatedAt = Date.now();
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { console.warn('No se pudo guardar en el dispositivo', e); }
  alGuardar?.(estado);
}

export function actualizar(fn) { fn(estado); guardar(); }

export function reemplazar(nuevo, { sincronizar = false } = {}) {
  estado = completar(nuevo);
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch {}
  if (sincronizar) alGuardar?.(estado);
}

export function siempreAlGuardar(fn) { alGuardar = fn; }

// ---------- Consultas ----------
export const actividad = (id) => estado.actividades.find((a) => a.id === id);
export const terapeuta = (id) => estado.terapeutas.find((t) => t.id === id);
export const hechas = () => estado.actividades.filter((a) => a.estado === 'hecha');

export function horasDe(a) { return Number(estado.ajustes.horas[a.tipo] || 0); }

export function totalHoras() {
  let h = hechas().reduce((s, a) => s + horasDe(a), 0);
  for (const p of estado.horasPrevias) h += Number(p.sesiones || 0) * Number(estado.ajustes.horas[p.tipo] || 0);
  return h;
}

// Nº de sesiones por tipo (opcionalmente de un mes «YYYY-MM»)
export function conteos(mes) {
  const c = Object.fromEntries(TIPOS_HOJA.map((t) => [t, 0]));
  c.practica_pdp = 0;
  for (const a of hechas()) if (!mes || a.fecha.startsWith(mes)) c[a.tipo] = (c[a.tipo] || 0) + 1;
  for (const p of estado.horasPrevias) if (!mes || p.mes === mes) c[p.tipo] = (c[p.tipo] || 0) + Number(p.sesiones || 0);
  return c;
}

export function casos() {
  const m = new Map();
  for (const a of estado.actividades) {
    if ((a.tipo === 'espejo' || a.tipo === 'coterapia') && a.caso) {
      const k = a.caso.trim();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
  }
  return m;
}

export function sesionesDeCaso(codigo) {
  return estado.actividades
    .filter((a) => (a.tipo === 'espejo' || a.tipo === 'coterapia') && a.caso?.trim() === codigo && a.estado !== 'cancelada')
    .sort((x, y) => (x.fecha + (x.hora || '')).localeCompare(y.fecha + (y.hora || '')));
}

export function numeroSesion(a) {
  const ss = sesionesDeCaso(a.caso?.trim()).filter((s) => s.estado === 'hecha' || s.id === a.id);
  const i = ss.findIndex((s) => s.id === a.id);
  return i < 0 ? ss.length + 1 : i + 1;
}

// Nº correlativo de diario crítico (todas las sesiones de espejo y coterapia)
export function numeroDiario(a) {
  const ss = hechas().filter((s) => s.tipo === 'espejo' || s.tipo === 'coterapia' || s.id === a.id)
    .sort((x, y) => (x.fecha + (x.hora || '')).localeCompare(y.fecha + (y.hora || '')));
  const i = ss.findIndex((s) => s.id === a.id);
  return i < 0 ? ss.length + 1 : i + 1;
}

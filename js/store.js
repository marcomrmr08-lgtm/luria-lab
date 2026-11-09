// Estado de la app: se guarda siempre en este dispositivo y, si hay conexión con
// Google, se sincroniza con un archivo oculto en el Drive del alumno.
import { TUTORIAS_METODOLOGICAS, SEMINARIOS, HORARIO_TM, TIPOS_HOJA, FICHAS_EJEMPLO } from './calendario.js';
import { FICHAS_BASE, BIBLIO_BASE } from './hexaflexBase.js';

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
      tcPrevistas: 28,
      periodo: 'Septiembre 2026 – marzo 2027',
      horas: { espejo: 2, coterapia: 2, tutoria_metodologica: 5, tutoria_caso: 3, seminario: 3, practica_pdp: 0 },
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
    hexaflex: { modelo: {}, procesos: {}, fichas: [] },
    pdp: { fuertes: '', mejora: '', objetivos: [], revisiones: {} },
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
    if (!ids.has(id)) s.actividades.push({ id, tipo: 'seminario', numero: t.n, titulo: t.titulo, fecha: t.fecha, hora: '10:00', estado: 'programada', precargada: true, ficha: {} });
  }
}

// Seguridad: los datos pueden venir de Drive o de una copia importada. Se descarta lo que no tenga
// la forma esperada (identificadores, fechas, horas) para que nunca acabe dentro del HTML o de una URL.
const ID_OK = /^[\w.:-]{1,128}$/;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const HORA_OK = /^\d{2}:\d{2}$/;
function sanearIds(o, prof = 0) {
  if (!o || typeof o !== 'object' || prof > 8) return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if ((k === 'id' || /Id$/.test(k)) && v != null && !(typeof v === 'string' && ID_OK.test(v)) && typeof v !== 'number') o[k] = null;
    else if (typeof v === 'object') sanearIds(v, prof + 1);
  }
}
function sanear(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return {};
  sanearIds(s);
  const conId = (l) => (Array.isArray(l) ? l.filter((x) => x && typeof x === 'object' && x.id != null) : l);
  s.actividades = conId(s.actividades);
  if (Array.isArray(s.actividades)) s.actividades = s.actividades.filter((a) => typeof a.fecha === 'string' && FECHA_OK.test(a.fecha) && typeof a.tipo === 'string' && /^[a-z_]{1,40}$/.test(a.tipo));
  for (const a of s.actividades || []) if (a.hora != null && !(typeof a.hora === 'string' && HORA_OK.test(a.hora))) delete a.hora;
  s.terapeutas = conId(s.terapeutas); s.guia = conId(s.guia); s.biblio = conId(s.biblio);
  if (Array.isArray(s.horasPrevias)) s.horasPrevias = s.horasPrevias.filter((p) => p && typeof p.mes === 'string' && /^\d{4}-\d{2}$/.test(p.mes) && /^[a-z_]{1,40}$/.test(p.tipo || ''));
  if (s.hexaflex) s.hexaflex.fichas = conId(s.hexaflex.fichas);
  for (const e of s.guia || []) if (e.fecha != null && !FECHA_OK.test(String(e.fecha))) e.fecha = null;
  return s;
}

function completar(s) {
  s = sanear(s);
  const d = porDefecto();
  s.ajustes = { ...d.ajustes, ...(s.ajustes || {}), horas: { ...d.ajustes.horas, ...(s.ajustes?.horas || {}) } };
  for (const k of ['terapeutas', 'actividades', 'horasPrevias', 'borrados']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.informes) s.informes = {};
  if (!s.hexaflex) { s.hexaflex = { modelo: {}, procesos: {}, fichas: [] }; }
  s.hexaflex.modelo = s.hexaflex.modelo || {}; s.hexaflex.procesos = s.hexaflex.procesos || {};
  if (!Array.isArray(s.hexaflex.fichas)) s.hexaflex.fichas = [];
  if (!s.hexaflex.ejemplos) { s.hexaflex.fichas.push(...FICHAS_EJEMPLO.map((f) => ({ ...f }))); s.hexaflex.ejemplos = true; }
  // Fichas de «Hexaflex en práctica» (una vez): sustituyen a los ejemplos que coinciden
  if (!s.hexaflex.base2) {
    const borr = new Set(s.borrados || []);
    s.hexaflex.fichas = s.hexaflex.fichas.filter((f) => !(f.ejemplo && ['ej-hojas', 'ej-cuerda'].includes(f.id)));
    const ids = new Set(s.hexaflex.fichas.map((f) => f.id));
    for (const f of FICHAS_BASE) if (!ids.has(f.id) && !borr.has(f.id)) s.hexaflex.fichas.push(JSON.parse(JSON.stringify(f)));
    s.hexaflex.base2 = true;
  }
  // Una ficha de ejemplo por proceso: se quitan las demás precargadas si no se han usado
  if (!s.hexaflex.base3) {
    const quedan = new Set(FICHAS_BASE.map((f) => f.id));
    const usada = (f) => f.miVersion || f.audios?.length || f.videos?.length || f.notasExp?.length;
    const fuera = s.hexaflex.fichas.filter((f) => (f.base || f.ejemplo) && !quedan.has(f.id) && !usada(f)).map((f) => f.id);
    s.hexaflex.fichas = s.hexaflex.fichas.filter((f) => !fuera.includes(f.id));
    for (const f of s.hexaflex.fichas) if (quedan.has(f.id)) f.ejemplo = true;
    s.borrados = [...new Set([...(s.borrados || []), ...fuera])];
    s.hexaflex.base3 = true;
  }
  s.hexaflex.notas = s.hexaflex.notas || {};
  // Lo escrito en la versión anterior (qué es, cómo se ve, qué busca) pasa a «Mis notas»
  for (const [k, v] of Object.entries(s.hexaflex.procesos)) {
    const txt = [v.que, v.falta, v.busca, v.fuente].filter(Boolean).join('\n\n');
    if (txt && !s.hexaflex.notas[k]) s.hexaflex.notas[k] = txt;
  }
  s.hexaflex.procesos = {};
  for (const f of s.hexaflex.fichas) { f.audios = f.audios || []; f.videos = f.videos || []; f.exp = f.exp || {}; f.notasExp = f.notasExp || []; }
  if (!Array.isArray(s.biblio)) s.biblio = BIBLIO_BASE.map((b) => ({ ...b }));
  if (!Array.isArray(s.guia)) s.guia = [];
  if (!s.pdp) s.pdp = { fuertes: '', mejora: '', objetivos: [], revisiones: {} };
  if (!Array.isArray(s.pdp.objetivos)) s.pdp.objetivos = [];
  s.pdp.revisiones = s.pdp.revisiones || {};
  // La app ya no guarda correos: se eliminan los de versiones anteriores
  delete s.ajustes.correoFormacion; delete s.ajustes.correoPracticas;
  for (const t of s.terapeutas) delete t.email;
  for (const a of s.actividades) if (a.tarea) delete a.tarea.para;
  asegurarPrecargadas(s);
  // Los seminarios son a las 10:00 salvo que se haya puesto otra hora
  for (const a of s.actividades) if (a.tipo === 'seminario' && a.precargada && !a.hora) a.hora = '10:00';
  return s;
}

export function cargar() {
  try { estado = JSON.parse(localStorage.getItem(CLAVE)); } catch { estado = null; }
  estado = completar(estado || porDefecto());
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch {}
  return estado;
}

export const datos = () => estado;

export function guardar() {
  estado.updatedAt = Date.now();
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { console.warn('No se pudo guardar en el dispositivo', e); }
  alGuardar?.(estado);
}

export function actualizar(fn) { fn(estado); guardar(); }

// Borra actividades o terapeutas y lo recuerda, para que no vuelvan al juntarse con la copia de Drive
export function borrar(ids) {
  const set = new Set(ids);
  estado.actividades = estado.actividades.filter((a) => !set.has(a.id));
  estado.terapeutas = estado.terapeutas.filter((t) => !set.has(t.id));
  estado.borrados = [...new Set([...(estado.borrados || []), ...ids])];
  guardar();
}

export function reemplazar(nuevo, { sincronizar = false } = {}) {
  estado = completar(nuevo);
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch {}
  if (sincronizar) alGuardar?.(estado);
}

export function siempreAlGuardar(fn) { alGuardar = fn; }

// Junta dos copias (este dispositivo y Drive) sin perder nada de ninguna
const intacta = (a) => a.precargada && a.estado === 'programada' && !a.notasDocId && !a.notasArchivoId && !a.ideaClave && !a.guiaId
  && !Object.values(a.ficha || {}).some(Boolean) && !a.tarea?.docId && !a.tarea?.texto;
const ajustesVacios = (aj) => !aj?.nombre && !aj?.plantillaHorasNombre && !aj?.plantillaDiarioId;
export function fusionar(local, remoto) {
  const L = completar(JSON.parse(JSON.stringify(local)));
  const R = completar(JSON.parse(JSON.stringify(remoto)));
  const localMasNuevo = (L.updatedAt || 0) >= (R.updatedAt || 0);
  const borrados = new Set([...(L.borrados || []), ...(R.borrados || [])]);
  const porId = new Map(R.actividades.filter((a) => !borrados.has(a.id)).map((a) => [a.id, a]));
  for (const a of L.actividades) {
    if (borrados.has(a.id)) continue;
    const r = porId.get(a.id);
    if (!r) porId.set(a.id, a);
    else if (intacta(a) && !intacta(r)) { /* se queda la de Drive, que tiene más */ }
    else if (intacta(r) && !intacta(a)) porId.set(a.id, a);
    else if (localMasNuevo) porId.set(a.id, a);
  }
  const ter = new Map(R.terapeutas.filter((t) => !borrados.has(t.id)).map((t) => [t.id, t]));
  for (const t of L.terapeutas) ter.set(t.id, t);
  const base = ajustesVacios(L.ajustes) ? R.ajustes : ajustesVacios(R.ajustes) ? L.ajustes : (localMasNuevo ? L.ajustes : R.ajustes);
  const otro = base === L.ajustes ? R.ajustes : L.ajustes;
  const ajustes = { ...otro, ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== '' && v !== null && v !== undefined)) };
  ajustes.carpetas = { ...(otro.carpetas || {}), ...(base.carpetas || {}) };
  // Calendario: el identificador y su lista de eventos van juntos (si no, se recrean eventos duplicados)
  const reciente = (x) => (x.calendarioId ? (x.calendarioCreado || 1) : 0);
  const conCal = reciente(otro) > reciente(base) ? otro : base.calendarioId ? base : otro.calendarioId ? otro : null;
  if (conCal) {
    ajustes.calendarioId = conCal.calendarioId; ajustes.calendarioCreado = conCal.calendarioCreado; ajustes.calendarioColor = conCal.calendarioColor;
    const otroCal = conCal === base ? otro : base;
    ajustes.eventos = { ...(otroCal.calendarioId === conCal.calendarioId ? otroCal.eventos || {} : {}), ...(conCal.eventos || {}) };
  }
  const informes = { ...R.informes };
  for (const [m, v] of Object.entries(L.informes)) informes[m] = { ...(informes[m] || {}), ...v };
  // Hexaflex: fichas de las dos copias; teoría y PDP de la copia que tenga contenido (o la más reciente)
  const conTexto = (o) => JSON.stringify(o || {}).replace(/"[^"]*":""|[{}\[\],:]|"(fuertes|mejora|objetivos|revisiones)"/g, '').length > 0;
  const fichas = new Map(R.hexaflex.fichas.filter((f) => !borrados.has(f.id)).map((f) => [f.id, f]));
  for (const f of L.hexaflex.fichas) if (!borrados.has(f.id) && (localMasNuevo || !fichas.has(f.id))) fichas.set(f.id, f);
  const elegir = (l, r) => (conTexto(l) && conTexto(r) ? (localMasNuevo ? l : r) : conTexto(l) ? l : r);
  const notas = { ...R.hexaflex.notas }; for (const [k, v] of Object.entries(L.hexaflex.notas || {})) if (v && (localMasNuevo || !notas[k])) notas[k] = v;
  const biblio = new Map(R.biblio.filter((b) => !borrados.has(b.id)).map((b) => [b.id, b]));
  for (const b of L.biblio) if (!borrados.has(b.id) && (localMasNuevo || !biblio.has(b.id))) biblio.set(b.id, b);
  const guia = new Map(R.guia.filter((g) => !borrados.has(g.id)).map((g) => [g.id, g]));
  for (const g of L.guia) if (!borrados.has(g.id) && (localMasNuevo || !guia.has(g.id))) guia.set(g.id, g);
  const hexaflex = { ...R.hexaflex, ...L.hexaflex, notas, modelo: elegir(L.hexaflex.modelo, R.hexaflex.modelo), procesos: { ...R.hexaflex.procesos, ...Object.fromEntries(Object.entries(L.hexaflex.procesos).filter(([k, v]) => conTexto(v) && (localMasNuevo || !conTexto(R.hexaflex.procesos[k])))) }, fichas: [...fichas.values()] };
  const pdp = elegir(L.pdp, R.pdp);
  return {
    ...R, ...L,
    hexaflex, pdp, biblio: [...biblio.values()], guia: [...guia.values()],
    updatedAt: Date.now(),
    ajustes, informes,
    actividades: [...porId.values()],
    terapeutas: [...ter.values()],
    horasPrevias: L.horasPrevias,
    borrados: [...borrados],
  };
}

// ---------- Consultas ----------
export const actividad = (id) => estado.actividades.find((a) => a.id === id);
export const terapeuta = (id) => estado.terapeutas.find((t) => t.id === id);
export const hechas = () => estado.actividades.filter((a) => a.estado === 'hecha');

export function horasDe(a) { return Number(estado.ajustes.horas[a.tipo] || 0); }

export function totalHoras() {
  let h = hechas().reduce((s, a) => s + horasDe(a), 0);
  return h;
}

// Nº de sesiones por tipo (opcionalmente de un mes «YYYY-MM»)
export function conteos(mes) {
  const c = Object.fromEntries(TIPOS_HOJA.map((t) => [t, 0]));
  c.practica_pdp = 0;
  for (const a of hechas()) if (!mes || a.fecha.startsWith(mes)) c[a.tipo] = (c[a.tipo] || 0) + 1;
  return c;
}

// Cuántos espejos/coterapias faltan para el objetivo, con un plan fijo:
// las tutorías metodológicas, seminarios y tutorías de caso previstas ya tienen sus horas
// reservadas; el resto del objetivo se cubre con sesiones. Así, lo que falta solo baja
// cuando haces espejos o coterapias (no con tutorías extra).
export function planSesiones() {
  const aj = estado.ajustes; const h = aj.horas;
  const tm = TUTORIAS_METODOLOGICAS.length; const sem = SEMINARIOS.length;
  const reservadas = tm * Number(h.tutoria_metodologica || 0) + sem * Number(h.seminario || 0) + Number(aj.tcPrevistas || 0) * Number(h.tutoria_caso || 0);
  const porSesion = Number(h.espejo || h.coterapia || 2) || 2;
  const necesarias = Math.max(0, Math.ceil((Number(aj.objetivoHoras || 0) - reservadas) / porSesion));
  const c = conteos();
  const hechasS = c.espejo + c.coterapia;
  const planificadas = estado.actividades.filter((a) => (a.tipo === 'espejo' || a.tipo === 'coterapia') && a.estado === 'programada').length;
  return { necesarias, hechas: hechasS, faltan: Math.max(0, necesarias - hechasS), planificadas, reservadas, porSesion, tm, sem };
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

// Nº de sesión dentro del caso. Si en una sesión se ha puesto el número a mano,
// las siguientes siguen contando desde ese número.
export function numeroSesion(a, { sinPropio = false } = {}) {
  const ss = sesionesDeCaso(a.caso?.trim()).filter((s) => s.estado === 'hecha' || s.id === a.id);
  let n = 0;
  for (const s of ss) {
    const propio = s.id === a.id && sinPropio ? null : Number(s.numSesion) || null;
    n = propio || n + 1;
    if (s.id === a.id) return n;
  }
  return n + 1;
}

// Nº correlativo de diario crítico (todas las sesiones de espejo y coterapia)
export function numeroDiario(a) {
  const ss = hechas().filter((s) => s.tipo === 'espejo' || s.tipo === 'coterapia' || s.id === a.id)
    .sort((x, y) => (x.fecha + (x.hora || '')).localeCompare(y.fecha + (y.hora || '')));
  const i = ss.findIndex((s) => s.id === a.id);
  return i < 0 ? ss.length + 1 : i + 1;
}

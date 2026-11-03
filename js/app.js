// Luria Lab · cuadernillo de prácticas
import { CONFIG } from './config.js';
import * as S from './store.js';
import * as G from './google.js';
import * as D from './documentos.js';
import { generarHoja, leerHoja, asignarCasillas, mesDeTitulo, COLUMNAS_HOJA } from './hojaHoras.js';
import { Zip } from './zip.js';
import { TIPOS, TIPOS_HOJA, TEMAS, MESES, REVISIONES_PDP, PROCESOS, TIPOS_FICHA } from './calendario.js';
import { esc, hoyISO, sumarDias, fmtFecha, fmtCorta, fmtNum, nombreMes, toast, abrirModal, cerrarModal, conCarga, idbGet, idbSet, descargar, icon } from './ui.js';

const app = document.getElementById('app');
const RAIZ = CONFIG.CARPETA_RAIZ;
S.cargar();

// Logo del centro: se guarda solo en este dispositivo (no se publica con la app)
let logoURL = null;
idbGet('logo').then((b) => { if (b) { logoURL = URL.createObjectURL(b); render(); } }).catch(() => {});

// ======================= Sincronización con Drive =======================
let temporizador = null; let subiendo = false; let otraVez = false;
const marcarPendiente = (v) => { try { if (v) localStorage.setItem('ll-pendiente', '1'); else localStorage.removeItem('ll-pendiente'); } catch {} };
const hayPendiente = () => { try { return localStorage.getItem('ll-pendiente') === '1'; } catch { return false; } };
S.siempreAlGuardar(() => {
  if (!G.conectado()) { marcarPendiente(true); return; }
  clearTimeout(temporizador);
  temporizador = setTimeout(subir, 1200);
});
async function subir() {
  if (subiendo) { otraVez = true; return; }
  subiendo = true;
  try { await G.escribirDatos(S.datos()); marcarPendiente(false); } catch (e) { marcarPendiente(true); console.warn('No se pudo sincronizar', e); }
  sincronizarCalendario().catch((e) => console.warn('Calendario', e));
  subiendo = false;
  if (otraVez) { otraVez = false; subir(); }
}
async function conectarYSincronizar() {
  await G.conectar({ calendario: Boolean(S.datos().ajustes.calendarioActivo) });
  const remoto = await G.leerDatos();
  // Nunca se sustituye una copia por otra: se juntan las dos, para no perder nada
  if (remoto) {
    const antes = S.hechas().length;
    S.reemplazar(S.fusionar(S.datos(), remoto));
    const recuperadas = S.hechas().length - antes;
    if (recuperadas > 0) toast(`Recuperadas ${recuperadas} actividades desde tu Drive.`, { ms: 9000 });
  }
  // Una sola vez: rehace el archivo de Drive para que no quede ninguna versión antigua con correos
  let limpio = false; try { limpio = localStorage.getItem('ll-limpieza-correos') === '1'; } catch {}
  if (!limpio) { await G.recrearDatos(S.datos()); try { localStorage.setItem('ll-limpieza-correos', '1'); } catch {} }
  else await G.escribirDatos(S.datos());
  marcarPendiente(false);
  sincronizarCalendario().catch((e) => console.warn('Calendario', e));
}
// ======================= Google Calendar =======================
// Solo se escribe en el calendario «Luria Lab» que crea la app. Va en una dirección: app → Calendar.
const DURACION_MIN = { espejo: 60, coterapia: 60, tutoria_caso: 120, seminario: 120, tutoria_metodologica: 240, practica_pdp: 60 };
function sumarMinutos(fecha, hora, min) {
  const [y, m, d] = fecha.split('-').map(Number); const [h, mi] = hora.split(':').map(Number);
  const t = new Date(y, m - 1, d, h, mi + min);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}:00`;
}
function eventoDe(a) {
  const nombre = esSesion(a) ? `${nombreTipo(a)} · ${casoPub(a)}` : a.tipo === 'tutoria_metodologica' ? `T. metodológica${a.numero ? ' ' + a.numero : ''} · ${a.titulo}` : a.tipo === 'seminario' ? `Seminario${a.numero ? ' ' + a.numero : ''} · ${a.titulo}` : titulo(a);
  const lugar = esSesion(a) ? (a.formato === 'online' ? 'Online (Teams)' : 'Luria · presencial') : a.tipo === 'tutoria_caso' ? 'Zoom' : 'Luria · presencial';
  const modo = esSesion(a) ? (a.formato === 'online' ? 'Online' : 'Presencial') : a.tipo === 'tutoria_caso' ? 'Online · Zoom' : 'Presencial';
  const ev = { summary: `${nombre} · ${modo}`, location: lugar, description: 'Creado por Luria Lab. Los cambios se hacen desde la app.' };
  const hora = a.hora || (a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario' ? '10:00' : '');
  if (hora) {
    ev.start = { dateTime: `${a.fecha}T${hora}:00`, timeZone: 'Europe/Madrid' };
    ev.end = { dateTime: sumarMinutos(a.fecha, hora, DURACION_MIN[a.tipo] || 60), timeZone: 'Europe/Madrid' };
  } else { ev.start = { date: a.fecha }; ev.end = { date: sumarDias(a.fecha, 1) }; }
  return ev;
}
let sincCal = false; let otraCal = false;
async function sincronizarCalendario() {
  const aj = S.datos().ajustes;
  if (!aj.calendarioActivo || !G.tieneCalendario()) return;
  if (sincCal) { otraCal = true; return; }
  sincCal = true; let cambio = false;
  try {
    const cal = await G.asegurarCalendario(aj.calendarioId);
    if (cal !== aj.calendarioId) { aj.calendarioId = cal; aj.eventos = {}; cambio = true; }
    const eventos = aj.eventos || (aj.eventos = {});
    const vivas = new Map(S.datos().actividades.filter((a) => !a.pasada && (a.estado === 'programada' || a.estado === 'hecha')).map((a) => [a.id, a]));
    for (const [id, a] of vivas) {
      const ev = eventoDe(a); const h = JSON.stringify(ev); const e = eventos[id];
      if (!e) { eventos[id] = { id: await G.crearEvento(cal, ev), h }; cambio = true; }
      else if (e.h !== h) { try { await G.cambiarEvento(cal, e.id, ev); } catch { e.id = await G.crearEvento(cal, ev); } e.h = h; cambio = true; }
    }
    for (const id of Object.keys(eventos)) if (!vivas.has(id)) { await G.borrarEvento(cal, eventos[id].id); delete eventos[id]; cambio = true; }
  } finally {
    sincCal = false;
    if (cambio) { try { localStorage.setItem('luria-lab-v1', JSON.stringify(S.datos())); } catch {} }
    if (otraCal) { otraCal = false; sincronizarCalendario().catch((e) => console.warn('Calendario', e)); }
  }
}

async function google() {
  if (!G.configurado()) throw new Error('La conexión con Google aún no está configurada.');
  if (!G.conectado()) { await conectarYSincronizar(); }
}

// ======================= Utilidades =======================
const porFechaHora = (x, y) => (x.fecha + (x.hora || '99')).localeCompare(y.fecha + (y.hora || '99'));
const esSesion = (a) => a.tipo === 'espejo' || a.tipo === 'coterapia';
const color = (a) => TIPOS[a.tipo]?.color || 'gris';
const nombreTipo = (a) => TIPOS[a.tipo]?.nombre || a.tipo;
// Iniciales del terapeuta (dato profesional: pueden ir en todas partes)
function inicialesTer(t) {
  if (!t) return '';
  if (t.iniciales) return t.iniciales.toUpperCase();
  return t.nombre.trim().split(/\s+/).filter((w) => !/^(de|del|la|las|los|y)$/i.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}
// Alias privado del paciente: SOLO en este dispositivo (no va a Drive, Calendar ni Docs)
const ALIAS = 'll-alias-casos';
const leerAlias = () => { try { return JSON.parse(localStorage.getItem(ALIAS)) || {}; } catch { return {}; } };
const aliasDe = (codigo) => (codigo ? leerAlias()[codigo.trim()] || '' : '');
function ponerAlias(codigo, valor) {
  const m = leerAlias(); const k = codigo.trim();
  if (valor) m[k] = valor; else delete m[k];
  try { localStorage.setItem(ALIAS, JSON.stringify(m)); } catch {}
}
// Si el código ya empieza por «Caso», no se repite la palabra
const etiquetaCaso = (c) => { const t = (c || '—').trim(); return /^caso\b/i.test(t) ? t : `Caso ${t}`; };
// Código del caso: público (calendario, Docs) y en la app (con el alias privado)
const casoPub = (a) => `${etiquetaCaso(a.caso)}${inicialesTer(S.terapeuta(a.terapeutaId)) ? ' · ' + inicialesTer(S.terapeuta(a.terapeutaId)) : ''}`;
const casoApp = (a) => { const al = aliasDe(a.caso); return `${etiquetaCaso(a.caso)}${al ? ' · ' + al : ''}${inicialesTer(S.terapeuta(a.terapeutaId)) ? ' · ' + inicialesTer(S.terapeuta(a.terapeutaId)) : ''}`; };
const primerNombre = () => (S.datos().ajustes.nombre || '').trim().split(/\s+/)[0];

function titulo(a) {
  if (esSesion(a)) return `${nombreTipo(a)} · ${casoPub(a)}`;
  if (a.tipo === 'tutoria_metodologica') return `T. metodológica${a.numero ? ' ' + a.numero : ''} · ${a.titulo}`;
  if (a.tipo === 'seminario') return `Seminario${a.numero ? ' ' + a.numero : ''} · ${a.titulo}`;
  if (a.tipo === 'tutoria_caso') return 'Tutoría de caso' + (S.terapeuta(a.terapeutaId) ? ` · ${S.terapeuta(a.terapeutaId).nombre}` : '');
  return a.titulo || nombreTipo(a);
}
function rutaForm(a) {
  const r = { espejo: 'sesion', coterapia: 'sesion', tutoria_caso: 'tc', tutoria_metodologica: 'ficha', seminario: 'ficha', practica_pdp: 'practica' }[a.tipo];
  return `#/${r}/${encodeURIComponent(a.id)}`;
}
const rutaVer = (a) => (esSesion(a) && a.estado === 'hecha' && a.caso ? `#/caso/${encodeURIComponent(a.caso.trim())}` : rutaForm(a));

const nav = (activo) => {
  const items = [['inicio', 'Inicio', 'inicio'], ['diario', 'Diario', 'diario'], ['guia', 'Guía', 'guia'], ['pdp', 'Mi PDP', 'pdp'], ['hexaflex', 'Hexaflex', 'hexa']];
  return `<nav class="nav" aria-label="Secciones"><div class="nav-in">${items.map(([r, t, i]) =>
    `<a href="#/${r}" class="${r === activo ? 'activo' : ''}" ${r === activo ? 'aria-current="page"' : ''}>${icon(i, 24)}${t}</a>`).join('')}</div></nav>`;
};
const fab = (compacto) => `<a href="#/nueva" class="fab" ${compacto ? 'aria-label="Nueva entrada" style="width:56px;padding:0;justify-content:center"' : ''}>${icon('mas', 22)}${compacto ? '' : 'Nueva entrada'}</a>`;
const volver = (href, texto) => `<header class="cabecera"><div class="cabecera-izq"><a href="${href}" class="volver" aria-label="Volver">${icon('atras', 24)}</a><span class="titulo-m">${esc(texto)}</span></div></header>`;
const opcionesTerapeuta = (sel) => `<option value="">Sin indicar</option>${S.datos().terapeutas.map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}<option value="__nuevo">+ Añadir terapeuta…</option>`;
const seg = (nombre, opciones, valor) => `<div class="segmentado" role="radiogroup">${opciones.map(([v, t]) => {
  const id = `${nombre}-${v}`; return `<input type="radio" id="${id}" name="${nombre}" value="${v}" ${v === valor ? 'checked' : ''}><label for="${id}">${t}</label>`;
}).join('')}</div>`;

function leerForm(form) {
  const fd = new FormData(form); const o = {};
  for (const [k, v] of fd.entries()) { if (k in o) { o[k] = [].concat(o[k], v); } else o[k] = v; }
  return o;
}
function irA(ruta) { if (location.hash === ruta) render(); else location.hash = ruta; }

// Selector de terapeuta con opción de añadir uno nuevo al vuelo
function montarSelectorTerapeuta(raiz) {
  raiz.querySelectorAll('select[data-terapeuta]').forEach((sel) => {
    let anterior = sel.value;
    sel.addEventListener('change', () => {
      if (sel.value !== '__nuevo') { anterior = sel.value; return; }
      sel.value = anterior;
      modalTerapeuta(null, (t) => {
        raiz.querySelectorAll('select[data-terapeuta]').forEach((s) => { const v = s === sel ? t.id : s.value; s.innerHTML = opcionesTerapeuta(v); });
      });
    });
  });
}

// ======================= Acciones con Google =======================
async function plantillaDiarioId() {
  const aj = S.datos().ajustes;
  if (aj.plantillaDiarioId) return aj.plantillaDiarioId;
  const dir = await G.carpeta([RAIZ, 'Plantillas'], aj.carpetas);
  aj.plantillaDiarioId = await G.docDesdeHtml('Plantilla · Diario crítico', D.plantillaDiario(), dir);
  aj.plantillaPropia = false; S.guardar();
  return aj.plantillaDiarioId;
}
async function crearDiario(id) {
  await google();
  const a = S.actividad(id);
  const codigo = a.caso.trim();
  const dir = await G.carpeta([RAIZ, 'Casos', etiquetaCaso(codigo)], S.datos().ajustes.carpetas);
  const ini = inicialesTer(S.terapeuta(a.terapeutaId));
  const nombre = `${etiquetaCaso(codigo)}${ini ? ' ' + ini : ''} – S${S.numeroSesion(a)} – ${nombreTipo(a)} – ${fmtNum(a.fecha).replaceAll('/', '-')}`;
  let doc;
  try { doc = await G.copiar(await plantillaDiarioId(), nombre, dir); }
  catch { S.datos().ajustes.plantillaDiarioId = null; doc = await G.copiar(await plantillaDiarioId(), nombre, dir); }
  await G.reemplazarMarcas(doc, D.marcasDiario({
    numero: S.numeroDiario(a), codigo, fecha: a.fecha, tipo: a.tipo, formato: a.formato,
    duracion: `1 h (computa ${S.horasDe(a)} h)`, terapeuta: S.terapeuta(a.terapeutaId)?.nombre, notas: a.notasCaliente,
  }));
  S.actualizar(() => { a.docId = doc; });
  return doc;
}
async function abrirNotas(boton, id) {
  const a = S.actividad(id);
  if (a?.notasDocId) { window.open(G.enlaceDoc(a.notasDocId), '_blank', 'noopener'); return; }
  await conCarga(boton, async () => {
    await google();
    const act = S.actividad(id);
    const dir = await G.carpeta([RAIZ, 'Notas'], S.datos().ajustes.carpetas);
    const doc = await G.docDesdeHtml(`Notas · ${titulo(act)} · ${fmtNum(act.fecha)}`, D.documentoNotas(titulo(act), act.fecha), dir);
    S.actualizar(() => { act.notasDocId = doc; });
    toast('Documento de notas creado.', { enlace: G.enlaceDoc(doc), texto: 'Abrir notas', ms: 12000 });
    render();
  });
}

// ======================= Ventanas =======================
function modalTerapeuta(t, alGuardar) {
  abrirModal(`<h2>${t ? 'Editar terapeuta' : 'Añadir terapeuta'}</h2>
  <form id="f-ter" class="seccion">
    <div class="campo"><label for="t-nombre">Nombre</label><input type="text" id="t-nombre" name="nombre" required value="${esc(t?.nombre)}"><span class="ayuda">Solo el nombre, para agrupar tus sesiones. La app no guarda correos.</span></div>
    <div class="campo"><label for="t-ini">Iniciales <span class="suave" style="font-weight:400">(opcional)</span></label><input type="text" id="t-ini" name="iniciales" maxlength="4" value="${esc(t?.iniciales)}" placeholder="Se calculan solas del nombre" autocomplete="off"><span class="ayuda">Aparecen en el código del caso, también en Google Calendar.</span></div>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    d.querySelector('#f-ter').addEventListener('submit', (e) => {
      e.preventDefault(); const v = leerForm(e.target);
      let ter = t;
      const ini = (v.iniciales || '').trim().toUpperCase();
      S.actualizar((s) => { if (ter) Object.assign(ter, { nombre: v.nombre.trim(), iniciales: ini }); else { ter = { id: S.nuevoId(), nombre: v.nombre.trim(), iniciales: ini }; s.terapeutas.push(ter); } });
      cerrarModal(); alGuardar?.(ter);
    });
  });
}

function modalNoAsistir(id) {
  const a = S.actividad(id);
  abrirModal(`<h2>No puedo asistir</h2>
  <div class="aviso-caja">${icon('correo', 18)}<span>Recuerda avisar desde tu correo al terapeuta y a la responsable de prácticas, como pide Luria. La app no envía nada.</span></div>
  <button class="btn primario grande" id="b-cancelar-act">Quitar de la agenda (no asistí)</button>
  <button class="btn texto" data-cerrar>Cerrar</button>`, (d) => {
    d.querySelector('#b-cancelar-act').addEventListener('click', () => {
      S.actualizar(() => { a.estado = 'cancelada'; }); cerrarModal(); toast('Quitada de la agenda.'); render();
    });
  });
}

// La app crea los documentos pero nunca vuelve a leer su contenido ni envía correos.
const AYUDA_PDF = 'Para enviarlo: en el Doc, Archivo → Descargar → PDF, y mándalo desde tu correo.';

function modalFeedback(id) {
  const a = S.actividad(id);
  abrirModal(`<h2>Feedback del terapeuta</h2>
  <form id="f-fb" class="seccion">
    <div class="campo"><label for="fb">Pega lo que te ha respondido</label><textarea id="fb" name="texto" rows="8" required></textarea>
    <span class="ayuda">Se guarda en la app, junto a la sesión. Si también lo quieres en el Doc, pégalo en el apartado «Feedback del terapeuta».</span></div>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    d.querySelector('#f-fb').addEventListener('submit', (e) => {
      e.preventDefault(); const v = leerForm(e.target);
      S.actualizar(() => { (a.feedback = a.feedback || []).push({ fecha: hoyISO(), texto: v.texto.trim() }); });
      cerrarModal(); toast('Feedback guardado.'); render();
    });
  });
}

function modalAnadirTC() {
  const hoy = hoyISO();
  let mes = MESES.includes(hoy.slice(0, 7)) ? hoy.slice(0, 7) : MESES[0];
  const sel = new Map(); // fecha -> {hora, terapeutaId}
  abrirModal(`<h2>Tutorías de caso</h2>
  <p class="suave pequeno" style="line-height:1.4">Toca los días en que te han convocado y pon la hora de cada una.</p>
  <form id="f-tc" class="seccion">
    <div class="campo"><label for="tc-mes">Mes</label><select id="tc-mes">${MESES.map((m) => `<option value="${m}" ${m === mes ? 'selected' : ''}>${esc(nombreMes(m))}</option>`).join('')}</select></div>
    <div id="tc-dias" class="dias" role="group" aria-label="Días del mes"></div>
    <div id="tc-sel" class="seccion"></div>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="b-tc">Guardar</button></div>
  </form>`, (d) => {
    const yaHay = (f) => S.datos().actividades.filter((a) => a.tipo === 'tutoria_caso' && a.fecha === f && a.estado !== 'cancelada').length;
    const pintarLista = () => {
      const fechas = [...sel.keys()].sort();
      const caja = d.querySelector('#tc-sel');
      if (!fechas.length) { caja.innerHTML = ''; d.querySelector('#b-tc').textContent = 'Guardar'; return; }
      caja.innerHTML = `<div class="dos-col" style="align-items:end"><div class="campo"><label for="tc-todas">Misma hora para todas</label><input type="time" id="tc-todas"></div><button type="button" class="btn" id="b-todas">Aplicar</button></div>
        <div class="tarjeta lista">${fechas.map((f) => `<div class="fila" style="flex-wrap:wrap"><span style="font-weight:700;min-width:96px">${esc(fmtFecha(f, { weekday: 'short', day: 'numeric', month: 'short' }))}${yaHay(f) ? `<br><span class="mini suave">ya tienes ${yaHay(f)}</span>` : ''}</span>
          <span style="display:flex;gap:6px;flex:1;min-width:200px"><input type="time" data-hora="${f}" value="${esc(sel.get(f).hora)}" aria-label="Hora" style="min-height:40px;flex:0 0 108px"><select data-ter="${f}" data-terapeuta aria-label="Terapeuta" style="min-height:40px">${opcionesTerapeuta(sel.get(f).terapeutaId)}</select></span></div>`).join('')}</div>`;
      d.querySelector('#b-tc').textContent = `Guardar ${fechas.length} tutoría${fechas.length === 1 ? '' : 's'}`;
      caja.querySelectorAll('[data-hora]').forEach((i) => i.addEventListener('input', () => { sel.get(i.dataset.hora).hora = i.value; }));
      caja.querySelectorAll('[data-ter]').forEach((i) => i.addEventListener('change', () => { if (i.value !== '__nuevo') sel.get(i.dataset.ter).terapeutaId = i.value || null; }));
      caja.querySelector('#b-todas').addEventListener('click', () => {
        const h = caja.querySelector('#tc-todas').value; if (!h) return;
        for (const v of sel.values()) v.hora = h;
        caja.querySelectorAll('[data-hora]').forEach((i) => { i.value = h; });
      });
      montarSelectorTerapeuta(caja);
    };
    const pintarDias = () => {
      const [y, m] = mes.split('-').map(Number);
      const nd = new Date(y, m, 0).getDate(); const ini = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span class="dia-cab" aria-hidden="true">${x}</span>`).join('') + '<span></span>'.repeat(ini);
      for (let i = 1; i <= nd; i++) {
        const f = `${mes}-${String(i).padStart(2, '0')}`;
        h += `<input type="checkbox" id="tcd-${i}" value="${f}" ${sel.has(f) ? 'checked' : ''}><label for="tcd-${i}" class="${f === hoy ? 'es-hoy' : ''}">${i}${yaHay(f) ? '<i class="punto"></i>' : ''}</label>`;
      }
      const g = d.querySelector('#tc-dias'); g.innerHTML = h;
      g.onchange = (e) => { const f = e.target.value; if (e.target.checked) sel.set(f, { hora: '', terapeutaId: null }); else sel.delete(f); pintarLista(); };
    };
    d.querySelector('#tc-mes').addEventListener('change', (e) => { mes = e.target.value; pintarDias(); });
    pintarDias(); pintarLista();
    d.querySelector('#f-tc').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!sel.size) { toast('Toca al menos un día.', { error: true }); return; }
      S.actualizar((s) => { for (const [f, v] of sel) s.actividades.push({ id: S.nuevoId(), tipo: 'tutoria_caso', fecha: f, hora: v.hora, terapeutaId: v.terapeutaId, estado: 'programada', formato: 'zoom', temas: [] }); });
      const n = sel.size; cerrarModal(); toast(`${n} tutoría${n === 1 ? '' : 's'} de caso añadida${n === 1 ? '' : 's'} a la agenda.`); render();
    });
  });
}

function modalAnadirSesion() {
  const casos = [...S.casos().keys()];
  abrirModal(`<h2>Espejo o coterapia asignado</h2>
  <form id="f-ses" class="seccion">
    ${seg('tipo', [['espejo', 'Espejo'], ['coterapia', 'Coterapia']], 'espejo')}
    <div class="campo"><label for="s-caso">Código de caso</label><input type="text" id="s-caso" name="caso" list="l-casos" required placeholder="p. ej. 07"><datalist id="l-casos">${casos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <span class="ayuda">Nunca nombres ni iniciales.</span></div>
    <div class="dos-col"><div class="campo"><label for="s-fecha">Fecha</label><input type="date" id="s-fecha" name="fecha" required></div><div class="campo"><label for="s-hora">Hora</label><input type="time" id="s-hora" name="hora"></div></div>
    ${seg('formato', [['presencial', 'Presencial'], ['online', 'Online (Teams)']], 'presencial')}
    <div class="campo"><label for="s-ter">Terapeuta</label><select id="s-ter" name="terapeutaId" data-terapeuta>${opcionesTerapeuta('')}</select></div>
    <label class="pequeno" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="semanal" value="1"> Se repite cada semana (añade 8 semanas)</label>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    montarSelectorTerapeuta(d);
    d.querySelector('#f-ses').addEventListener('submit', (e) => {
      e.preventDefault(); const v = leerForm(e.target);
      const veces = v.semanal ? 8 : 1;
      S.actualizar((s) => { for (let i = 0; i < veces; i++) s.actividades.push({ id: S.nuevoId(), tipo: v.tipo, caso: v.caso.trim(), fecha: sumarDias(v.fecha, 7 * i), hora: v.hora, formato: v.formato, terapeutaId: v.terapeutaId || null, estado: 'programada' }); });
      cerrarModal(); toast(veces > 1 ? `Añadidas ${veces} sesiones.` : 'Sesión añadida a la agenda.'); render();
    });
  });
}

// Crea actividades pasadas a partir de una lista [{tipo, fecha}], sin duplicar lo que ya existe
function anadirPasadas(lista) {
  const grupos = new Map();
  for (const a of lista) { if (!a.tipo) continue; const k = `${a.fecha}|${a.tipo}`; grupos.set(k, (grupos.get(k) || 0) + 1); }
  const r = { creadas: 0, asistidas: 0, yaEstaban: 0 };
  S.actualizar((s) => {
    for (const [k, n] of grupos) {
      const [fecha, tipo] = k.split('|');
      const existentes = s.actividades.filter((a) => a.tipo === tipo && a.fecha === fecha && a.estado === 'hecha').length;
      let faltan = n - existentes;
      r.yaEstaban += Math.min(n, existentes);
      if (faltan <= 0) continue;
      if (tipo === 'tutoria_metodologica' || tipo === 'seminario') {
        for (const a of s.actividades.filter((x) => x.tipo === tipo && x.fecha === fecha && x.estado !== 'hecha')) {
          if (faltan <= 0) break; a.estado = 'hecha'; r.asistidas++; faltan--;
        }
      }
      for (let i = 0; i < faltan; i++) {
        const extra = tipo === 'tutoria_metodologica' || tipo === 'seminario' ? { titulo: `${TIPOS[tipo].nombre} (importada)`, ficha: {}, tarea: {} } : {};
        s.actividades.push({ id: S.nuevoId(), tipo, fecha, hora: '', estado: 'hecha', pasada: true, formato: tipo === 'tutoria_caso' ? 'zoom' : 'presencial', temas: [], ...extra });
        r.creadas++;
      }
    }
  });
  return r;
}

function modalVariosDias() {
  let mes = '2026-10';
  abrirModal(`<h2>Marcar varios días</h2>
  <form id="f-vd" class="seccion">
    <div class="dos-col">
      <div class="campo"><label for="vd-tipo">Actividad</label><select id="vd-tipo" name="tipo">${['tutoria_caso', 'espejo', 'coterapia'].map((t) => `<option value="${t}">${esc(TIPOS[t].nombre)}</option>`).join('')}</select></div>
      <div class="campo"><label for="vd-mes">Mes</label><select id="vd-mes">${MESES.slice(0, 7).map((m) => `<option value="${m}" ${m === mes ? 'selected' : ''}>${esc(nombreMes(m))}</option>`).join('')}</select></div>
    </div>
    <div id="vd-dias" class="dias" role="group" aria-label="Días del mes"></div>
    <p class="mini suave" style="line-height:1.4">Toca los días en que hiciste esa actividad (una por día). Si un día hiciste dos, añade la segunda con «Un día concreto».</p>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="b-vd">Añadir</button></div>
  </form>`, (d) => {
    const pintar = () => {
      const [y, m] = mes.split('-').map(Number);
      const nd = new Date(y, m, 0).getDate(); const ini = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span class="dia-cab" aria-hidden="true">${x}</span>`).join('');
      h += '<span></span>'.repeat(ini);
      for (let i = 1; i <= nd; i++) h += `<input type="checkbox" id="vd-${i}" name="dia" value="${i}"><label for="vd-${i}">${i}</label>`;
      d.querySelector('#vd-dias').innerHTML = h;
      const contar = () => { const n = d.querySelectorAll('#vd-dias input:checked').length; d.querySelector('#b-vd').textContent = n ? `Añadir ${n} día${n === 1 ? '' : 's'}` : 'Añadir'; };
      d.querySelector('#vd-dias').addEventListener('change', contar); contar();
    };
    d.querySelector('#vd-mes').addEventListener('change', (e) => { mes = e.target.value; pintar(); });
    pintar();
    d.querySelector('#f-vd').addEventListener('submit', (e) => {
      e.preventDefault();
      const tipo = d.querySelector('#vd-tipo').value;
      const dias = [...d.querySelectorAll('#vd-dias input:checked')].map((x) => Number(x.value));
      if (!dias.length) { toast('Toca al menos un día.', { error: true }); return; }
      // Aquí se quiere añadir una por día seleccionado, aunque ya hubiera otra ese día
      S.actualizar((s) => { for (const dia of dias) s.actividades.push({ id: S.nuevoId(), tipo, fecha: `${mes}-${String(dia).padStart(2, '0')}`, hora: '', estado: 'hecha', pasada: true, formato: tipo === 'tutoria_caso' ? 'zoom' : 'presencial', temas: [] }); });
      cerrarModal(); toast(`Añadidas ${dias.length} · ${TIPOS[tipo].nombre.toLowerCase()} de ${nombreMes(mes).toLowerCase()}.`); render();
    });
  });
}

function confirmar(textoTitulo, texto, boton, alAceptar) {
  abrirModal(`<h2>${esc(textoTitulo)}</h2><p class="suave" style="line-height:1.5">${esc(texto)}</p>
  <div class="botones"><button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="b-ok">${esc(boton)}</button></div>`, (d) => {
    d.querySelector('#b-ok').addEventListener('click', () => { cerrarModal(); alAceptar(); });
  });
}

// ======================= Vistas =======================

// ---------- Inicio ----------
function tarjetaHoy(a) {
  const hecha = a.estado === 'hecha';
  const botones = hecha
    ? `<span class="insignia ok">${icon('check', 14)}&nbsp;Registrada</span><a href="${rutaVer(a)}" class="btn">Ver</a>`
    : esSesion(a)
      ? `<button class="btn" data-act="no-asistir" data-id="${esc(a.id)}">No puedo asistir</button><a href="${rutaForm(a)}" class="btn primario">Completar</a>`
      : `<button class="btn" data-act="notas" data-id="${esc(a.id)}">${icon('doc', 16)}${a.notasDocId ? 'Ver notas' : 'Abrir notas'}</button><a href="${rutaForm(a)}" class="btn primario">Completar</a>`;
  const sub = esSesion(a) ? (a.formato === 'online' ? 'online' : 'presencial') : a.tipo === 'tutoria_caso' ? 'Zoom' : '';
  return `<div class="tarjeta"><div class="fila-entre" style="align-items:flex-start">
    <span class="item-texto"><span class="tipo c-${color(a)}">${esc(nombreTipo(a))}${sub ? ' · ' + sub : ''}</span><span style="font-size:16px;font-weight:700">${esc(esSesion(a) ? `${casoApp(a)} · sesión ${S.numeroSesion(a)}` : a.tipo === 'tutoria_caso' ? titulo(a) : a.titulo || titulo(a))}</span></span>
    <span style="font-size:15px;font-weight:700">${esc(a.hora || '')}</span></div>
    <div class="botones" style="align-items:center">${botones}</div></div>`;
}

function pendientes() {
  const s = S.datos(); const hoy = hoyISO(); const lista = [];
  if (s.horasPrevias.length) lista.push({ ic: 'reloj', c: 'ambar', t: 'Tienes totales antiguos sin día', s: 'Ya no cuentan: añade esas actividades con su día en Ajustes', h: '#/ajustes' });
  for (const a of s.actividades.filter((x) => x.estado === 'programada' && x.fecha < hoy && x.fecha >= sumarDias(hoy, -45)).sort(porFechaHora)) {
    lista.push({ ic: 'reloj', c: 'ambar', t: `¿Completas ${a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario' ? 'la ficha de ' : ''}${titulo(a)}?`, s: fmtFecha(a.fecha) + ' · sin registrar', h: rutaForm(a) });
  }
  for (const a of S.hechas().filter((x) => esSesion(x) && !x.pasada && x.caso)) {
    if (!a.docId) lista.push({ ic: 'doc', c: 'ambar', t: 'Crear diario crítico', s: `${casoApp(a)} · ${fmtCorta(a.fecha)}`, h: `#/caso/${encodeURIComponent(a.caso.trim())}` });
    else if (!a.enviado && !a.noEnviar) lista.push({ ic: 'correo', c: 'ambar', t: 'Enviar diario crítico al terapeuta', s: `${casoApp(a)} · ${nombreTipo(a).toLowerCase()} del ${fmtCorta(a.fecha)}`, h: `#/caso/${encodeURIComponent(a.caso.trim())}` });
  }
  for (const a of S.hechas().filter((x) => x.tipo === 'tutoria_metodologica' && x.tarea?.docId && !x.tarea?.enviada)) {
    lista.push({ ic: 'birrete', c: 'morado', t: `Enviar la tarea de la T. metodológica ${a.numero}`, s: a.titulo, h: rutaForm(a) });
  }
  const d = new Date(); const dia = d.getDate();
  const mesPrev = hoyISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
  if (dia <= 10 && S.hechas().some((a) => a.fecha.startsWith(mesPrev)) && !s.informes[mesPrev]?.enviado) {
    lista.push({ ic: 'hoja', c: 'primario', t: `Hoja de horas de ${nombreMes(mesPrev).split(' ')[0].toLowerCase()} lista`, s: 'Revísala y envíala a Luria', h: `#/exportar?mes=${mesPrev}` });
  }
  return lista;
}

function vInicio() {
  const s = S.datos(); const hoy = hoyISO();
  const deHoy = s.actividades.filter((a) => a.fecha === hoy && a.estado !== 'cancelada').sort(porFechaHora);
  const pend = pendientes();
  const c = S.conteos(); const total = S.totalHoras(); const obj = Number(s.ajustes.objetivoHoras) || 450;
  const tmHechas = c.tutoria_metodologica; const semHechas = c.seminario;
  const plan = S.planSesiones();
  const banda = G.configurado() && !G.conectado()
    ? `<section class="banda"><b>${G.conectadoAntes() ? 'Vuelve a conectar con Google' : 'Conecta tu cuenta de Google'}</b><p>${hayPendiente() ? '<b>Tienes cambios que aún no están guardados en tu Drive.</b> ' : ''}Así tus registros quedan guardados en tu Drive y no se pierden si cambias de móvil o borras la app. La app no tiene acceso a tu correo.</p><button class="btn" data-act="conectar">Conectar con Google</button></section>`
    : !G.configurado() ? `<div class="aviso-caja">${icon('candado', 18)}<span>Modo prueba: tus datos se guardan solo en este dispositivo.</span></div>` : '';
  const empezar = !s.ajustes.nombre || !s.ajustes.plantillaHorasNombre
    ? `<a href="#/ajustes" class="item">${'<span class="icono-caja bg-primario">' + icon('ajustes', 20) + '</span>'}<span class="item-texto"><span class="item-titulo">Termina de configurar la app</span><span class="item-sub">${!s.ajustes.nombre ? 'Tu nombre' : ''}${!s.ajustes.nombre && !s.ajustes.plantillaHorasNombre ? ' y ' : ''}${!s.ajustes.plantillaHorasNombre ? 'la plantilla de horas de Luria' : ''}</span></span></a>` : '';
  return {
    html: `<div class="pantalla">
    <header class="cabecera">
      <div>${logoURL ? `<img src="${logoURL}" alt="Luria Lab" class="logo-centro">` : '<span class="marca">Luria Lab</span>'}<p class="suave" style="font-size:14px">${esc(fmtFecha(hoy))}</p><h1 class="titulo">Hola${primerNombre() ? ', ' + esc(primerNombre()) : ''}</h1></div>
      <div style="display:flex;gap:8px"><a href="#/exportar" class="icono-btn" aria-label="Exportar y entregas">${icon('descargar')}</a><a href="#/ajustes" class="icono-btn" aria-label="Ajustes">${icon('ajustes')}</a></div>
    </header>
    ${banda}${empezar}
    <section class="seccion"><div class="fila-entre"><h2 class="seccion-titulo">Hoy</h2><a href="#/agenda" style="font-size:14px;font-weight:700;padding:8px 0">Ver agenda</a></div>
      ${deHoy.length ? deHoy.map(tarjetaHoy).join('') : `<div class="tarjeta"><p class="suave pequeno">No tienes nada planificado para hoy.</p></div>`}
    </section>
    ${pend.length ? `<section class="seccion"><h2 class="seccion-titulo">Pendiente</h2>${pend.slice(0, 6).map((p) => `<a href="${p.h}" class="item"><span class="icono-caja bg-${p.c}">${icon(p.ic, 20)}</span><span class="item-texto"><span class="item-titulo">${esc(p.t)}</span><span class="item-sub">${esc(p.s)}</span></span></a>`).join('')}</section>` : ''}
    <section class="tarjeta">
      <div class="fila-entre"><span class="pequeno suave" style="font-weight:600;font-size:14px">Horas de prácticas</span><a href="#/ajustes" class="pequeno" style="font-weight:600">Tu objetivo: ${obj} h · cambiar</a></div>
      <div style="display:flex;align-items:baseline;gap:6px"><span class="horas-num">${total}</span><span class="suave">h computables</span></div>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="${obj}" aria-valuenow="${total}" aria-label="Progreso de horas"><div style="width:${Math.min(100, (total / obj) * 100).toFixed(1)}%"></div></div>
      <div class="faltan">
        <span class="faltan-num">${plan.faltan}</span>
        <span class="item-texto"><span style="font-size:15px;font-weight:700">espejos o coterapias te faltan</span><span class="mini suave" style="line-height:1.4">para llegar a ${obj} h, contando las tutorías y seminarios previstos.${plan.planificadas ? ` Tienes ${plan.planificadas} en la agenda.` : ''}</span></span>
      </div>
      <div class="rejilla">
        <div class="celda"><b>${c.espejo}</b><span class="mini suave">Espejos</span></div>
        <div class="celda"><b>${c.coterapia}</b><span class="mini suave">Coterapias</span></div>
      </div>
      <div class="rejilla tres">
        <div class="celda"><b>${c.tutoria_caso} / ${s.ajustes.tcPrevistas}</b><span class="mini suave">Tutorías de caso</span></div>
        <div class="celda"><b>${tmHechas} / ${plan.tm}</b><span class="mini suave">Tutorías metodológicas</span></div>
        <div class="celda"><b>${semHechas} / ${plan.sem}</b><span class="mini suave">Seminarios</span></div>
      </div>
    </section>
    </div>${fab()}${nav('inicio')}`,
  };
}

// ---------- Agenda ----------
let vistaAgenda = 'semana'; let semanaOffset = 0;
const lunesDe = (iso) => { const d = new Date(iso + 'T12:00:00'); const w = (d.getDay() + 6) % 7; return sumarDias(iso, -w); };
function itemAgenda(a, conFecha) {
  const lugar = esSesion(a) ? (a.formato === 'online' ? 'online' : 'presencial') : a.tipo === 'tutoria_metodologica' ? '10-14 h' : a.tipo === 'seminario' ? '2 h' : a.tipo === 'tutoria_caso' ? 'Zoom' : '';
  const nombre = esSesion(a) ? `${nombreTipo(a)} · ${casoApp(a)}` : a.tipo === 'tutoria_metodologica' ? `T. metodológica${a.numero ? ' ' + a.numero : ''}` : a.tipo === 'seminario' ? `Seminario${a.numero ? ' ' + a.numero : ''}` : titulo(a);
  const sub = [conFecha ? fmtCorta(a.fecha) : '', a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario' ? a.titulo : '', lugar].filter(Boolean).join(' · ');
  const estado = a.estado === 'hecha' ? '<span class="insignia ok">Hecha</span>' : a.estado === 'cancelada' ? '<span class="insignia">No asistí</span>' : (a.tipo === 'tutoria_metodologica' && REVISIONES_PDP.includes(a.numero) ? '<span class="insignia">Revisión PDP</span>' : '');
  return `<a href="${a.estado === 'hecha' ? rutaVer(a) : rutaForm(a)}" class="item agenda-item ${a.estado === 'cancelada' ? 'cancelada' : ''}"><span class="agenda-hora">${esc(a.hora || '—')}</span><span class="dot ${color(a)}"></span><span class="item-texto"><span class="item-titulo">${esc(nombre)}</span>${sub ? `<span class="item-sub">${esc(sub)}</span>` : ''}</span>${estado}</a>`;
}
function vAgenda() {
  const s = S.datos(); const hoy = hoyISO();
  let cuerpo = '';
  if (vistaAgenda === 'semana') {
    const lunes = sumarDias(lunesDe(hoy), 7 * semanaOffset);
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
    const deDia = (d) => s.actividades.filter((a) => a.fecha === d).sort(porFechaHora);
    const tira = dias.map((d) => { const n = deDia(d).filter((a) => a.estado !== 'cancelada').length; return `<button type="button" class="tira-dia ${d === hoy ? 'hoy' : ''}" data-act="ir-dia" data-d="${d}" aria-label="${esc(fmtFecha(d))}"><span>${'LMXJVSD'[dias.indexOf(d)]}</span><b>${Number(d.slice(8))}</b><i>${'•'.repeat(Math.min(n, 3)) || '&nbsp;'}</i></button>`; }).join('');
    const rango = `${fmtCorta(dias[0])} – ${fmtCorta(dias[6])}`;
    cuerpo = `<div class="fila-entre"><button class="icono-btn" data-act="semana" data-d="-1" aria-label="Semana anterior">${icon('atras', 20)}</button>
      <span style="text-align:center"><b style="font-size:16px">${semanaOffset === 0 ? 'Esta semana' : semanaOffset === 1 ? 'Semana que viene' : semanaOffset === -1 ? 'Semana pasada' : esc(rango)}</b><br><span class="mini suave">${esc(rango)}</span></span>
      <button class="icono-btn" data-act="semana" data-d="1" aria-label="Semana siguiente">${icon('sig', 20)}</button></div>
      <div class="tira">${tira}</div>
      ${semanaOffset !== 0 ? '<button class="btn texto pequeno" data-act="semana" data-d="0" style="align-self:center">Volver a hoy</button>' : ''}
      ${dias.map((d) => { const acts = deDia(d); return `<section class="seccion dia-bloque ${d === hoy ? 'hoy' : ''}" id="dia-${d}"><h2 class="etiqueta-grupo">${d === hoy ? 'Hoy · ' : ''}${esc(fmtFecha(d))}</h2>${acts.length ? acts.map((a) => itemAgenda(a)).join('') : '<p class="mini suave" style="padding:2px 4px 6px">Nada planificado</p>'}</section>`; }).join('')}`;
  } else {
    const proximas = s.actividades.filter((a) => a.estado === 'programada' && a.fecha >= hoy).sort(porFechaHora);
    let diaActual = '';
    for (const a of proximas) {
      if (a.fecha !== diaActual) { diaActual = a.fecha; cuerpo += `<h2 class="etiqueta-grupo">${a.fecha === hoy ? 'Hoy · ' : ''}${esc(fmtFecha(a.fecha))}</h2>`; }
      cuerpo += itemAgenda(a);
    }
    cuerpo = cuerpo || '<p class="vacio">No hay nada planificado.</p>';
  }
  return {
    html: `<div class="pantalla sin-nav">${volver('#/inicio', 'Agenda')}
    <div class="segmentado" role="tablist"><button class="seg-btn ${vistaAgenda === 'semana' ? 'activo' : ''}" data-act="vista-agenda" data-v="semana" role="tab" aria-selected="${vistaAgenda === 'semana'}">Semana</button><button class="seg-btn ${vistaAgenda === 'lista' ? 'activo' : ''}" data-act="vista-agenda" data-v="lista" role="tab" aria-selected="${vistaAgenda === 'lista'}">Próximas</button></div>
    <div class="botones"><button class="btn linea" data-act="add-tc">${icon('mas', 18)}T. de caso</button><button class="btn linea" data-act="add-sesion">${icon('mas', 18)}Espejo / coterapia</button></div>
    ${cuerpo}</div>`,
  };
}

// ---------- Nueva entrada ----------
function vNueva() {
  const op = (href, ic, c, t, s, extra = '') => `<a href="${href}" class="item" ${extra}><span class="icono-caja bg-${c}" style="width:44px;height:44px">${icon(ic)}</span><span class="item-texto"><span style="font-size:17px;font-weight:700">${t}</span><span class="item-sub">${s}</span></span></a>`;
  return {
    html: `<div class="pantalla sin-nav">
    <header class="cabecera"><a href="#/inicio" style="font-weight:600;padding:10px 0">Cancelar</a></header>
    <h1 class="titulo">¿Qué acabas de hacer?</h1>
    <p class="suave pequeno" style="margin-top:-8px">Para lo imprevisto. Lo que tienes planificado aparece en Inicio, en «Hoy».</p>
    <div class="seccion">
      ${op('#/sesion/nuevo:espejo', 'ojo', 'verde', 'Espejo', 'Crea tu diario crítico en Google Docs')}
      ${op('#/sesion/nuevo:coterapia', 'dos', 'verde', 'Coterapia', 'Crea tu diario crítico en Google Docs')}
      ${op('#/tc/nuevo', 'bocadillo', 'azul', 'Tutoría de caso', 'Una pregunta · 1 minuto')}
      ${op('#/elegir/tutoria_metodologica', 'birrete', 'morado', 'Tutoría metodológica', 'Su ficha de apuntes ya está creada')}
      ${op('#/elegir/seminario', 'pantalla', 'ambar', 'Seminario', 'Su ficha de apuntes ya está creada')}
      ${op('#/practica/nuevo', 'pdp', 'gris', 'Práctica de mi PDP', 'Role play, lectura, ejercicio en mí')}
    </div></div>`,
  };
}

function vElegir(tipo) {
  const lista = S.datos().actividades.filter((a) => a.tipo === tipo).sort(porFechaHora);
  const hoy = hoyISO();
  return {
    html: `<div class="pantalla sin-nav">${volver('#/nueva', tipo === 'seminario' ? 'Seminarios' : 'Tutorías metodológicas')}
    <div class="seccion">${lista.map((a) => `<a href="${rutaForm(a)}" class="item"><span class="dot ${color(a)}"></span><span class="item-texto"><span class="item-titulo">${a.numero} · ${esc(a.titulo)}</span><span class="item-sub">${esc(fmtFecha(a.fecha))}</span></span>${a.estado === 'hecha' ? '<span class="insignia ok">Hecha</span>' : a.estado === 'cancelada' ? '<span class="insignia">No asistí</span>' : a.fecha <= hoy ? '<span class="insignia aviso">Completar</span>' : ''}</a>`).join('')}</div></div>`,
  };
}

// ---------- Espejo / coterapia ----------
const borradores = {};
function vSesion(id) {
  const nuevo = id.startsWith('nuevo:');
  const a = nuevo ? (borradores[id] = borradores[id] || { id: S.nuevoId(), tipo: id.split(':')[1] || 'espejo', fecha: hoyISO(), hora: '', formato: 'presencial', estado: 'nueva' }) : S.actividad(id);
  if (!a) return vNoEncontrado();
  const hoy = hoyISO(); const horas = S.horasDe(a);
  const casos = [...S.casos().keys()];
  const futura = a.fecha > hoy;
  return {
    html: `<div class="pantalla sin-nav">${volver(nuevo ? '#/nueva' : '#/inicio', nuevo ? 'Nueva sesión' : a.estado === 'hecha' ? 'Editar sesión' : 'Completar sesión')}
    <form id="f-sesion" class="seccion" novalidate>
      ${seg('tipo', [['espejo', 'Espejo'], ['coterapia', 'Coterapia']], a.tipo)}
      ${seg('formato', [['presencial', 'Presencial'], ['online', 'Online (Teams)']], a.formato || 'presencial')}
      <div class="campo"><label for="caso">Código de caso</label><input type="text" id="caso" name="caso" list="l-casos" required value="${esc(a.caso)}" placeholder="p. ej. 07" autocomplete="off"><datalist id="l-casos">${casos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <span class="ayuda">Nunca nombres ni iniciales. Las sesiones del mismo código se agrupan.</span></div>
      <div class="dos-col">
        <div class="campo"><label for="fecha">Fecha</label><input type="date" id="fecha" name="fecha" required value="${esc(a.fecha)}"></div>
        <div class="campo"><label for="hora">Hora</label><input type="time" id="hora" name="hora" value="${esc(a.hora)}"></div>
      </div>
      <p class="pequeno suave">Duración: 1 h · cuenta ${horas} h en tu registro</p>
      <div class="campo"><label for="ter">Terapeuta</label><select id="ter" name="terapeutaId" data-terapeuta>${opcionesTerapeuta(a.terapeutaId)}</select></div>
      <div class="campo"><label for="notas">Notas en caliente <span class="suave" style="font-weight:400">(2-3 líneas)</span></label><textarea id="notas" name="notasCaliente" rows="3" placeholder="Lo que no quieres olvidar antes de escribir el diario…">${esc(a.notasCaliente)}</textarea>
        <span class="ayuda">Se copian en tu diario crítico.</span></div>
      <div class="aviso-caja">${icon('candado', 18)}<span>Escribe para aprender, no para identificar: evita profesión, barrio, fechas o hechos muy concretos del paciente.</span></div>
      ${a.docId ? `<div class="botones"><a class="btn" href="${G.enlaceDoc(a.docId)}" target="_blank" rel="noopener">${icon('doc', 16)}Abrir diario</a><a class="btn" href="#/caso/${encodeURIComponent((a.caso || '').trim())}">Ver caso</a></div>` : ''}
      <div class="seccion" style="margin-top:6px">
        ${!a.docId && G.configurado() && !futura ? `<button class="btn primario grande" name="accion" value="doc">${icon('doc', 20)}Guardar y crear diario crítico</button><button class="btn grande" name="accion" value="guardar">Guardar sin crear documento</button>` : `<button class="btn primario grande" name="accion" value="guardar">${futura ? 'Guardar en la agenda' : 'Guardar'}</button>`}
        ${!nuevo && a.estado === 'programada' ? `<button type="button" class="btn" data-act="no-asistir" data-id="${esc(a.id)}">No puedo asistir</button>` : ''}
        ${!nuevo ? `<button type="button" class="btn peligro" id="b-borrar">${icon('papelera', 18)}Eliminar</button>` : ''}
      </div>
    </form></div>`,
    mount(r) {
      montarSelectorTerapeuta(r);
      const f = r.querySelector('#f-sesion');
      let accion = 'guardar';
      f.querySelectorAll('button[name=accion]').forEach((b) => b.addEventListener('click', () => { accion = b.value; }));
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = leerForm(f);
        if (!v.caso?.trim()) { toast('Pon un código de caso.', { error: true }); f.caso.focus(); return; }
        if (!v.fecha) { toast('Pon la fecha.', { error: true }); return; }
        Object.assign(a, { tipo: v.tipo, formato: v.formato, caso: v.caso.trim(), fecha: v.fecha, hora: v.hora, terapeutaId: v.terapeutaId && v.terapeutaId !== '__nuevo' ? v.terapeutaId : null, notasCaliente: v.notasCaliente.trim() });
        a.estado = a.fecha > hoyISO() ? 'programada' : 'hecha';
        S.actualizar((s) => { if (nuevo) { s.actividades.push(a); delete borradores[id]; } });
        const destino = a.estado === 'hecha' ? `#/caso/${encodeURIComponent(a.caso)}` : '#/agenda';
        if (accion === 'doc' && a.estado === 'hecha') {
          conCarga(f.querySelector('button[value=doc]'), async () => {
            const doc = await crearDiario(a.id);
            toast('Diario crítico creado con tu plantilla.', { enlace: G.enlaceDoc(doc), texto: 'Abrir', ms: 12000 });
            irA(destino);
          });
        } else { toast('Guardado.'); irA(destino); }
      });
      r.querySelector('#b-borrar')?.addEventListener('click', () => confirmar('¿Eliminar esta sesión?', a.docId ? 'Se borra de la app. El diario crítico seguirá en tu Drive.' : 'Se borra de la app.', 'Eliminar', () => {
        S.borrar([a.id]); toast('Sesión eliminada.'); irA('#/inicio');
      }));
    },
  };
}

// ---------- Tutoría de caso ----------
function vTC(id) {
  const nuevo = id === 'nuevo';
  const a = nuevo ? (borradores.tc = borradores.tc || { id: S.nuevoId(), tipo: 'tutoria_caso', fecha: hoyISO(), hora: '', estado: 'nueva', temas: [] }) : S.actividad(id);
  if (!a) return vNoEncontrado();
  return {
    html: `<div class="pantalla sin-nav">${volver(nuevo ? '#/nueva' : '#/inicio', 'Tutoría de caso')}
    <form id="f-tc" class="seccion">
      ${!nuevo ? `<button type="button" class="btn" data-act="notas" data-id="${esc(a.id)}">${icon('doc', 18)}${a.notasDocId ? 'Ver notas de la tutoría' : 'Abrir notas de la tutoría'}</button>` : ''}
      <div class="dos-col">
        <div class="campo"><label for="fecha">Fecha</label><input type="date" id="fecha" name="fecha" required value="${esc(a.fecha)}"></div>
        <div class="campo"><label for="hora">Hora</label><input type="time" id="hora" name="hora" value="${esc(a.hora)}"></div>
      </div>
      <div class="campo"><label for="ter">Terapeuta que presenta</label><select id="ter" name="terapeutaId" data-terapeuta>${opcionesTerapeuta(a.terapeutaId)}</select></div>
      <div class="tarjeta"><label for="apr" class="pregunta">¿Qué es lo más importante que he aprendido hoy?</label>
        <textarea id="apr" name="aprendizaje" rows="6" placeholder="Una idea, una pregunta que haría, algo que quiero practicar…" style="border:0;padding:0;min-height:120px">${esc(a.aprendizaje)}</textarea></div>
      <div class="campo"><span class="etiqueta">Tema <span class="suave" style="font-weight:400">(opcional)</span></span>
        <div class="chips">${TEMAS.map((t, i) => `<input type="checkbox" id="tema-${i}" name="temas" value="${esc(t)}" ${(a.temas || []).includes(t) ? 'checked' : ''}><label for="tema-${i}">${esc(t)}</label>`).join('')}</div></div>
      <button class="btn primario grande">Guardar</button>
      ${!nuevo ? `<button type="button" class="btn peligro" id="b-borrar">${icon('papelera', 18)}Eliminar</button>` : ''}
      <p class="mini suave" style="text-align:center">Cuenta ${S.horasDe(a)} h en tu registro</p>
    </form></div>`,
    mount(r) {
      montarSelectorTerapeuta(r);
      const f = r.querySelector('#f-tc');
      f.addEventListener('submit', (e) => {
        e.preventDefault(); const v = leerForm(f);
        Object.assign(a, { fecha: v.fecha, hora: v.hora, terapeutaId: v.terapeutaId && v.terapeutaId !== '__nuevo' ? v.terapeutaId : null, aprendizaje: (v.aprendizaje || '').trim(), temas: [].concat(v.temas || []) });
        a.estado = a.fecha > hoyISO() ? 'programada' : 'hecha';
        S.actualizar((s) => { if (nuevo) { s.actividades.push(a); delete borradores.tc; } });
        toast('Guardado.'); irA(a.estado === 'hecha' ? '#/diario' : '#/agenda');
      });
      r.querySelector('#b-borrar')?.addEventListener('click', () => confirmar('¿Eliminar esta tutoría de caso?', 'Se borra de la app.', 'Eliminar', () => {
        S.borrar([a.id]); irA('#/inicio');
      }));
    },
  };
}

// ---------- Ficha de tutoría metodológica / seminario ----------
function vFicha(id) {
  const a = S.actividad(id);
  if (!a) return vNoEncontrado();
  const tm = a.tipo === 'tutoria_metodologica';
  const f = a.ficha || {}; const t = a.tarea || {};
  const asistencia = a.estado === 'programada' ? (a.fecha <= hoyISO() ? 'hecha' : 'programada') : a.estado;
  const campo = (n, l, ph, filas = 3) => `<section class="tarjeta"><label for="${n}" class="tipo c-${color(a)}" style="font-size:13px">${l}</label><textarea id="${n}" name="${n}" rows="${filas}" placeholder="${ph}" style="border:0;padding:0">${esc(f[n])}</textarea></section>`;
  return {
    html: `<div class="pantalla sin-nav">${volver('#/inicio', tm ? 'Tutoría metodológica' : 'Seminario')}
    <div class="item-texto"><span class="pequeno c-${color(a)}" style="font-weight:700">${tm ? 'Tutoría metodológica' : 'Seminario'} ${a.numero} · ${esc(fmtCorta(a.fecha))} · ${S.horasDe(a)} h</span>
      <h1 class="titulo">${esc(a.titulo)}</h1>
      ${tm && REVISIONES_PDP.includes(a.numero) ? '<span class="insignias"><span class="insignia">Revisión de tu PDP</span></span>' : ''}
      ${!tm ? '<span class="pequeno suave">Incluye taller experiencial</span>' : ''}</div>
    <button type="button" class="btn" data-act="notas" data-id="${esc(a.id)}">${icon('doc', 18)}${a.notasDocId ? 'Ver notas de la sesión' : 'Abrir notas de la sesión'}</button>
    <form id="f-ficha" class="seccion">
      <div class="campo"><span class="etiqueta">Asistencia</span>${seg('estado', [['hecha', 'Asistí'], ['cancelada', 'No asistí'], ['programada', 'Pendiente']], asistencia)}</div>
      ${campo('idea', 'Idea clave', 'Lo esencial de la sesión, en dos o tres líneas')}
      ${campo('guia', 'Guía o esquema', 'Los pasos o el esquema que os dieron', 5)}
      ${campo('aplica', 'Cómo lo aplico', 'Qué haré distinto en la próxima sesión o role play')}
      ${campo('dudas', 'Dudas para preguntar', 'Toca para añadir', 2)}
      ${tm ? `<section class="tarjeta"><div class="fila-entre"><span class="tipo c-morado" style="font-size:13px">Tarea de la tutoría</span>${t.enviada ? '<span class="insignia ok">Enviada</span>' : t.docId ? '<span class="insignia aviso">Sin enviar</span>' : ''}</div>
        <textarea name="tareaTexto" rows="2" placeholder="Qué pidió el profesor y para cuándo" style="border:0;padding:0">${esc(t.texto)}</textarea>
        <div class="botones">${t.docId ? `<a class="btn" href="${G.enlaceDoc(t.docId)}" target="_blank" rel="noopener" style="grid-column:span 2">${icon('externo', 16)}Abrir Doc de la tarea</a>` : `<button type="button" class="btn" id="b-crear-tarea" style="grid-column:span 2">${icon('doc', 16)}Crear Doc de la tarea</button>`}</div>
        <label class="pequeno" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="tareaEnviada" value="1" ${t.enviada ? 'checked' : ''}> Ya la he enviado</label></section>` : ''}
      <button class="btn primario grande">Guardar</button>
    </form></div>`,
    mount(r) {
      const form = r.querySelector('#f-ficha');
      const guardarFicha = () => {
        const v = leerForm(form);
        S.actualizar(() => {
          a.estado = v.estado; a.ficha = { idea: v.idea.trim(), guia: v.guia.trim(), aplica: v.aplica.trim(), dudas: v.dudas.trim() };
          if (tm) a.tarea = { ...(a.tarea || {}), texto: (v.tareaTexto || '').trim(), enviada: Boolean(v.tareaEnviada) };
        });
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); guardarFicha(); toast('Ficha guardada.'); irA('#/inicio'); });
      r.querySelector('#b-crear-tarea')?.addEventListener('click', (e) => conCarga(e.currentTarget, async () => {
        guardarFicha(); await google();
        const dir = await G.carpeta([RAIZ, 'Tareas'], S.datos().ajustes.carpetas);
        const doc = await G.docDesdeHtml(`Tarea · T. metodológica ${a.numero} · ${a.titulo}`, D.documentoTarea(`T. metodológica ${a.numero} · ${a.titulo}`, a.fecha, a.tarea.texto), dir);
        S.actualizar(() => { a.tarea.docId = doc; });
        toast('Doc de la tarea creado.', { enlace: G.enlaceDoc(doc), ms: 12000 }); render();
      }));
    },
  };
}

// ---------- Práctica del PDP ----------
function vPractica(id) {
  const nuevo = id === 'nuevo';
  const a = nuevo ? (borradores.pr = borradores.pr || { id: S.nuevoId(), tipo: 'practica_pdp', fecha: hoyISO(), estado: 'nueva' }) : S.actividad(id);
  if (!a) return vNoEncontrado();
  return {
    html: `<div class="pantalla sin-nav">${volver(nuevo ? '#/nueva' : '#/diario', 'Práctica de mi PDP')}
    <form id="f-pr" class="seccion">
      ${!nuevo ? `<button type="button" class="btn" data-act="notas" data-id="${esc(a.id)}">${icon('doc', 18)}${a.notasDocId ? 'Ver notas' : 'Abrir notas'}</button>` : ''}
      <div class="campo"><label for="pt">¿Qué has practicado?</label><input type="text" id="pt" name="titulo" required value="${esc(a.titulo)}" placeholder="p. ej. Role play de entrevista inicial"></div>
      <div class="campo"><label for="pf">Fecha</label><input type="date" id="pf" name="fecha" required value="${esc(a.fecha)}"></div>
      <div class="campo"><label for="pd">Cómo ha ido</label><textarea id="pd" name="descripcion" rows="5">${esc(a.descripcion)}</textarea></div>
      <button class="btn primario grande">Guardar</button>
      ${!nuevo ? `<button type="button" class="btn peligro" id="b-borrar">${icon('papelera', 18)}Eliminar</button>` : ''}
    </form></div>`,
    mount(r) {
      const f = r.querySelector('#f-pr');
      f.addEventListener('submit', (e) => {
        e.preventDefault(); const v = leerForm(f);
        Object.assign(a, { titulo: v.titulo.trim(), fecha: v.fecha, descripcion: v.descripcion.trim(), estado: 'hecha' });
        S.actualizar((s) => { if (nuevo) { s.actividades.push(a); delete borradores.pr; } });
        toast('Guardado.'); irA('#/diario');
      });
      r.querySelector('#b-borrar')?.addEventListener('click', () => confirmar('¿Eliminar esta práctica?', 'Se borra de la app.', 'Eliminar', () => {
        S.borrar([a.id]); irA('#/diario');
      }));
    },
  };
}

// ---------- Diario ----------
let filtroDiario = { q: '', tipo: 'todo', archivadas: false };
// Entradas anteriores a la app que no tienen nada escrito
const sinContenido = (a) => a.pasada && !a.docId && !a.aprendizaje && !a.notasCaliente && !a.feedback?.length && !Object.values(a.ficha || {}).some(Boolean);

function archivar(ids, valor) {
  S.actualizar((s) => { for (const a of s.actividades) if (ids.includes(a.id)) a.archivada = valor; });
  render();
  toast(valor ? (ids.length === 1 ? 'Entrada archivada. Sigue contando en tus horas.' : `${ids.length} entradas archivadas. Siguen contando en tus horas.`) : 'Entrada recuperada.', {
    texto: 'Deshacer', ms: 7000,
    alPulsar: () => { S.actualizar((s) => { for (const a of s.actividades) if (ids.includes(a.id)) a.archivada = !valor; }); render(); },
  });
}

// Deslizar a la izquierda para archivar (como en el correo)
function montarDeslizar(raiz) {
  raiz.querySelectorAll('.deslizable').forEach((cont) => {
    const el = cont.querySelector('.item');
    let x0 = 0, y0 = 0, dx = 0, activo = false, horizontal = null, movido = false;
    el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; dx = 0; activo = true; horizontal = null; movido = false; });
    el.addEventListener('pointermove', (e) => {
      if (!activo) return;
      const mx = e.clientX - x0; const my = e.clientY - y0;
      if (horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { horizontal = Math.abs(mx) > Math.abs(my); if (horizontal) el.setPointerCapture(e.pointerId); }
      if (!horizontal) return;
      dx = Math.min(0, mx); movido = Math.abs(dx) > 8;
      el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`;
      cont.classList.toggle('listo', dx < -90);
    });
    const soltar = () => {
      if (!activo) return; activo = false;
      el.style.transition = 'transform .2s ease';
      if (dx < -90) {
        el.style.transform = 'translateX(-110%)';
        setTimeout(() => archivar([cont.dataset.id], !filtroDiario.archivadas), 180);
      } else { el.style.transform = ''; cont.classList.remove('listo'); }
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
    el.addEventListener('click', (e) => { if (movido) { e.preventDefault(); e.stopPropagation(); movido = false; } }, true);
  });
}

function vDiario() {
  const grupos = { todo: null, casos: ['espejo', 'coterapia'], tc: ['tutoria_caso'], formacion: ['tutoria_metodologica', 'seminario'], pdp: ['practica_pdp'] };
  const q = filtroDiario.q.toLowerCase();
  const verArch = filtroDiario.archivadas;
  const nArchivadas = S.hechas().filter((a) => a.archivada).length;
  const vacias = S.hechas().filter((a) => !a.archivada && sinContenido(a));
  const lista = S.hechas().filter((a) => Boolean(a.archivada) === verArch)
    .filter((a) => !grupos[filtroDiario.tipo] || grupos[filtroDiario.tipo].includes(a.tipo))
    .filter((a) => !q || [titulo(a), a.caso, a.aprendizaje, a.notasCaliente, a.descripcion, ...(a.temas || []), ...Object.values(a.ficha || {})].join(' ').toLowerCase().includes(q))
    .sort((x, y) => porFechaHora(y, x));
  let html = ''; let mes = '';
  for (const a of lista) {
    const m = a.fecha.slice(0, 7);
    if (m !== mes) { mes = m; html += `<h2 class="etiqueta-grupo">${esc(nombreMes(m))}</h2>`; }
    let detalle = '';
    if (esSesion(a) && a.pasada && !a.docId) detalle = '<span class="insignias"><span class="insignia">Anterior a la app</span></span>';
    else if (esSesion(a)) detalle = `<span class="insignias">${!a.docId ? '<span class="insignia aviso">Sin diario crítico</span>' : a.enviado ? '<span class="insignia ok">Enviado</span>' : a.noEnviar ? '<span class="insignia">No se envía</span>' : '<span class="insignia aviso">Sin enviar al terapeuta</span>'}${a.feedback?.length ? '<span class="insignia ok">Feedback recibido</span>' : ''}</span>`;
    else if (a.tipo === 'tutoria_caso') detalle = `<span class="texto-largo" style="font-size:14px;color:#2A332E">${a.aprendizaje ? '«' + esc(a.aprendizaje.slice(0, 160)) + (a.aprendizaje.length > 160 ? '…' : '') + '»' : '<span class="suave">Sin aprendizaje anotado</span>'}</span>${a.temas?.length ? `<span class="insignias">${a.temas.map((t) => `<span class="insignia">${esc(t)}</span>`).join('')}</span>` : ''}`;
    else if (a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario') {
      const n = ['idea', 'guia', 'aplica', 'dudas'].filter((k) => a.ficha?.[k]).length;
      detalle = `<span class="insignias"><span class="insignia">Ficha · ${n} de 4 apartados</span>${a.tipo === 'tutoria_metodologica' && a.tarea?.docId && !a.tarea?.enviada ? '<span class="insignia aviso">Tarea sin enviar</span>' : ''}</span>`;
    } else detalle = a.descripcion ? `<span class="item-sub">${esc(a.descripcion.slice(0, 120))}</span>` : '';
    const etiqueta = esSesion(a) ? `${nombreTipo(a)} · ${casoApp(a)}` : (a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario') ? `${nombreTipo(a)}${a.numero ? ' ' + a.numero : ''}` : nombreTipo(a);
    html += `<div class="deslizable" data-id="${esc(a.id)}"><span class="fondo-archivar" aria-hidden="true">${icon(verArch ? 'diario' : 'papelera', 20)}${verArch ? 'Recuperar' : 'Archivar'}</span>
      <a href="${rutaVer(a)}" class="item" style="flex-direction:column;align-items:stretch;gap:8px"><span class="fila-entre"><span class="tipo c-${color(a)}">${esc(etiqueta)}</span><span class="pequeno suave">${esc(fmtCorta(a.fecha))} · ${S.horasDe(a)} h</span></span>
      ${a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario' || a.tipo === 'practica_pdp' ? `<span class="item-titulo">${esc(a.titulo)}</span>` : ''}${detalle}</a>
      <button class="btn texto pequeno archivar-btn" data-act="archivar" data-id="${esc(a.id)}">${verArch ? 'Recuperar' : 'Archivar'}</button></div>`;
  }
  const chip = (k, t) => `<button class="chip ${filtroDiario.tipo === k ? 'oscuro' : ''}" data-act="filtro" data-tipo="${k}" aria-pressed="${filtroDiario.tipo === k}">${t}</button>`;
  return {
    html: `<div class="pantalla"><div class="fila-entre"><h1 class="titulo">${verArch ? 'Archivadas' : 'Diario'}</h1>${verArch ? '<button class="btn texto" data-act="ver-archivadas">Volver al diario</button>' : nArchivadas ? `<button class="btn texto pequeno" data-act="ver-archivadas">Archivadas (${nArchivadas})</button>` : ''}</div>
    <div class="campo"><label for="buscar" class="oculto">Buscar</label><input type="search" id="buscar" placeholder="Buscar en tus entradas" value="${esc(filtroDiario.q)}"></div>
    <div class="chips">${chip('todo', 'Todo')}${chip('casos', 'Casos')}${chip('tc', 'T. de caso')}${chip('formacion', 'Formación')}${chip('pdp', 'PDP')}</div>
    ${!verArch && vacias.length > 1 ? `<div class="aviso-caja" style="align-items:center">${icon('reloj', 18)}<span style="flex:1">Tienes ${vacias.length} entradas anteriores a la app sin nada escrito.</span><button class="btn pequeno" data-act="archivar-vacias">Archivarlas</button></div>` : ''}
    ${lista.length ? `<p class="mini suave" style="margin-top:-4px">${verArch ? 'Desliza a la izquierda para recuperar una entrada.' : 'Desliza una entrada a la izquierda para archivarla. Seguirá contando en tus horas y en la hoja de Luria.'}</p>` : ''}
    <div class="seccion" id="lista-diario">${html || `<p class="vacio">${verArch ? 'No tienes entradas archivadas.' : 'Aún no hay entradas. Lo que registres aparecerá aquí.'}</p>`}</div>
    </div>${fab(true)}${nav('diario')}`,
    mount(r) {
      montarDeslizar(r);
      const b = r.querySelector('#buscar');
      b.addEventListener('input', () => { filtroDiario.q = b.value; const pos = b.selectionStart; render(); const nb = app.querySelector('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos); });
    },
  };
}

// ---------- Caso ----------
function vCaso(codigo) {
  codigo = decodeURIComponent(codigo);
  const ss = S.sesionesDeCaso(codigo);
  if (!ss.length) return vNoEncontrado();
  const ultima = ss.filter((x) => x.terapeutaId).at(-1);
  const hechasC = ss.filter((x) => x.estado === 'hecha');
  const tarjetas = [...ss].reverse().map((a) => {
    const n = S.numeroSesion(a);
    if (a.estado !== 'hecha') return `<a href="${rutaForm(a)}" class="item"><span class="item-texto"><span class="item-titulo">Sesión ${n} · ${esc(nombreTipo(a))}</span><span class="item-sub">${esc(fmtFecha(a.fecha))} · planificada</span></span>${icon('sig', 18)}</a>`;
    const paso = (ok, pend, t) => `<span class="paso ${ok ? 'hecho' : pend ? 'pendiente' : ''}"><i>${ok ? icon('check', 14) : ''}</i>${t}</span>`;
    const botones = !a.docId
      ? `<button class="btn primario" data-act="crear-diario" data-id="${esc(a.id)}" style="grid-column:span 2">${icon('doc', 16)}Crear diario crítico</button>`
      : `<a class="btn" href="${G.enlaceDoc(a.docId)}" target="_blank" rel="noopener" style="grid-column:span 2">${icon('externo', 16)}Abrir diario crítico</a>${a.noEnviar ? '' : !a.enviado
        ? `<button class="btn primario" data-act="marcar-enviado" data-id="${esc(a.id)}" style="grid-column:span 2">${icon('check', 16)}Ya lo he enviado</button>`
        : `<button class="btn primario" data-act="feedback" data-id="${esc(a.id)}" style="grid-column:span 2">Añadir feedback</button>`}`;
    return `<div class="tarjeta">
      <div class="fila-entre"><span style="font-size:15px;font-weight:700">Sesión ${n} · ${esc(nombreTipo(a))}</span><span class="pequeno suave">${esc(fmtCorta(a.fecha))}</span></div>
      ${a.noEnviar ? '<span class="insignias"><span class="insignia">No se envía al terapeuta</span></span>' : `<div class="pasos">${paso(a.docId, !a.docId, 'Diario')}${paso(a.enviado, a.docId && !a.enviado, 'Enviado')}${paso(a.feedback?.length, a.enviado && !a.feedback?.length, 'Feedback')}</div>`}
      ${a.notasCaliente ? `<p class="pequeno suave" style="line-height:1.45"><b>Notas en caliente:</b> ${esc(a.notasCaliente)}</p>` : ''}
      ${(a.feedback || []).map((f) => `<div class="feedback"><span class="tipo c-azul">Feedback · ${esc(fmtCorta(f.fecha))}</span>${esc(f.texto)}</div>`).join('')}
      <div class="botones">${botones}</div>
      ${a.docId && !a.enviado && !a.noEnviar ? `<p class="mini suave">${AYUDA_PDF}</p>` : ''}
      <div class="fila-entre"><a href="${rutaForm(a)}" class="pequeno" style="font-weight:600;padding:6px 0">Editar sesión</a>${!a.enviado ? `<button class="btn texto pequeno" data-act="no-enviar" data-id="${esc(a.id)}">${a.noEnviar ? 'Sí quiero enviarlo' : 'No enviar este diario'}</button>` : ''}</div>
    </div>`;
  }).join('');
  return {
    html: `<div class="pantalla sin-nav">${volver('#/diario', 'Diario')}
    <div class="item-texto"><h1 class="titulo" style="font-size:30px">${esc(etiquetaCaso(codigo))}${aliasDe(codigo) ? ` <span style="color:var(--suave);font-weight:700">· ${esc(aliasDe(codigo))}</span>` : ''}${ultima && inicialesTer(S.terapeuta(ultima.terapeutaId)) ? ` <span style="color:var(--suave);font-weight:700">· ${esc(inicialesTer(S.terapeuta(ultima.terapeutaId)))}</span>` : ''}</h1>
    <span class="suave pequeno">${ultima ? 'Terapeuta: ' + esc(S.terapeuta(ultima.terapeutaId)?.nombre || '') + ' · ' : ''}${hechasC.length} sesi${hechasC.length === 1 ? 'ón' : 'ones'}${hechasC[0] ? ' · desde el ' + esc(fmtCorta(hechasC[0].fecha)) : ''}</span></div>
    <form id="f-alias" class="tarjeta" style="gap:8px"><label for="alias" class="pequeno" style="font-weight:700">Alias privado del paciente</label>
      <div class="dos-col" style="grid-template-columns:1fr auto"><input type="text" id="alias" maxlength="12" value="${esc(aliasDe(codigo))}" placeholder="p. ej. sus iniciales" autocomplete="off"><button class="btn">Guardar</button></div>
      <span class="mini suave" style="line-height:1.4">${icon('candado', 12)} Solo se guarda en este dispositivo. No va a Drive, ni a Google Calendar, ni a los diarios.</span></form>
    <div class="seccion">${tarjetas}</div></div>`,
    mount(r) {
      r.querySelector('#f-alias').addEventListener('submit', (e) => { e.preventDefault(); ponerAlias(codigo, r.querySelector('#alias').value.trim()); toast('Alias guardado en este dispositivo.'); render(); });
    },
  };
}

// ---------- Exportar ----------
async function plantillaHoras() {
  let buf = await idbGet('plantilla-horas').catch(() => null);
  if (buf) return buf;
  const aj = S.datos().ajustes;
  if (aj.plantillaHorasId && G.configurado()) {
    await google(); buf = await G.descargarArchivo(aj.plantillaHorasId); await idbSet('plantilla-horas', buf); return buf;
  }
  throw new Error('Primero sube la plantilla de horas de Luria en Ajustes.');
}
async function hojaBlob() {
  const s = S.datos();
  const acts = S.hechas().filter((a) => TIPOS_HOJA.includes(a.tipo)).map((a) => ({ tipo: a.tipo, fecha: a.fecha }));
  return generarHoja(await plantillaHoras(), acts, s.ajustes.nombre);
}
// Crea (una vez) la hoja de horas en Google Sheets a partir de la plantilla de Luria
// y marca las casillas con lo registrado. Las casillas se ponen como casillas de Google Sheets.
async function hojaEnSheets() {
  await google();
  const aj = S.datos().ajustes;
  let id = aj.hojaHorasId;
  if (id && !(await G.existeArchivo(id))) id = null;
  if (!id) {
    const buf = await plantillaHoras();
    const dir = await G.carpeta([RAIZ, 'Horas'], aj.carpetas);
    id = await G.subirArchivo(`Registro de horas${aj.nombre ? ' - ' + aj.nombre : ''}`, new Blob([buf]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dir, 'application/vnd.google-apps.spreadsheet');
    S.actualizar((st) => { st.ajustes.hojaHorasId = id; });
  }
  const acts = S.hechas().filter((a) => TIPOS_HOJA.includes(a.tipo)).map((a) => ({ tipo: a.tipo, fecha: a.fecha }));
  const { porMes, avisos } = asignarCasillas(acts);
  const requests = [];
  for (const t of await G.pestanas(id)) {
    const mes = mesDeTitulo(t.title); if (!mes) continue;
    const marcadas = porMes[mes] || {};
    const rango = { sheetId: t.sheetId, startRowIndex: 7, endRowIndex: 38, startColumnIndex: 1, endColumnIndex: 16 };
    requests.push({ setDataValidation: { range: rango, rule: { condition: { type: 'BOOLEAN' }, strict: true } } });
    const filas = [];
    for (let f = 8; f <= 38; f++) filas.push({ values: COLUMNAS_HOJA.map((c) => ({ userEnteredValue: { boolValue: Boolean(marcadas[`${c}${f}`]) } })) });
    requests.push({ updateCells: { range: rango, rows: filas, fields: 'userEnteredValue' } });
    if (aj.nombre) requests.push({ updateCells: { range: { sheetId: t.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: `Nombre y apellidos: ${aj.nombre}` } }] }], fields: 'userEnteredValue' } });
  }
  if (!requests.length) throw new Error('No encuentro las pestañas de los meses en la plantilla.');
  await G.loteHoja(id, requests);
  S.actualizar((st) => { st.ajustes.hojaHorasActualizada = hoyISO(); });
  return { id, avisos };
}

// Lista del mes, día a día, para revisar o marcar a mano
function resumenMes(mes) {
  const porDia = new Map();
  for (const a of S.hechas().filter((x) => TIPOS_HOJA.includes(x.tipo) && x.fecha.startsWith(mes)).sort(porFechaHora)) {
    const d = Number(a.fecha.slice(8)); const m = porDia.get(d) || {}; m[a.tipo] = (m[a.tipo] || 0) + 1; porDia.set(d, m);
  }
  if (!porDia.size) return '<p class="pequeno suave">No hay actividades registradas este mes.</p>';
  const nom = { coterapia: 'coterapia', espejo: 'espejo', tutoria_metodologica: 'T. metodológica', tutoria_caso: 'T. de caso', seminario: 'seminario' };
  return `<div class="tarjeta lista" style="border:0">${[...porDia.entries()].map(([d, m]) => `<div class="fila"><span style="font-weight:700;min-width:56px">Día ${d}</span><span class="pequeno" style="text-align:right">${Object.entries(m).map(([t, n]) => `${n > 1 ? n + ' × ' : ''}${nom[t]}`).join(' · ')}</span></div>`).join('')}</div>`;
}

async function generarMensual(mes) {
  await google();
  const s = S.datos();
  const delMes = S.hechas().filter((a) => a.fecha.startsWith(mes)).sort(porFechaHora);
  // De los casos solo se ponen enlaces: la app no lee lo que escribes sobre los pacientes
  const sesiones = delMes.filter(esSesion).map((a) => ({
    titulo: `${nombreTipo(a)} · ${casoPub(a)} · ${fmtNum(a.fecha)}`,
    enlace: a.docId ? G.enlaceDoc(a.docId) : null,
  }));
  const ter = (a) => S.terapeuta(a.terapeutaId)?.nombre;
  const html = D.diarioMensual({
    mes, nombre: s.ajustes.nombre, sesiones,
    tutoriasCaso: delMes.filter((a) => a.tipo === 'tutoria_caso').map((a) => ({ fecha: a.fecha, terapeuta: ter(a), aprendizaje: a.aprendizaje })),
    metodologicas: delMes.filter((a) => a.tipo === 'tutoria_metodologica').map((a) => ({ titulo: `${a.numero} · ${a.titulo}`, idea: a.ficha?.idea, aplica: a.ficha?.aplica })),
    seminarios: delMes.filter((a) => a.tipo === 'seminario').map((a) => ({ titulo: `${a.numero} · ${a.titulo}`, idea: a.ficha?.idea, aplica: a.ficha?.aplica })),
    practicas: delMes.filter((a) => a.tipo === 'practica_pdp').map((a) => ({ fecha: a.fecha, titulo: a.titulo, descripcion: a.descripcion })),
  });
  const dir = await G.carpeta([RAIZ, 'Diario mensual'], s.ajustes.carpetas);
  const doc = await G.docDesdeHtml(`Diario crítico · ${nombreMes(mes)}`, html, dir);
  S.actualizar((st) => { st.informes[mes] = { ...(st.informes[mes] || {}), docId: doc, generado: hoyISO() }; });
  return doc;
}

function mesPorDefecto() {
  const d = new Date(); const actual = hoyISO(d).slice(0, 7);
  const prev = hoyISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
  const m = d.getDate() <= 10 ? prev : actual;
  return MESES.includes(m) ? m : MESES.find((x) => x >= actual) || MESES[0];
}
function vExportar(params) {
  const s = S.datos();
  const mes = params.get('mes') || mesPorDefecto();
  const c = S.conteos(mes);
  const inf = s.informes[mes] || {};
  const n = (t) => S.hechas().filter((a) => a.tipo === t && a.fecha.startsWith(mes)).length;
  return {
    html: `<div class="pantalla sin-nav">${volver('#/inicio', 'Exportar y entregas')}
    <div class="campo"><label for="mes">Mes</label><select id="mes">${MESES.map((m) => `<option value="${m}" ${m === mes ? 'selected' : ''}>${esc(nombreMes(m))}</option>`).join('')}</select></div>
    <section class="tarjeta destacada">
      <span class="item-texto"><span style="font-size:16px;font-weight:700">Hoja de horas</span><span class="item-sub">Plantilla de Luria · las casillas se marcan solas</span></span>
      <div class="conteos">
        <span class="celda"><b>${c.coterapia}</b><span>Coterapia</span></span><span class="celda"><b>${c.espejo}</b><span>Espejo</span></span>
        <span class="celda"><b>${c.tutoria_metodologica}</b><span>T. metod.</span></span><span class="celda"><b>${c.tutoria_caso}</b><span>T. caso</span></span>
        <span class="celda"><b>${c.seminario}</b><span>Seminario</span></span>
      </div>
      ${!s.ajustes.plantillaHorasNombre ? `<div class="aviso-caja">${icon('hoja', 18)}<span>Para generar la hoja, sube primero la plantilla de Luria en <a href="#/ajustes" style="font-weight:700">Ajustes</a>.</span></div>` : ''}
      ${s.ajustes.hojaHorasId ? `<div class="botones"><a class="btn primario" href="${G.enlaceHoja(s.ajustes.hojaHorasId)}" target="_blank" rel="noopener">${icon('externo', 16)}Abrir en Sheets</a><button class="btn" data-act="hoja-sheets">Actualizar casillas</button></div>
      <span class="mini suave" style="line-height:1.4">${s.ajustes.hojaHorasActualizada ? `Actualizada el ${esc(fmtNum(s.ajustes.hojaHorasActualizada))}. ` : ''}Pulsa «Actualizar casillas» antes de enviarla. Para enviarla: en Sheets, <b>Archivo → Descargar → Microsoft Excel (.xlsx)</b>, y adjúntala en tu correo.</span>`
        : `<button class="btn primario" data-act="hoja-sheets">${icon('hoja', 16)}Crear la hoja en Google Sheets</button>
      <span class="mini suave" style="line-height:1.4">Se crea en tu Drive (carpeta Luria Lab › Horas) con la plantilla de Luria y las casillas marcadas. Incluye todos los meses.</span>`}
      <details><summary class="pequeno" style="font-weight:700;cursor:pointer;padding:6px 0">Ver el mes día a día</summary>${resumenMes(mes)}</details>
      <button class="btn texto pequeno" data-act="descargar-hoja" style="align-self:flex-start">Descargar el .xlsx directamente (sin Sheets)</button>
      ${inf.enviado ? `<div class="fila-entre"><span class="insignia ok">${icon('check', 14)}&nbsp;Enviado a Luria el ${esc(fmtNum(inf.enviado))}</span><button class="btn texto pequeno" data-act="marcar-luria" data-mes="${mes}">Desmarcar</button></div>` : `<button class="btn" data-act="marcar-luria" data-mes="${mes}">${icon('check', 16)}Ya lo he enviado a Luria</button>`}
    </section>
    <section class="tarjeta">
      <span class="item-texto"><span style="font-size:16px;font-weight:700">Diario crítico del mes</span><span class="item-sub" style="line-height:1.4">Compila tus actividades del mes, ordenadas por tipo, con preguntas guía para tu síntesis. De los casos incluye el enlace a cada diario, sin copiar su contenido.</span></span>
      <div class="insignias"><span class="insignia ok">${n('espejo') + n('coterapia')} espejos y coterapias</span><span class="insignia" style="background:var(--azul-cl);color:#234A70">${n('tutoria_caso')} T. de caso</span><span class="insignia" style="background:var(--morado-cl);color:#4F3570">${n('tutoria_metodologica')} T. metodológicas</span><span class="insignia aviso">${n('seminario')} seminarios</span><span class="insignia">${n('practica_pdp')} prácticas PDP</span></div>
      ${inf.docId ? `<div class="botones"><a class="btn primario" href="${G.enlaceDoc(inf.docId)}" target="_blank" rel="noopener">${icon('externo', 16)}Abrir borrador</a><button class="btn" data-act="mensual" data-mes="${mes}">Volver a generar</button></div><span class="mini suave">Generado el ${esc(fmtNum(inf.generado))}. Si vuelves a generarlo se crea un documento nuevo. ${AYUDA_PDF}</span>`
        : `<button class="btn" data-act="mensual" data-mes="${mes}">${icon('doc', 16)}Generar borrador en Google Docs</button>`}
    </section></div>`,
    mount(r) { r.querySelector('#mes').addEventListener('change', (e) => irA(`#/exportar?mes=${e.target.value}`)); },
  };
}

// ---------- Ajustes ----------
function vAjustes() {
  const s = S.datos(); const aj = s.ajustes;
  const horasCampo = (t, l) => `<div class="fila"><label for="h-${t}" style="font-size:15px">${l}</label><span style="display:flex;align-items:center;gap:6px"><input type="number" id="h-${t}" name="h_${t}" min="0" step="0.5" value="${esc(aj.horas[t])}" style="width:80px;text-align:center;min-height:40px">h</span></div>`;
  return {
    html: `<div class="pantalla sin-nav">${volver('#/inicio', 'Ajustes')}
    <form id="f-aj" class="seccion">
      <h2 class="etiqueta-grupo">Mis prácticas</h2>
      <div class="tarjeta">
        <div class="campo"><label for="a-nombre">Nombre y apellidos</label><input type="text" id="a-nombre" name="nombre" value="${esc(aj.nombre)}" placeholder="Aparece en la hoja de horas"></div>
        <div class="dos-col"><div class="campo"><label for="a-obj">Objetivo de horas</label><input type="number" id="a-obj" name="objetivoHoras" min="1" value="${esc(aj.objetivoHoras)}"></div>
        <div class="campo"><label for="a-per">Periodo</label><input type="text" id="a-per" name="periodo" value="${esc(aj.periodo)}"></div></div>
        <div class="campo"><label for="a-tc">Tutorías de caso previstas en total</label><input type="number" id="a-tc" name="tcPrevistas" min="0" value="${esc(aj.tcPrevistas)}">
          <span class="ayuda">Unas 7 al mes de octubre a enero = 28. Se usa para calcular cuántos espejos o coterapias te faltan.</span></div>
      </div>
      <h2 class="etiqueta-grupo">Horas computables por actividad</h2>
      <div class="tarjeta lista">${horasCampo('espejo', 'Espejo')}${horasCampo('coterapia', 'Coterapia')}${horasCampo('tutoria_metodologica', 'Tutoría metodológica')}${horasCampo('tutoria_caso', 'Tutoría de caso')}${horasCampo('seminario', 'Seminario')}</div>
      <button class="btn primario grande">Guardar cambios</button>
    </form>

    <h2 class="etiqueta-grupo">Plantillas</h2>
    <div class="tarjeta lista">
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Hoja de horas de Luria</span><span class="item-sub">${aj.plantillaHorasNombre ? esc(aj.plantillaHorasNombre) : 'Sin subir'}</span></span><label class="btn texto" for="in-horas" style="cursor:pointer">${aj.plantillaHorasNombre ? 'Cambiar' : 'Subir .xlsx'}</label><input type="file" id="in-horas" accept=".xlsx" class="oculto"></div>
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Diario crítico</span><span class="item-sub">${aj.plantillaPropia ? 'Tu plantilla propia' : 'Predeterminada · 3 apartados + notas y feedback'}</span></span>${aj.plantillaPropia ? '<button class="btn texto" data-act="plantilla-defecto">Usar la predeterminada</button>' : ''}<label class="btn texto" for="in-diario" style="cursor:pointer">Subir .docx</label><input type="file" id="in-diario" accept=".docx" class="oculto"></div>
    </div>
    <p class="mini suave" style="line-height:1.45;margin-top:-6px">Si subes tu propia plantilla del diario, la app rellena estas marcas donde las pongas: {{CASO}}, {{CODIGO}}, {{FECHA}}, {{TIPO}}, {{FORMATO}}, {{DURACION}}, {{TERAPEUTA}} y {{NOTAS}}.</p>

    <h2 class="etiqueta-grupo">Actividades anteriores a la app</h2>
    <div class="tarjeta">
      <p class="pequeno suave" style="line-height:1.45">Lo que hiciste antes de usar la app, con su día, para que se marquen las casillas correctas en la hoja de horas.</p>
      <label class="btn primario" for="in-importar" style="cursor:pointer">${icon('hoja', 18)}Importar las hojas ya enviadas (.xlsx)</label><input type="file" id="in-importar" accept=".xlsx" multiple class="oculto">
      <span class="mini suave" style="line-height:1.4;margin-top:-4px">Sube los registros de horas que ya mandaste a Luria. La app lee las casillas marcadas y crea las actividades sola (las tutorías metodológicas y los seminarios se marcan como «Asistí»). No duplica lo que ya tengas.</span>
      <button class="btn" data-act="varios-dias">${icon('calendario', 18)}Marcar varios días en un calendario</button>
      <p class="etiqueta-grupo" style="margin:6px 0 0">O un día concreto</p>
      <form id="f-prev" class="seccion">
        <div class="dos-col"><div class="campo"><label for="p-fecha">Día</label><input type="date" id="p-fecha" name="fecha" required></div>
        <div class="campo"><label for="p-tipo">Actividad</label><select id="p-tipo" name="tipo">${['espejo', 'coterapia', 'tutoria_caso'].map((t) => `<option value="${t}">${esc(TIPOS[t].nombre)}</option>`).join('')}</select></div></div>
        <div class="campo" data-solo-sesion><label for="p-caso">Código de caso <span class="suave" style="font-weight:400">(opcional)</span></label><input type="text" id="p-caso" name="caso" list="l-casos-p"><datalist id="l-casos-p">${[...S.casos().keys()].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="dos-col" style="align-items:end"><div class="campo"><label for="p-n">Cuántas ese día</label><input type="number" id="p-n" name="cantidad" min="1" max="8" value="1"></div><button class="btn">Añadir</button></div>
      </form>
      ${s.horasPrevias.length ? `<div class="aviso-caja">${icon('reloj', 18)}<span>Totales antiguos sin día (ya no cuentan en tus horas ni en la hoja; quítalos y usa la importación o el calendario): ${s.horasPrevias.map((p, i) => `${esc(nombreMes(p.mes))} · ${esc(TIPOS[p.tipo].nombre)} · ${p.sesiones} <button class="btn texto pequeno" data-act="quitar-previa" data-i="${i}">quitar</button>`).join(' · ')}</span></div>` : ''}
    </div>

    <h2 class="etiqueta-grupo">Mis terapeutas</h2>
    <div class="tarjeta lista">
      ${s.terapeutas.map((t) => `<button class="fila" data-act="editar-ter" data-id="${esc(t.id)}"><span class="item-texto"><span style="font-size:15px">${esc(t.nombre)}</span></span>${icon('sig', 18)}</button>`).join('')}
      <button class="fila" data-act="nuevo-ter" style="color:var(--verde);font-weight:700;justify-content:flex-start">${icon('mas', 18)} Añadir terapeuta</button>
    </div>

    <h2 class="etiqueta-grupo">Alias privados de pacientes</h2>
    <div class="tarjeta lista">
      <div class="fila"><span class="item-texto"><span style="font-size:15px">${Object.keys(leerAlias()).length} alias en este dispositivo</span><span class="item-sub">No se sincronizan. Si cambias de móvil o borras la app, descárgalos antes y vuelve a cargarlos.</span></span><span style="display:flex"><button class="btn texto" data-act="alias-descargar">Descargar</button><label class="btn texto" for="in-alias" style="cursor:pointer">Cargar</label><input type="file" id="in-alias" accept=".json,application/json" class="oculto"></span></div>
    </div>

    <h2 class="etiqueta-grupo">Google Calendar</h2>
    <div class="tarjeta lista">
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Enviar mi agenda a Google Calendar</span><span class="item-sub">${aj.calendarioActivo ? (G.tieneCalendario() ? 'Activado · en tu calendario «Luria Lab»' : 'Activado · conecta con Google para actualizarlo') : 'La app crea un calendario «Luria Lab» y solo puede tocar ese'}</span></span>${aj.calendarioActivo ? '<button class="btn texto" data-act="cal-off">Desactivar</button>' : '<button class="btn texto" data-act="cal-on">Activar</button>'}</div>
      ${aj.calendarioId ? '<div class="fila"><span class="item-texto"><span style="font-size:15px">Quitar el calendario «Luria Lab»</span><span class="item-sub">Lo borra de tu Google Calendar con todos sus eventos</span></span><button class="btn texto" style="color:var(--error)" data-act="cal-borrar">Quitar</button></div>' : ''}
    </div>

    <h2 class="etiqueta-grupo">Apariencia</h2>
    <div class="tarjeta lista">
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Logo del centro</span><span class="item-sub">${logoURL ? 'Puesto · solo se ve en este dispositivo' : 'Solo se guarda en este dispositivo, no se publica'}</span></span><span style="display:flex">${logoURL ? '<button class="btn texto" data-act="quitar-logo">Quitar</button>' : ''}<label class="btn texto" for="in-logo" style="cursor:pointer">${logoURL ? 'Cambiar' : 'Subir imagen'}</label><input type="file" id="in-logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="oculto"></span></div>
    </div>

    <h2 class="etiqueta-grupo">Cuenta</h2>
    <div class="tarjeta lista">
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Cuenta de Google</span><span class="item-sub">${!G.configurado() ? 'No configurada (modo prueba)' : G.conectado() ? 'Conectada · solo Drive y Docs, sin acceso al correo' : 'Sin conectar'}</span></span>${G.configurado() ? (G.conectado() ? '<button class="btn texto" data-act="desconectar">Desconectar</button>' : '<button class="btn texto" data-act="conectar">Conectar</button>') : ''}</div>
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Copia de seguridad</span><span class="item-sub">Descarga o restaura todos tus registros</span></span><span style="display:flex"><button class="btn texto" data-act="copia">Descargar</button><label class="btn texto" for="in-copia" style="cursor:pointer">Restaurar</label><input type="file" id="in-copia" accept=".json,application/json" class="oculto"></span></div>
      <div class="fila"><span class="item-texto"><span style="font-size:15px">Cerrar sesión en este dispositivo</span><span class="item-sub">Borra los datos guardados aquí. Lo sincronizado en tu Drive no se toca.</span></span><button class="btn texto" style="color:var(--error)" data-act="borrar-local">Cerrar</button></div>
    </div>
    <p class="mini suave" style="text-align:center">Luria Lab · versión 3.0.0</p>
    </div>`,
    mount(r) {
      r.querySelector('#f-aj').addEventListener('submit', (e) => {
        e.preventDefault(); const v = leerForm(e.target);
        S.actualizar((st) => {
          Object.assign(st.ajustes, { nombre: v.nombre.trim(), objetivoHoras: Number(v.objetivoHoras) || 450, periodo: v.periodo.trim(), tcPrevistas: Math.max(0, Number(v.tcPrevistas) || 0) });
          for (const t of TIPOS_HOJA) st.ajustes.horas[t] = Number(v[`h_${t}`]) || 0;
        });
        toast('Ajustes guardados.');
      });
      r.querySelector('#f-prev').addEventListener('submit', (e) => {
        e.preventDefault(); const v = leerForm(e.target);
        if (!v.fecha) return;
        const n = Math.max(1, Math.min(8, Number(v.cantidad) || 1));
        S.actualizar((st) => {
          for (let i = 0; i < n; i++) st.actividades.push({ id: S.nuevoId(), tipo: v.tipo, fecha: v.fecha, hora: '', estado: 'hecha', pasada: true, caso: v.tipo === 'tutoria_caso' ? undefined : (v.caso || '').trim() || undefined, formato: v.tipo === 'tutoria_caso' ? 'zoom' : 'presencial', temas: [] });
        });
        toast(`Añadid${n === 1 ? 'a' : 'as'} ${n} · ${TIPOS[v.tipo].nombre.toLowerCase()} del ${fmtNum(v.fecha)}.`); render();
      });
      r.querySelector('#in-alias').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const m = JSON.parse(await f.text()); if (typeof m !== 'object' || Array.isArray(m)) throw new Error(); const act = leerAlias(); localStorage.setItem(ALIAS, JSON.stringify({ ...act, ...m })); toast('Alias cargados en este dispositivo.'); render(); }
        catch { toast('Ese archivo no es una copia de alias de Luria Lab.', { error: true }); }
      });
      r.querySelector('#in-logo').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 2_000_000) { toast('La imagen es demasiado grande (máximo 2 MB).', { error: true }); return; }
        await idbSet('logo', f);
        if (logoURL) URL.revokeObjectURL(logoURL);
        logoURL = URL.createObjectURL(f); toast('Logo puesto en este dispositivo.'); render();
      });
      r.querySelector('#in-importar').addEventListener('change', async (e) => {
        const files = [...e.target.files]; if (!files.length) return;
        await conCarga(null, async () => {
          const lista = [];
          for (const f of files) {
            try { lista.push(...await leerHoja(await f.arrayBuffer())); }
            catch (err) { throw new Error(`«${f.name}»: ${err.message}`); }
          }
          if (!lista.length) { toast('No he encontrado casillas marcadas en ese archivo. ¿Es la hoja ya rellenada?', { error: true, ms: 9000 }); return; }
          const res = anadirPasadas(lista);
          toast(`Importado: ${res.creadas} actividades nuevas${res.asistidas ? `, ${res.asistidas} tutorías/seminarios marcados como «Asistí»` : ''}${res.yaEstaban ? `. ${res.yaEstaban} ya estaban y no se han duplicado` : ''}.`, { ms: 12000 });
          render();
        });
        e.target.value = '';
      });
      const tipoPrev = r.querySelector('#p-tipo');
      const ajustarPrev = () => { r.querySelector('[data-solo-sesion]').hidden = tipoPrev.value === 'tutoria_caso'; };
      tipoPrev.addEventListener('change', ajustarPrev); ajustarPrev();
      r.querySelector('#in-horas').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        await conCarga(null, async () => {
          const buf = await file.arrayBuffer();
          const z = await Zip.abrir(buf);
          if (!((await z.texto('xl/sharedStrings.xml')) || '').includes('REGISTRO HORAS')) throw new Error('Ese archivo no parece la plantilla de registro de horas de Luria.');
          await idbSet('plantilla-horas', buf);
          S.actualizar((st) => { st.ajustes.plantillaHorasNombre = file.name; });
          if (G.conectado()) {
            try {
              const dir = await G.carpeta([RAIZ, 'Plantillas'], S.datos().ajustes.carpetas);
              const id = await G.subirArchivo(file.name, new Blob([buf], { type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dir);
              S.actualizar((st) => { st.ajustes.plantillaHorasId = id; });
            } catch (err) { console.warn(err); toast('Plantilla guardada en este dispositivo. No se pudo copiar a tu Drive: ' + err.message, { ms: 9000 }); render(); return; }
          }
          toast('Plantilla de horas guardada.'); render();
        });
      });
      r.querySelector('#in-diario').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        await conCarga(null, async () => {
          await google();
          const dir = await G.carpeta([RAIZ, 'Plantillas'], S.datos().ajustes.carpetas);
          const id = await G.subirArchivo(`Plantilla propia · ${file.name.replace(/\.docx$/i, '')}`, file, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dir, 'application/vnd.google-apps.document');
          S.actualizar((st) => { st.ajustes.plantillaDiarioId = id; st.ajustes.plantillaPropia = true; });
          toast('Plantilla del diario cambiada.', { enlace: G.enlaceDoc(id), texto: 'Ver' }); render();
        });
      });
      r.querySelector('#in-copia').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const obj = JSON.parse(await file.text());
          if (!Array.isArray(obj.actividades)) throw new Error();
          confirmar('¿Restaurar esta copia?', 'Sustituirá los registros actuales de la app.', 'Restaurar', () => { S.reemplazar(obj, { sincronizar: true }); toast('Copia restaurada.'); render(); });
        } catch { toast('Ese archivo no es una copia de Luria Lab.', { error: true }); }
      });
    },
  };
}

// ======================= Fase 3: Hexaflex =======================
const HX = () => S.datos().hexaflex;
const proceso = (k) => PROCESOS.find((p) => p.k === k);
const fichasDe = (k) => HX().fichas.filter((f) => (f.procesos || []).includes(k));
const nivelExp = (f) => (f.exp?.terapia ? 'Usada en terapia' : f.exp?.rp ? 'Probada en role play' : f.exp?.mi ? 'Probada en mí' : 'Sin probar');
// Guarda al momento cada campo que cambia (data-campo="ruta.del.dato")
function autoguardar(raiz, objeto) {
  raiz.querySelectorAll('[data-campo]').forEach((el) => el.addEventListener('change', () => {
    S.actualizar(() => { objeto()[el.dataset.campo] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    const aviso = raiz.querySelector('.guardado'); if (aviso) { aviso.textContent = 'Guardado'; setTimeout(() => { aviso.textContent = ''; }, 1500); }
  }));
}
const areaCampo = (campo, etiqueta, valor, ph, filas = 4) => `<section class="tarjeta"><label for="c-${campo}" class="tipo c-morado" style="font-size:13px">${etiqueta}</label><textarea id="c-${campo}" data-campo="${campo}" rows="${filas}" placeholder="${esc(ph)}" style="border:0;padding:0">${esc(valor)}</textarea></section>`;
const tarjetaFicha = (f) => `<a href="#/hexaflex/ficha/${encodeURIComponent(f.id)}" class="item" style="flex-direction:column;align-items:stretch;gap:8px">
  <span class="fila-entre"><span class="tipo c-morado">${esc(f.tipo || 'Ficha')}</span><span class="mini ${f.exp?.terapia || f.exp?.rp || f.exp?.mi ? 'c-verde' : 'suave'}" style="font-weight:700">${nivelExp(f)}</span></span>
  <span style="font-size:17px;font-weight:700">${esc(f.nombre || 'Sin nombre')}</span>
  <span class="insignias">${(f.procesos || []).map((k) => `<span class="insignia ${k === f.principal ? 'ok' : ''}">${esc(proceso(k)?.nombre || k)}</span>`).join('')}${f.ejemplo ? '<span class="insignia aviso">Ejemplo</span>' : ''}</span></a>`;

let filtroHx = '';
function vHexaflex() {
  const fichas = [...HX().fichas].filter((f) => !filtroHx || [f.nombre, f.paraQue, f.cuando, f.tipo].join(' ').toLowerCase().includes(filtroHx.toLowerCase())).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  return {
    html: `<div class="pantalla"><div class="item-texto"><h1 class="titulo">Hexaflex</h1><span class="suave pequeno">Teoría y banco de ejercicios ACT</span></div>
    <a href="#/hexaflex/modelo" class="item" style="background:var(--verde);border-color:var(--verde);color:#fff"><span class="icono-caja" style="background:rgba(255,255,255,0.14);color:#fff">${icon('hexa')}</span><span class="item-texto"><span style="font-size:16px;font-weight:700">El modelo de flexibilidad psicológica</span><span class="item-sub" style="color:#C9CEF0">Tu resumen de la teoría · ${HX().modelo?.que ? 'escrito' : 'por escribir'}</span></span>${icon('sig', 18)}</a>
    <div class="rejilla">${PROCESOS.map((p) => `<a href="#/hexaflex/p/${p.k}" class="celda" style="background:var(--superficie);border:1px solid var(--linea);color:var(--tinta);min-height:64px"><span style="font-size:14px;font-weight:700">${esc(p.nombre)}</span><span class="mini suave">${fichasDe(p.k).length} ficha${fichasDe(p.k).length === 1 ? '' : 's'}${HX().procesos[p.k]?.que ? ' · teoría ✓' : ''}</span></a>`).join('')}</div>
    <div class="fila-entre"><h2 class="seccion-titulo">Banco de fichas</h2><a href="#/hexaflex/ficha/nueva" class="btn texto">${icon('mas', 18)} Añadir</a></div>
    <div class="campo"><label for="hx-buscar" class="oculto">Buscar fichas</label><input type="search" id="hx-buscar" placeholder="Buscar: «rumia», «evitación»…" value="${esc(filtroHx)}"></div>
    <div class="seccion">${fichas.map(tarjetaFicha).join('') || '<p class="vacio">No hay fichas que coincidan.</p>'}</div>
    </div>${nav('hexaflex')}`,
    mount(r) { const b = r.querySelector('#hx-buscar'); b.addEventListener('input', () => { filtroHx = b.value; const pos = b.selectionStart; render(); const nb = app.querySelector('#hx-buscar'); nb.focus(); nb.setSelectionRange(pos, pos); }); },
  };
}

function vHxModelo() {
  const m = HX().modelo;
  return {
    html: `<div class="pantalla sin-nav">${volver('#/hexaflex', 'El modelo')}
    <p class="suave pequeno" style="line-height:1.45">Resume con tus palabras el modelo de flexibilidad psicológica según el libro de Hayes. Se guarda solo mientras escribes. <span class="guardado c-verde" style="font-weight:700"></span></p>
    ${areaCampo('que', '¿Qué es la flexibilidad psicológica?', m.que, 'Definición y para qué sirve en terapia', 5)}
    ${areaCampo('relacion', '¿Cómo se relacionan los seis procesos?', m.relacion, 'Los tres pares: abierto, consciente, comprometido…', 6)}
    ${areaCampo('inflexibilidad', 'El modelo de inflexibilidad', m.inflexibilidad, 'Cómo se ve el sufrimiento desde ACT', 5)}
    ${areaCampo('fuente', 'Fuente', m.fuente, 'Libro, capítulos y páginas', 2)}
    </div>`,
    mount(r) { autoguardar(r, () => HX().modelo); },
  };
}

function vHxProceso(k) {
  const p = proceso(k); if (!p) return vNoEncontrado();
  const d = HX().procesos[k] || {};
  const fichas = fichasDe(k);
  return {
    html: `<div class="pantalla sin-nav">${volver('#/hexaflex', 'Hexaflex')}
    <div class="item-texto"><h1 class="titulo">${esc(p.nombre)}</h1><span class="suave pequeno">Polo de inflexibilidad: ${esc(p.opuesto)}</span></div>
    <p class="mini suave">Se guarda solo mientras escribes. <span class="guardado c-verde" style="font-weight:700"></span></p>
    ${areaCampo('que', 'Qué es', d.que, 'El proceso explicado con tus palabras', 4)}
    ${areaCampo('falta', 'Cómo se ve en sesión cuando falta', d.falta, `Señales de ${p.opuesto.toLowerCase()}`, 4)}
    ${areaCampo('busca', 'Qué busca el terapeuta al trabajarlo', d.busca, 'Hacia dónde mueve la intervención', 3)}
    ${areaCampo('fuente', 'Fuente', d.fuente, 'Capítulo y páginas', 2)}
    <div class="fila-entre"><h2 class="seccion-titulo">Fichas de ${esc(p.nombre.toLowerCase())}</h2><a href="#/hexaflex/ficha/nueva?p=${k}" class="btn texto">${icon('mas', 18)} Añadir</a></div>
    <div class="seccion">${fichas.map(tarjetaFicha).join('') || '<p class="vacio">Aún no hay fichas de este proceso.</p>'}</div>
    </div>`,
    mount(r) { autoguardar(r, () => { const hx = HX(); hx.procesos[k] = hx.procesos[k] || {}; return hx.procesos[k]; }); },
  };
}

const borradorFicha = {};
function vHxFicha(id, params) {
  const nueva = id === 'nueva';
  const f = nueva ? (borradorFicha.f = borradorFicha.f || { id: S.nuevoId(), nombre: '', tipo: 'Metáfora', procesos: params.get('p') ? [params.get('p')] : [], principal: params.get('p') || '', exp: {}, notasExp: [] }) : HX().fichas.find((x) => x.id === id);
  if (!f) return vNoEncontrado();
  const campo = (n, l, ph, filas = 3) => `<div class="campo"><label for="f-${n}">${l}</label><textarea id="f-${n}" name="${n}" rows="${filas}" placeholder="${esc(ph)}">${esc(f[n])}</textarea></div>`;
  return {
    html: `<div class="pantalla sin-nav">${volver('#/hexaflex', nueva ? 'Nueva ficha' : 'Ficha')}
    <form id="f-hx" class="seccion">
      <div class="campo"><label for="f-nombre">Nombre</label><input type="text" id="f-nombre" name="nombre" required value="${esc(f.nombre)}" placeholder="p. ej. Pasajeros en el autobús"></div>
      <div class="campo"><label for="f-tipo">Tipo</label><select id="f-tipo" name="tipo">${TIPOS_FICHA.map((t) => `<option ${t === f.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><span class="etiqueta">Procesos que trabaja</span><div class="chips">${PROCESOS.map((p) => `<input type="checkbox" id="pr-${p.k}" name="procesos" value="${p.k}" ${(f.procesos || []).includes(p.k) ? 'checked' : ''}><label for="pr-${p.k}">${esc(p.nombre)}</label>`).join('')}</div></div>
      <div class="campo"><label for="f-principal">Proceso principal</label><select id="f-principal" name="principal"><option value="">—</option>${PROCESOS.map((p) => `<option value="${p.k}" ${p.k === f.principal ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
      ${campo('paraQue', 'Para qué sirve', 'Qué quieres conseguir con ella')}
      ${campo('cuando', 'Cuándo usarla', 'El paciente… (sin datos de pacientes reales)')}
      ${campo('guion', 'Guion breve', 'Tu versión, con tus palabras', 6)}
      ${campo('variaciones', 'Variaciones', 'Adaptación para infancia, versión con objetos…', 2)}
      <div class="campo"><label for="f-fuente">Fuente</label><input type="text" id="f-fuente" name="fuente" value="${esc(f.fuente)}" placeholder="Libro, capítulo, página"></div>
      <button class="btn primario grande">Guardar ficha</button>
    </form>
    ${!nueva ? `<section class="tarjeta"><span class="tipo c-morado" style="font-size:13px">Mi experiencia</span>
      <div class="pasos">${[['mi', 'En mí'], ['rp', 'Role play'], ['terapia', 'En terapia']].map(([k, t]) => `<span class="paso ${f.exp?.[k] ? 'hecho' : ''}"><i>${f.exp?.[k] ? icon('check', 14) : ''}</i>${t}</span>`).join('')}</div>
      ${(f.notasExp || []).map((n) => `<div class="feedback"><span class="tipo c-azul">${esc({ mi: 'En mí', rp: 'Role play', terapia: 'En terapia' }[n.donde] || '')} · ${esc(fmtCorta(n.fecha))}</span>${esc(n.texto)}</div>`).join('')}
      <button class="btn primario" data-act="hx-practica" data-id="${esc(f.id)}">${icon('check', 16)}Registrar que la he practicado</button></section>
      <button class="btn peligro" id="b-borrar-ficha">${icon('papelera', 18)}Eliminar ficha</button>` : ''}
    </div>`,
    mount(r) {
      const form = r.querySelector('#f-hx');
      form.addEventListener('submit', (e) => {
        e.preventDefault(); const v = leerForm(form);
        const procesos = [].concat(v.procesos || []);
        Object.assign(f, { nombre: v.nombre.trim(), tipo: v.tipo, procesos, principal: v.principal || procesos[0] || '', paraQue: v.paraQue.trim(), cuando: v.cuando.trim(), guion: v.guion.trim(), variaciones: v.variaciones.trim(), fuente: v.fuente.trim(), ejemplo: false });
        S.actualizar((s) => { if (nueva) { s.hexaflex.fichas.push(f); delete borradorFicha.f; } });
        toast('Ficha guardada.'); irA(nueva ? `#/hexaflex/ficha/${encodeURIComponent(f.id)}` : '#/hexaflex');
      });
      r.querySelector('#b-borrar-ficha')?.addEventListener('click', () => confirmar('¿Eliminar esta ficha?', 'Se borra del banco.', 'Eliminar', () => {
        S.actualizar((s) => { s.hexaflex.fichas = s.hexaflex.fichas.filter((x) => x.id !== f.id); s.borrados = [...new Set([...(s.borrados || []), f.id])]; }); irA('#/hexaflex');
      }));
    },
  };
}

function modalPracticaFicha(id) {
  const f = HX().fichas.find((x) => x.id === id);
  abrirModal(`<h2>He practicado «${esc(f.nombre)}»</h2>
  <form id="f-pf" class="seccion">
    <div class="campo"><span class="etiqueta">¿Dónde?</span>${seg('donde', [['mi', 'En mí'], ['rp', 'Role play'], ['terapia', 'En terapia']], 'rp')}</div>
    <div class="campo"><label for="pf-fecha">Fecha</label><input type="date" id="pf-fecha" name="fecha" value="${hoyISO()}"></div>
    <div class="campo"><label for="pf-txt">¿Cómo ha ido?</label><textarea id="pf-txt" name="texto" rows="4" placeholder="Qué funcionó, qué cambiarías la próxima vez"></textarea>
      <span class="ayuda">Si fue en terapia, sin datos que identifiquen al paciente.</span></div>
    <label class="pequeno" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="diario" value="1" checked> Añadirla también al Diario como práctica de mi PDP</label>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    d.querySelector('#f-pf').addEventListener('submit', (e) => {
      e.preventDefault(); const v = leerForm(e.target);
      S.actualizar((s) => {
        f.exp = { ...(f.exp || {}), [v.donde]: true };
        (f.notasExp = f.notasExp || []).push({ fecha: v.fecha, donde: v.donde, texto: v.texto.trim() });
        if (v.diario) s.actividades.push({ id: S.nuevoId(), tipo: 'practica_pdp', fecha: v.fecha, estado: 'hecha', titulo: `Hexaflex · ${f.nombre}`, descripcion: `${{ mi: 'En mí', rp: 'Role play', terapia: 'En terapia' }[v.donde]}. ${v.texto.trim()}`.trim(), fichaId: f.id });
      });
      cerrarModal(); toast('Práctica registrada.'); render();
    });
  });
}

// ======================= Fase 3: Mi PDP =======================
const PDP = () => S.datos().pdp;
function vPDP() {
  const p = PDP(); const s = S.datos();
  const practicas = S.hechas().filter((a) => a.tipo === 'practica_pdp').sort((x, y) => porFechaHora(y, x));
  const objetivo = (o, i) => {
    const hechas = (o.conductas || []).filter((c) => c.hecha).length; const total = (o.conductas || []).length;
    return `<section class="tarjeta" data-obj="${esc(o.id)}">
      <div class="fila-entre"><span class="tipo c-verde" style="color:var(--verde)">Objetivo ${i + 1}</span><span class="pequeno suave" style="font-weight:600">${hechas} de ${total} conductas</span></div>
      <label for="o-${o.id}" class="oculto">Objetivo ${i + 1}</label>
      <textarea id="o-${o.id}" data-o="${esc(o.id)}" data-k="titulo" rows="2" placeholder="¿Qué objetivo quiero conseguir?" style="font-size:17px;font-weight:700;border:0;padding:0">${esc(o.titulo)}</textarea>
      ${total ? `<div class="barra" aria-hidden="true"><div style="width:${(hechas / total) * 100}%"></div></div>` : ''}
      <span class="etiqueta-grupo" style="margin:0">¿De qué conductas me voy a servir?</span>
      ${(o.conductas || []).map((c) => `<div style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-conducta="${esc(c.id)}" data-o="${esc(o.id)}" ${c.hecha ? 'checked' : ''} aria-label="Hecha" style="width:22px;height:22px;margin-top:10px;accent-color:var(--verde)"><textarea data-conducta-txt="${esc(c.id)}" data-o="${esc(o.id)}" rows="1" style="flex:1;min-height:40px;padding:8px 10px">${esc(c.texto)}</textarea><button class="btn texto" data-act="pdp-quitar-conducta" data-o="${esc(o.id)}" data-c="${esc(c.id)}" aria-label="Quitar conducta">${icon('papelera', 16)}</button></div>`).join('')}
      <button class="btn texto pequeno" data-act="pdp-conducta" data-o="${esc(o.id)}" style="align-self:flex-start">${icon('mas', 16)} Añadir conducta</button>
      <span class="etiqueta-grupo" style="margin:0">¿Cómo voy a registrar mis avances?</span>
      <textarea data-o="${esc(o.id)}" data-k="registro" rows="2" placeholder="p. ej. fichas Hexaflex practicadas, role plays registrados…">${esc(o.registro)}</textarea>
      <button class="btn texto pequeno" data-act="pdp-quitar-obj" data-o="${esc(o.id)}" style="align-self:flex-end;color:var(--error)">Quitar objetivo</button>
    </section>`;
  };
  const revisiones = REVISIONES_PDP.map((n) => {
    const tm = S.actividad(`tm-${n}`); const r = p.revisiones[n] || {};
    return `<section class="tarjeta"><div class="fila-entre"><span class="item-texto"><span style="font-size:15px;font-weight:700">Revisión ${REVISIONES_PDP.indexOf(n) + 1} · T. metodológica ${n}</span><span class="item-sub">${esc(fmtFecha(tm?.fecha))}</span></span>${tm?.estado === 'hecha' ? '<span class="insignia ok">Hecha</span>' : ''}</div>
      <textarea data-rev="${n}" rows="3" placeholder="Qué quiero comentar con mi tutora · qué me dijo">${esc(r.notas)}</textarea></section>`;
  }).join('');
  return {
    html: `<div class="pantalla"><div class="item-texto"><h1 class="titulo">Mi PDP</h1><span class="suave pequeno">Plan de desarrollo profesional · se guarda solo <span class="guardado c-verde" style="font-weight:700"></span></span></div>
    <h2 class="etiqueta-grupo">Mi punto de partida</h2>
    <div class="dos-col">
      <section class="tarjeta" style="background:var(--exito-cl);border-color:transparent"><label for="p-fuertes" class="tipo c-verde">Puntos fuertes</label><textarea id="p-fuertes" data-pdp="fuertes" rows="6" style="background:transparent;border:0;padding:0">${esc(p.fuertes)}</textarea></section>
      <section class="tarjeta" style="background:var(--ambar-cl);border-color:transparent"><label for="p-mejora" class="tipo c-ambar">Áreas de mejora</label><textarea id="p-mejora" data-pdp="mejora" rows="6" style="background:transparent;border:0;padding:0">${esc(p.mejora)}</textarea></section>
    </div>
    <h2 class="etiqueta-grupo">Mis objetivos <span style="text-transform:none;font-weight:600">(2 o 3 como máximo)</span></h2>
    ${p.objetivos.map(objetivo).join('')}
    ${p.objetivos.length < 3 ? `<button class="btn linea" data-act="pdp-objetivo">${icon('mas', 18)}Añadir objetivo</button>` : ''}
    <h2 class="etiqueta-grupo">Revisiones con tu tutora</h2>${revisiones}
    <div class="fila-entre"><h2 class="etiqueta-grupo">Mis prácticas del PDP</h2><a href="#/practica/nuevo" class="btn texto pequeno">${icon('mas', 16)} Registrar</a></div>
    ${practicas.length ? practicas.slice(0, 5).map((a) => `<a href="${rutaForm(a)}" class="item"><span class="item-texto"><span class="item-titulo">${esc(a.titulo)}</span><span class="item-sub">${esc(fmtCorta(a.fecha))}${a.descripcion ? ' · ' + esc(a.descripcion.slice(0, 80)) : ''}</span></span></a>`).join('') + (practicas.length > 5 ? `<a href="#/diario" class="pequeno" style="font-weight:700">Ver las ${practicas.length} en el Diario</a>` : '') : '<p class="pequeno suave">Role plays, lecturas o ejercicios en ti. También se añaden al practicar una ficha del Hexaflex.</p>'}
    </div>${nav('pdp')}`,
    mount(r) {
      const ok = () => { const a = r.querySelector('.guardado'); if (a) { a.textContent = '· guardado'; setTimeout(() => { a.textContent = ''; }, 1500); } };
      const obj = (id) => PDP().objetivos.find((o) => o.id === id);
      r.querySelectorAll('[data-pdp]').forEach((el) => el.addEventListener('change', () => { S.actualizar(() => { PDP()[el.dataset.pdp] = el.value.trim(); }); ok(); }));
      r.querySelectorAll('textarea[data-k]').forEach((el) => el.addEventListener('change', () => { S.actualizar(() => { obj(el.dataset.o)[el.dataset.k] = el.value.trim(); }); ok(); }));
      r.querySelectorAll('[data-conducta-txt]').forEach((el) => el.addEventListener('change', () => { S.actualizar(() => { obj(el.dataset.o).conductas.find((c) => c.id === el.dataset.conductaTxt).texto = el.value.trim(); }); ok(); }));
      r.querySelectorAll('[data-conducta]').forEach((el) => el.addEventListener('change', () => { S.actualizar(() => { obj(el.dataset.o).conductas.find((c) => c.id === el.dataset.conducta).hecha = el.checked; }); render(); }));
      r.querySelectorAll('[data-rev]').forEach((el) => el.addEventListener('change', () => { S.actualizar(() => { PDP().revisiones[el.dataset.rev] = { ...(PDP().revisiones[el.dataset.rev] || {}), notas: el.value.trim() }; }); ok(); }));
    },
  };
}

// ---------- Secciones de fases siguientes ----------
function vProximamente(seccion) {
  const info = {
    guia: ['Guía clínica', 'Tus apuntes de tutorías, seminarios y tutorías de caso ordenados como el recorrido de un caso. Llega en la fase 2.'],
    pdp: ['Mi PDP', 'Tu plan de desarrollo profesional: punto de partida, objetivos, conductas y revisiones. Llega en la fase 3.'],
    hexaflex: ['Hexaflex', 'Teoría del modelo de flexibilidad psicológica y tu banco de ejercicios y metáforas. Llega en la fase 3.'],
  }[seccion];
  return { html: `<div class="pantalla"><h1 class="titulo">${info[0]}</h1><div class="tarjeta"><p class="suave" style="line-height:1.5">${info[1]}</p><p class="pequeno suave">Mientras tanto, todo lo que registres ya se guarda y aparecerá aquí cuando esté lista.</p></div></div>${nav(seccion)}` };
}
const vNoEncontrado = () => ({ html: `<div class="pantalla sin-nav">${volver('#/inicio', 'No encontrado')}<p class="vacio">Esta entrada ya no existe.</p></div>` });

// ======================= Acciones (clics) =======================
const acciones = {
  conectar: (b) => conCarga(b, async () => { await conectarYSincronizar(); toast('Conectado con Google.'); render(); }),
  desconectar: () => { G.desconectar(); toast('Desconectado de Google.'); render(); },
  notas: (b) => abrirNotas(b, b.dataset.id),
  'no-asistir': (b) => modalNoAsistir(b.dataset.id),
  'crear-diario': (b) => conCarga(b, async () => { const doc = await crearDiario(b.dataset.id); toast('Diario crítico creado.', { enlace: G.enlaceDoc(doc), ms: 12000 }); render(); }),
  'marcar-enviado': (b) => { const a = S.actividad(b.dataset.id); S.actualizar(() => { a.enviado = true; a.enviadoEn = hoyISO(); }); toast('Marcado como enviado.'); render(); },
  feedback: (b) => modalFeedback(b.dataset.id),
  'no-enviar': (b) => { const a = S.actividad(b.dataset.id); S.actualizar(() => { a.noEnviar = !a.noEnviar; }); render(); },
  'add-tc': () => modalAnadirTC(),
  semana: (b) => { const d = Number(b.dataset.d); semanaOffset = d === 0 ? 0 : semanaOffset + d; render(); },
  'vista-agenda': (b) => { vistaAgenda = b.dataset.v; render(); },
  'ir-dia': (b) => { document.getElementById(`dia-${b.dataset.d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'varios-dias': () => modalVariosDias(),
  'hx-practica': (b) => modalPracticaFicha(b.dataset.id),
  'pdp-objetivo': () => { S.actualizar((s) => { if (s.pdp.objetivos.length < 3) s.pdp.objetivos.push({ id: S.nuevoId(), titulo: '', conductas: [], registro: '' }); }); render(); },
  'pdp-quitar-obj': (b) => confirmar('¿Quitar este objetivo?', 'Se borran también sus conductas.', 'Quitar', () => { S.actualizar((s) => { s.pdp.objetivos = s.pdp.objetivos.filter((o) => o.id !== b.dataset.o); }); render(); }),
  'pdp-conducta': (b) => { S.actualizar((s) => { s.pdp.objetivos.find((o) => o.id === b.dataset.o).conductas.push({ id: S.nuevoId(), texto: '', hecha: false }); }); render(); app.querySelector(`[data-o="${b.dataset.o}"][data-conducta-txt]:last-of-type`); const ts = app.querySelectorAll(`textarea[data-conducta-txt][data-o="${b.dataset.o}"]`); ts[ts.length - 1]?.focus(); },
  'pdp-quitar-conducta': (b) => { S.actualizar((s) => { const o = s.pdp.objetivos.find((x) => x.id === b.dataset.o); o.conductas = o.conductas.filter((c) => c.id !== b.dataset.c); }); render(); },
  'alias-descargar': () => descargar(new Blob([JSON.stringify(leerAlias(), null, 2)], { type: 'application/json' }), `luria-lab-alias-${hoyISO()}.json`),
  'cal-on': (b) => conCarga(b, async () => {
    await G.conectar({ calendario: true });
    if (!G.tieneCalendario()) throw new Error('Google no dio el permiso de calendario. Vuelve a intentarlo y marca la casilla del calendario.');
    S.actualizar((s) => { s.ajustes.calendarioActivo = true; });
    await sincronizarCalendario();
    toast('Listo: tu agenda ya está en el calendario «Luria Lab» de Google Calendar.', { ms: 9000 }); render();
  }),
  'cal-off': () => { S.actualizar((s) => { s.ajustes.calendarioActivo = false; }); toast('Ya no se enviarán cambios a Google Calendar. El calendario «Luria Lab» sigue ahí.'); render(); },
  'cal-borrar': () => confirmar('¿Quitar el calendario «Luria Lab»?', 'Se borra de tu Google Calendar con todos sus eventos. Tus registros en la app no se tocan.', 'Quitar', () => conCarga(null, async () => {
    if (!G.tieneCalendario()) await G.conectar({ calendario: true });
    await G.borrarCalendario(S.datos().ajustes.calendarioId);
    S.actualizar((s) => { s.ajustes.calendarioId = null; s.ajustes.eventos = {}; s.ajustes.calendarioActivo = false; });
    toast('Calendario quitado de Google Calendar.'); render();
  })),
  'quitar-logo': async () => { await idbSet('logo', null); if (logoURL) URL.revokeObjectURL(logoURL); logoURL = null; render(); },
  archivar: (b) => archivar([b.dataset.id], !filtroDiario.archivadas),
  'ver-archivadas': () => { filtroDiario.archivadas = !filtroDiario.archivadas; render(); window.scrollTo(0, 0); },
  'archivar-vacias': () => archivar(S.hechas().filter((a) => !a.archivada && sinContenido(a)).map((a) => a.id), true),
  'add-sesion': () => modalAnadirSesion(),
  filtro: (b) => { filtroDiario.tipo = b.dataset.tipo; render(); },
  'hoja-sheets': (b) => conCarga(b, async () => {
    const { id, avisos } = await hojaEnSheets();
    toast(avisos.length ? 'Hoja actualizada. ' + avisos.join(' ') : 'Hoja de horas actualizada en Google Sheets.', { enlace: G.enlaceHoja(id), texto: 'Abrir', ms: avisos.length ? 14000 : 9000 });
    render();
  }),
  'descargar-hoja': (b) => conCarga(b, async () => {
    const { blob, avisos } = await hojaBlob();
    descargar(blob, `Registro horas - ${S.datos().ajustes.nombre || 'alumno'}.xlsx`);
    toast(avisos.length ? avisos.join(' ') : 'Hoja de horas descargada.', { ms: avisos.length ? 12000 : 5000 });
  }),
  'marcar-luria': (b) => { const m = b.dataset.mes; S.actualizar((s) => { const inf = s.informes[m] || {}; if (inf.enviado) delete inf.enviado; else inf.enviado = hoyISO(); s.informes[m] = inf; }); render(); },  mensual: (b) => conCarga(b, async () => { const doc = await generarMensual(b.dataset.mes); toast('Borrador del diario mensual creado.', { enlace: G.enlaceDoc(doc), ms: 12000 }); render(); }),
  'quitar-previa': (b) => { S.actualizar((s) => { s.horasPrevias.splice(Number(b.dataset.i), 1); }); render(); },
  'nuevo-ter': () => modalTerapeuta(null, () => render()),
  'editar-ter': (b) => {
    const t = S.terapeuta(b.dataset.id);
    modalTerapeuta(t, () => render());
    const d = document.getElementById('modal');
    d.querySelector('.botones').insertAdjacentHTML('afterend', '<button type="button" class="btn texto" id="b-del-ter" style="color:var(--error)">Eliminar terapeuta</button>');
    d.querySelector('#b-del-ter').addEventListener('click', () => { S.borrar([t.id]); cerrarModal(); render(); });
  },
  'plantilla-defecto': () => { S.actualizar((s) => { s.ajustes.plantillaDiarioId = null; s.ajustes.plantillaPropia = false; }); toast('Usarás la plantilla predeterminada.'); render(); },
  copia: () => descargar(new Blob([JSON.stringify(S.datos(), null, 2)], { type: 'application/json' }), `luria-lab-copia-${hoyISO()}.json`),
  'borrar-local': () => confirmar('¿Cerrar sesión en este dispositivo?', 'Se borrarán los datos guardados en este dispositivo, incluidos los alias privados de pacientes (descárgalos antes si los quieres conservar). Si estás conectado con Google, tus registros siguen en tu Drive y volverán al conectar. Si no, descarga antes una copia de seguridad.', 'Cerrar sesión', async () => {
    G.desconectar();
    try { localStorage.clear(); } catch {}
    try { indexedDB.deleteDatabase('luria-lab'); } catch {}
    location.hash = '#/inicio'; location.reload();
  }),
};
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && acciones[b.dataset.act]) { e.preventDefault(); acciones[b.dataset.act](b, e); }
});

// ======================= Rutas =======================
const rutas = [
  [/^#\/?(inicio)?$/, () => vInicio()],
  [/^#\/agenda$/, () => vAgenda()],
  [/^#\/nueva$/, () => vNueva()],
  [/^#\/elegir\/(\w+)$/, (t) => vElegir(t)],
  [/^#\/sesion\/(.+)$/, (id) => vSesion(decodeURIComponent(id))],
  [/^#\/tc\/(.+)$/, (id) => vTC(decodeURIComponent(id))],
  [/^#\/ficha\/(.+)$/, (id) => vFicha(decodeURIComponent(id))],
  [/^#\/practica\/(.+)$/, (id) => vPractica(decodeURIComponent(id))],
  [/^#\/diario$/, () => vDiario()],
  [/^#\/caso\/(.+)$/, (c) => vCaso(c)],
  [/^#\/exportar$/, (p) => vExportar(p)],
  [/^#\/ajustes$/, () => vAjustes()],
  [/^#\/hexaflex$/, () => vHexaflex()],
  [/^#\/hexaflex\/modelo$/, () => vHxModelo()],
  [/^#\/hexaflex\/p\/(\w+)$/, (k) => vHxProceso(k)],
  [/^#\/hexaflex\/ficha\/(.+)$/, (id, p) => vHxFicha(decodeURIComponent(id), p)],
  [/^#\/pdp$/, () => vPDP()],
  [/^#\/(guia)$/, (s) => vProximamente(s)],
];
function render() {
  const [ruta, qs] = (location.hash || '#/inicio').split('?');
  const params = new URLSearchParams(qs || '');
  for (const [re, fn] of rutas) {
    const m = ruta.match(re);
    if (m) {
      const v = fn(...m.slice(1), params);
      app.innerHTML = v.html; v.mount?.(app);
      return;
    }
  }
  location.hash = '#/inicio';
}
window.addEventListener('hashchange', () => { cerrarModal(); render(); window.scrollTo(0, 0); });
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update();
    // Cuando hay una versión nueva, se recarga sola una vez
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado) { recargado = true; location.reload(); } });
  }).catch((e) => console.warn('Service worker', e));
}

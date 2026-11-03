// Luria Lab · cuadernillo de prácticas
import { CONFIG } from './config.js';
import * as S from './store.js';
import * as G from './google.js';
import * as D from './documentos.js';
import { generarHoja, leerHoja } from './hojaHoras.js';
import { Zip } from './zip.js';
import { TIPOS, TIPOS_HOJA, TEMAS, MESES, REVISIONES_PDP } from './calendario.js';
import { esc, hoyISO, sumarDias, fmtFecha, fmtCorta, fmtNum, nombreMes, toast, abrirModal, cerrarModal, conCarga, idbGet, idbSet, descargar, icon } from './ui.js';

const app = document.getElementById('app');
const RAIZ = CONFIG.CARPETA_RAIZ;
S.cargar();

// Logo del centro: se guarda solo en este dispositivo (no se publica con la app)
let logoURL = null;
idbGet('logo').then((b) => { if (b) { logoURL = URL.createObjectURL(b); render(); } }).catch(() => {});

// ======================= Sincronización con Drive =======================
let temporizador = null; let subiendo = false; let otraVez = false;
S.siempreAlGuardar(() => {
  if (!G.conectado()) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(subir, 1200);
});
async function subir() {
  if (subiendo) { otraVez = true; return; }
  subiendo = true;
  try { await G.escribirDatos(S.datos()); } catch (e) { console.warn('No se pudo sincronizar', e); }
  subiendo = false;
  if (otraVez) { otraVez = false; subir(); }
}
async function conectarYSincronizar() {
  await G.conectar();
  const remoto = await G.leerDatos();
  const remotoMasNuevo = remoto && (remoto.updatedAt || 0) > (S.datos().updatedAt || 0);
  if (remotoMasNuevo) { S.reemplazar(remoto); toast('Datos sincronizados desde tu Drive.'); }
  // Una sola vez: rehace el archivo de Drive para que no quede ninguna versión antigua con correos
  let limpio = false; try { limpio = localStorage.getItem('ll-limpieza-correos') === '1'; } catch {}
  if (!limpio) { await G.recrearDatos(S.datos()); try { localStorage.setItem('ll-limpieza-correos', '1'); } catch {} }
  else if (!remotoMasNuevo) await G.escribirDatos(S.datos());
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
const primerNombre = () => (S.datos().ajustes.nombre || '').trim().split(/\s+/)[0];

function titulo(a) {
  if (esSesion(a)) return `${nombreTipo(a)} · Caso ${a.caso || '—'}`;
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
  const dir = await G.carpeta([RAIZ, 'Casos', `Caso ${codigo}`], S.datos().ajustes.carpetas);
  const nombre = `Caso ${codigo} – S${S.numeroSesion(a)} – ${nombreTipo(a)} – ${fmtNum(a.fecha).replaceAll('/', '-')}`;
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
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    d.querySelector('#f-ter').addEventListener('submit', (e) => {
      e.preventDefault(); const v = leerForm(e.target);
      let ter = t;
      S.actualizar((s) => { if (ter) Object.assign(ter, { nombre: v.nombre.trim() }); else { ter = { id: S.nuevoId(), nombre: v.nombre.trim() }; s.terapeutas.push(ter); } });
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
  const fila = (i) => `<div class="dos-col" data-fila><div class="campo"><label for="tc-f${i}">Fecha</label><input type="date" id="tc-f${i}" name="fecha" required></div><div class="campo"><label for="tc-h${i}">Hora</label><input type="time" id="tc-h${i}" name="hora"></div></div>`;
  let n = 1;
  abrirModal(`<h2>Tutorías de caso del mes</h2>
  <p class="suave pequeno">Añade las fechas que os han convocado.</p>
  <form id="f-tc" class="seccion"><div id="filas" class="seccion">${fila(0)}</div>
    <button type="button" class="btn linea" id="b-otra">${icon('mas', 18)}Añadir otra fecha</button>
    <div class="botones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Guardar</button></div>
  </form>`, (d) => {
    d.querySelector('#b-otra').addEventListener('click', () => { d.querySelector('#filas').insertAdjacentHTML('beforeend', fila(n++)); });
    d.querySelector('#f-tc').addEventListener('submit', (e) => {
      e.preventDefault();
      const filas = [...d.querySelectorAll('[data-fila]')].map((f) => ({ fecha: f.querySelector('[name=fecha]').value, hora: f.querySelector('[name=hora]').value })).filter((f) => f.fecha);
      S.actualizar((s) => { for (const f of filas) s.actividades.push({ id: S.nuevoId(), tipo: 'tutoria_caso', fecha: f.fecha, hora: f.hora, estado: 'programada', formato: 'zoom', temas: [] }); });
      cerrarModal(); toast(`${filas.length} tutoría${filas.length === 1 ? '' : 's'} de caso añadida${filas.length === 1 ? '' : 's'}.`); render();
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
    <span class="item-texto"><span class="tipo c-${color(a)}">${esc(nombreTipo(a))}${sub ? ' · ' + sub : ''}</span><span style="font-size:16px;font-weight:700">${esc(esSesion(a) ? `Caso ${a.caso} · sesión ${S.numeroSesion(a)}` : a.tipo === 'tutoria_caso' ? titulo(a) : a.titulo || titulo(a))}</span></span>
    <span style="font-size:15px;font-weight:700">${esc(a.hora || '')}</span></div>
    <div class="botones" style="align-items:center">${botones}</div></div>`;
}

function pendientes() {
  const s = S.datos(); const hoy = hoyISO(); const lista = [];
  if (s.horasPrevias.length) lista.push({ ic: 'reloj', c: 'ambar', t: 'Revisa tus totales antiguos sin día', s: 'Pueden contar dos veces y no marcan casillas en la hoja', h: '#/ajustes' });
  for (const a of s.actividades.filter((x) => x.estado === 'programada' && x.fecha < hoy && x.fecha >= sumarDias(hoy, -45)).sort(porFechaHora)) {
    lista.push({ ic: 'reloj', c: 'ambar', t: `¿Completas ${a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario' ? 'la ficha de ' : ''}${titulo(a)}?`, s: fmtFecha(a.fecha) + ' · sin registrar', h: rutaForm(a) });
  }
  for (const a of S.hechas().filter((x) => esSesion(x) && !x.pasada && x.caso)) {
    if (!a.docId) lista.push({ ic: 'doc', c: 'ambar', t: 'Crear diario crítico', s: `Caso ${a.caso} · ${fmtCorta(a.fecha)}`, h: `#/caso/${encodeURIComponent(a.caso.trim())}` });
    else if (!a.enviado && !a.noEnviar) lista.push({ ic: 'correo', c: 'ambar', t: 'Enviar diario crítico al terapeuta', s: `Caso ${a.caso} · ${nombreTipo(a).toLowerCase()} del ${fmtCorta(a.fecha)}`, h: `#/caso/${encodeURIComponent(a.caso.trim())}` });
  }
  for (const a of S.hechas().filter((x) => x.tipo === 'tutoria_metodologica' && x.tarea?.docId && !x.tarea?.enviada)) {
    lista.push({ ic: 'birrete', c: 'morado', t: `Enviar la tarea de la T. metodológica ${a.numero}`, s: a.titulo, h: rutaForm(a) });
  }
  const d = new Date(); const dia = d.getDate();
  const mesPrev = hoyISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
  if (dia <= 10 && S.hechas().some((a) => a.fecha.startsWith(mesPrev)) && !s.informes[mesPrev]?.enviado) {
    lista.push({ ic: 'hoja', c: 'verde', t: `Hoja de horas de ${nombreMes(mesPrev).split(' ')[0].toLowerCase()} lista`, s: 'Revísala y envíala a Luria', h: `#/exportar?mes=${mesPrev}` });
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
    ? `<section class="banda"><b>${G.conectadoAntes() ? 'Vuelve a conectar con Google' : 'Conecta tu cuenta de Google'}</b><p>Para crear tus documentos en Drive y tener tus registros en todos tus dispositivos. La app no tiene acceso a tu correo.</p><button class="btn" data-act="conectar">Conectar con Google</button></section>`
    : !G.configurado() ? `<div class="aviso-caja">${icon('candado', 18)}<span>Modo prueba: tus datos se guardan solo en este dispositivo.</span></div>` : '';
  const empezar = !s.ajustes.nombre || !s.ajustes.plantillaHorasNombre
    ? `<a href="#/ajustes" class="item">${'<span class="icono-caja bg-verde">' + icon('ajustes', 20) + '</span>'}<span class="item-texto"><span class="item-titulo">Termina de configurar la app</span><span class="item-sub">${!s.ajustes.nombre ? 'Tu nombre' : ''}${!s.ajustes.nombre && !s.ajustes.plantillaHorasNombre ? ' y ' : ''}${!s.ajustes.plantillaHorasNombre ? 'la plantilla de horas de Luria' : ''}</span></span></a>` : '';
  return {
    html: `<div class="pantalla">
    <header class="cabecera-marca">
      <div>${logoURL ? `<img src="${logoURL}" alt="Luria Lab" class="logo-centro">` : '<span class="marca">Luria Lab</span>'}<h1 class="titulo">Hola${primerNombre() ? ', ' + esc(primerNombre()) : ''}</h1><p class="suave" style="font-size:14px">${esc(fmtFecha(hoy))}</p></div>
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
function vAgenda() {
  const s = S.datos(); const hoy = hoyISO();
  const proximas = s.actividades.filter((a) => a.estado === 'programada' && a.fecha >= hoy).sort(porFechaHora);
  let html = ''; let diaActual = '';
  for (const a of proximas) {
    if (a.fecha !== diaActual) { diaActual = a.fecha; html += `<h2 class="etiqueta-grupo">${a.fecha === hoy ? 'Hoy · ' : ''}${esc(fmtFecha(a.fecha))}</h2>`; }
    const sub = esSesion(a) ? `${a.hora || 'sin hora'} · ${a.formato === 'online' ? 'online' : 'presencial'}` : a.tipo === 'tutoria_metodologica' ? `${esc(a.titulo)} · 10-14 h` : a.tipo === 'seminario' ? esc(a.titulo) : (a.hora || 'sin hora') + ' · Zoom';
    html += `<a href="${rutaForm(a)}" class="item"><span class="dot ${color(a)}"></span><span class="item-texto"><span class="item-titulo">${esc(esSesion(a) ? titulo(a) : a.tipo === 'tutoria_metodologica' ? `T. metodológica ${a.numero}` : a.tipo === 'seminario' ? `Seminario ${a.numero}` : titulo(a))}</span><span class="item-sub">${sub}</span></span>${REVISIONES_PDP.includes(a.numero) && a.tipo === 'tutoria_metodologica' ? '<span class="insignia">Revisión PDP</span>' : ''}</a>`;
  }
  return {
    html: `<div class="pantalla sin-nav">${volver('#/inicio', 'Agenda')}
    <section class="tarjeta"><span class="item-texto"><span style="font-size:16px;font-weight:700">Planificar</span><span class="item-sub" style="line-height:1.4">Las tutorías metodológicas y los seminarios ya están cargados con el calendario de Luria. Añade lo que te convoquen.</span></span>
      <button class="btn linea" data-act="add-tc">${icon('mas', 18)}Tutorías de caso del mes</button>
      <button class="btn linea" data-act="add-sesion">${icon('mas', 18)}Espejo o coterapia asignado</button></section>
    ${html || '<p class="vacio">No hay nada planificado.</p>'}</div>`,
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
        S.actualizar((s) => { s.actividades = s.actividades.filter((x) => x.id !== a.id); }); toast('Sesión eliminada.'); irA('#/inicio');
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
        S.actualizar((s) => { s.actividades = s.actividades.filter((x) => x.id !== a.id); }); irA('#/inicio');
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
        S.actualizar((s) => { s.actividades = s.actividades.filter((x) => x.id !== a.id); }); irA('#/diario');
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
    const etiqueta = esSesion(a) ? `${nombreTipo(a)} · Caso ${a.caso || '—'}` : (a.tipo === 'tutoria_metodologica' || a.tipo === 'seminario') ? `${nombreTipo(a)}${a.numero ? ' ' + a.numero : ''}` : nombreTipo(a);
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
    <div class="item-texto"><h1 class="titulo" style="font-size:30px">Caso ${esc(codigo)}</h1>
    <span class="suave pequeno">${ultima ? 'Terapeuta: ' + esc(S.terapeuta(ultima.terapeutaId)?.nombre || '') + ' · ' : ''}${hechasC.length} sesi${hechasC.length === 1 ? 'ón' : 'ones'}${hechasC[0] ? ' · desde el ' + esc(fmtCorta(hechasC[0].fecha)) : ''}</span></div>
    <div class="seccion">${tarjetas}</div></div>`,
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
async function generarMensual(mes) {
  await google();
  const s = S.datos();
  const delMes = S.hechas().filter((a) => a.fecha.startsWith(mes)).sort(porFechaHora);
  // De los casos solo se ponen enlaces: la app no lee lo que escribes sobre los pacientes
  const sesiones = delMes.filter(esSesion).map((a) => ({
    titulo: `${nombreTipo(a)} · Caso ${a.caso || '—'} · ${fmtNum(a.fecha)}`,
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
      <button class="btn primario" data-act="descargar-hoja">${icon('descargar', 16)}Descargar hoja de horas (.xlsx)</button>
      <span class="mini suave" style="line-height:1.4">El archivo incluye todos los meses con lo que has registrado. Envíalo desde tu correo junto con el diario crítico del mes.</span>
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
      ${s.horasPrevias.length ? `<div class="aviso-caja">${icon('reloj', 18)}<span>Totales sin día añadidos antes (cuentan en tus horas pero no se marcan en la hoja): ${s.horasPrevias.map((p, i) => `${esc(nombreMes(p.mes))} · ${esc(TIPOS[p.tipo].nombre)} · ${p.sesiones} <button class="btn texto pequeno" data-act="quitar-previa" data-i="${i}">quitar</button>`).join(' · ')}</span></div>` : ''}
    </div>

    <h2 class="etiqueta-grupo">Mis terapeutas</h2>
    <div class="tarjeta lista">
      ${s.terapeutas.map((t) => `<button class="fila" data-act="editar-ter" data-id="${esc(t.id)}"><span class="item-texto"><span style="font-size:15px">${esc(t.nombre)}</span></span>${icon('sig', 18)}</button>`).join('')}
      <button class="fila" data-act="nuevo-ter" style="color:var(--verde);font-weight:700;justify-content:flex-start">${icon('mas', 18)} Añadir terapeuta</button>
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
    <p class="mini suave" style="text-align:center">Luria Lab · versión 1.6.0</p>
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
  'varios-dias': () => modalVariosDias(),
  'quitar-logo': async () => { await idbSet('logo', null); if (logoURL) URL.revokeObjectURL(logoURL); logoURL = null; render(); },
  archivar: (b) => archivar([b.dataset.id], !filtroDiario.archivadas),
  'ver-archivadas': () => { filtroDiario.archivadas = !filtroDiario.archivadas; render(); window.scrollTo(0, 0); },
  'archivar-vacias': () => archivar(S.hechas().filter((a) => !a.archivada && sinContenido(a)).map((a) => a.id), true),
  'add-sesion': () => modalAnadirSesion(),
  filtro: (b) => { filtroDiario.tipo = b.dataset.tipo; render(); },
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
    d.querySelector('#b-del-ter').addEventListener('click', () => { S.actualizar((s) => { s.terapeutas = s.terapeutas.filter((x) => x.id !== t.id); }); cerrarModal(); render(); });
  },
  'plantilla-defecto': () => { S.actualizar((s) => { s.ajustes.plantillaDiarioId = null; s.ajustes.plantillaPropia = false; }); toast('Usarás la plantilla predeterminada.'); render(); },
  copia: () => descargar(new Blob([JSON.stringify(S.datos(), null, 2)], { type: 'application/json' }), `luria-lab-copia-${hoyISO()}.json`),
  'borrar-local': () => confirmar('¿Cerrar sesión en este dispositivo?', 'Se borrarán los datos guardados en este dispositivo. Si estás conectado con Google, tus registros siguen en tu Drive y volverán al conectar. Si no, descarga antes una copia de seguridad.', 'Cerrar sesión', async () => {
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
  [/^#\/(guia|pdp|hexaflex)$/, (s) => vProximamente(s)],
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

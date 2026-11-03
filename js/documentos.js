// Contenido de los documentos que crea la app (se suben como HTML y Google los convierte en Docs)
import { esc, fmtNum, fmtFecha, nombreMes } from './ui.js';
import { TIPOS } from './calendario.js';

const estilo = 'font-family:Arial,sans-serif;font-size:11pt;';
const guia = (t) => `<p style="color:#666666"><i>${t}</i></p>`;

// Plantilla predeterminada del diario crítico. Las marcas {{…}} se rellenan al crear cada diario.
export function plantillaDiario() {
  return `<html><body style="${estilo}">
<h1>CASO Nº: {{CASO}}</h1>
<p><b>Fecha:</b> {{FECHA}}<br><b>Tipo de sesión:</b> {{TIPO}} ({{FORMATO}})<br><b>Duración:</b> {{DURACION}}<br><b>Terapeuta:</b> {{TERAPEUTA}}<br><b>Código de paciente:</b> {{CODIGO}}</p>
<h2>RESUMEN DE LA SESIÓN</h2>
${guia('¿Qué ha ocurrido? ¿Cuáles han sido los temas, acontecimientos o momentos principales?')}
<p></p>
<h2>INTERVENCIONES, HABILIDADES Y PROCESOS CLÍNICOS RELEVANTES</h2>
${guia('¿Qué ha hecho el terapeuta y cómo se ha relacionado con el paciente? ¿Qué intervenciones me han llamado la atención y qué función creo que podían tener? Interacciones, procesos de flexibilidad psicológica, conductas clínicamente relevantes, intervención del terapeuta / manejo de contingencias y reflexión personal.')}
<p></p>
<h2>REFLEXIÓN Y SEGUIMIENTO</h2>
${guia('¿Qué haría yo como terapeuta? ¿Qué información falta recoger? ¿Qué quiero observar o trabajar en la próxima sesión?')}
<p></p>
<h2>NOTAS EN CALIENTE</h2>
<p>{{NOTAS}}</p>
<h2>FEEDBACK DEL TERAPEUTA</h2>
</body></html>`;
}

export function marcasDiario({ numero, codigo, fecha, tipo, formato, duracion, terapeuta, notas }) {
  return {
    CASO: numero, CODIGO: codigo, FECHA: fmtNum(fecha), TIPO: TIPOS[tipo]?.nombre || tipo,
    FORMATO: formato === 'online' ? 'online' : 'presencial', DURACION: duracion, TERAPEUTA: terapeuta || '—',
    NOTAS: notas || '—',
  };
}

export function documentoNotas(titulo, fecha) {
  return `<html><body style="${estilo}"><h1>Notas · ${esc(titulo)}</h1><p>${esc(fmtFecha(fecha))}</p><p></p></body></html>`;
}

export function documentoTarea(titulo, fecha, enunciado) {
  return `<html><body style="${estilo}"><h1>Tarea · ${esc(titulo)}</h1><p>${esc(fmtFecha(fecha))}</p>${enunciado ? `<p><i>${esc(enunciado)}</i></p>` : ''}<p></p></body></html>`;
}

const parrafos = (t) => esc(t || '').split(/\n+/).filter(Boolean).map((p) => `<p>${p}</p>`).join('') || '<p>—</p>';

// Diario crítico mensual: compila todas las actividades del mes, ordenadas por tipo
export function diarioMensual({ mes, nombre, sesiones, tutoriasCaso, metodologicas, seminarios, practicas }) {
  const sec = [];
  sec.push(`<h1>Diario crítico · ${esc(nombreMes(mes))}</h1>${nombre ? `<p>${esc(nombre)}</p>` : ''}`);
  sec.push(`<h2>Síntesis del mes</h2>
${guia('Escribe aquí tu síntesis a partir de lo que tienes debajo.')}
<p><b>¿Qué he aprendido este mes?</b></p><p></p>
<p><b>¿Qué me está costando?</b></p><p></p>
<p><b>¿Qué quiero trabajar el mes que viene?</b></p><p></p>`);
  if (sesiones.length) {
    sec.push('<h2>Espejos y coterapias</h2>');
    for (const s of sesiones) sec.push(`<h3>${esc(s.titulo)}</h3>${s.texto ? parrafos(s.texto) : guia('Diario crítico sin texto todavía.')}`);
  }
  if (tutoriasCaso.length) {
    sec.push('<h2>Tutorías de caso</h2>');
    for (const t of tutoriasCaso) sec.push(`<p><b>${esc(fmtNum(t.fecha))}${t.terapeuta ? ' · ' + esc(t.terapeuta) : ''}:</b> ${esc(t.aprendizaje || '—')}</p>`);
  }
  if (metodologicas.length) {
    sec.push('<h2>Tutorías metodológicas</h2>');
    for (const t of metodologicas) sec.push(`<h3>${esc(t.titulo)}</h3><p><b>Idea clave:</b> ${esc(t.idea || '—')}</p>${t.aplica ? `<p><b>Cómo lo aplico:</b> ${esc(t.aplica)}</p>` : ''}`);
  }
  if (seminarios.length) {
    sec.push('<h2>Seminarios</h2>');
    for (const t of seminarios) sec.push(`<h3>${esc(t.titulo)}</h3><p><b>Idea clave:</b> ${esc(t.idea || '—')}</p>${t.aplica ? `<p><b>Cómo lo aplico:</b> ${esc(t.aplica)}</p>` : ''}`);
  }
  if (practicas.length) {
    sec.push('<h2>Prácticas de mi PDP</h2>');
    for (const p of practicas) sec.push(`<p><b>${esc(fmtNum(p.fecha))} · ${esc(p.titulo)}:</b> ${esc(p.descripcion || '')}</p>`);
  }
  return `<html><body style="${estilo}">${sec.join('\n')}</body></html>`;
}

// Quita del texto exportado de un diario las líneas de guía de la plantilla
export function limpiarDiario(texto) {
  return texto.replace(/\r/g, '').split('\n').map((l) => l.trim())
    .filter((l) => l && !/^¿Qué ha ocurrido\?|^¿Qué ha hecho el terapeuta|^¿Qué haría yo como terapeuta/.test(l))
    .join('\n');
}

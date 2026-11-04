// Contenido de los documentos que crea la app (se suben como HTML y Google los convierte en Docs)
import { esc, fmtNum, fmtFecha, nombreMes } from './ui.js';
import { TIPOS } from './calendario.js';

const estilo = 'font-family:Arial,sans-serif;font-size:11pt;';
const guia = (t) => `<p style="color:#666666"><i>${t}</i></p>`;

// La plantilla predeterminada del diario crítico es plantillas/diario-critico.docx (marcas {{…}}).
export function marcasDiario({ numero, codigo, inicial, fecha, tipo, formato, duracion, terapeuta, notas }) {
  const paciente = `${codigo}${inicial ? ' ' + inicial.toUpperCase() : ''}`;
  return {
    CASO: numero, CODIGO: paciente, PACIENTE: paciente, FECHA: fmtNum(fecha), TIPO: TIPOS[tipo]?.nombre || tipo,
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
    for (const s of sesiones) sec.push(`<h3>${s.enlace ? `<a href="${esc(s.enlace)}">${esc(s.titulo)}</a>` : esc(s.titulo)}</h3>${guia(s.enlace ? 'Resume aquí lo esencial de este diario (abre el enlace para consultarlo).' : 'Esta sesión no tiene diario crítico en la app.')}<p></p>`);
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

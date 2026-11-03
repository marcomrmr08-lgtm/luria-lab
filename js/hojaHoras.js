// Rellena la plantilla oficial de Luria (Registro de horas) sin reconstruirla:
// solo cambia el valor de las casillas, el nombre y los totales en caché.
// Así se conservan las casillas nativas de Excel, el logo y el formato.
import { Zip } from './zip.js';

const COLUMNAS = {
  coterapia: ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  espejo: ['J', 'K', 'L', 'M'],
  tutoria_metodologica: ['N'],
  tutoria_caso: ['O'],
  seminario: ['P'],
};
const TODAS = 'BCDEFGHIJKLMNOP'.split('');
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NOMBRE_TIPO = { coterapia: 'coterapia', espejo: 'espejo', tutoria_metodologica: 'tutoría metodológica', tutoria_caso: 'tutoría de caso', seminario: 'seminario' };

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Relaciona cada mes (1-12) con el archivo XML de su pestaña, leyendo el nombre de la pestaña
async function hojasPorMes(zip) {
  const wb = await zip.texto('xl/workbook.xml');
  const rels = await zip.texto('xl/_rels/workbook.xml.rels');
  const destino = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const t = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && t) destino[id] = 'xl/' + t.replace(/^\/?xl\//, '');
  }
  const porMes = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = quitarTildes(m[0].match(/name="([^"]+)"/)?.[1] || '');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const mes = NOMBRES_MES.findIndex((n) => nombre.startsWith(n));
    if (mes >= 0 && destino[rid]) porMes[mes + 1] = destino[rid];
  }
  return porMes;
}

// actividades: [{tipo, fecha:'YYYY-MM-DD'}] → casillas por mes
export function asignarCasillas(actividades) {
  const porMes = {}; const avisos = []; const usadas = {};
  const orden = [...actividades].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const a of orden) {
    const cols = COLUMNAS[a.tipo];
    if (!cols) continue;
    const [, m, d] = a.fecha.split('-').map(Number);
    const k = `${m}|${d}|${a.tipo}`;
    const n = usadas[k] || 0;
    if (n >= cols.length) {
      avisos.push(`El ${d}/${m} hay más de ${cols.length} ${NOMBRE_TIPO[a.tipo]}${cols.length > 1 ? 's' : ''} y la plantilla no tiene más casillas: anótalo a mano.`);
      continue;
    }
    usadas[k] = n + 1;
    (porMes[m] = porMes[m] || {})[`${cols[n]}${7 + d}`] = true;
  }
  return { porMes, avisos };
}

export function rellenarHojaXml(xml, marcadas) {
  xml = xml.replace(/<c r="([B-P])(\d+)"([^>]*?)t="b"([^>]*)><v>[01]<\/v><\/c>/g, (todo, col, fila, a, b) => {
    const f = Number(fila);
    if (f < 8 || f > 38) return todo;
    return `<c r="${col}${fila}"${a}t="b"${b}><v>${marcadas[`${col}${fila}`] ? 1 : 0}</v></c>`;
  });
  for (const col of TODAS) {
    let total = 0;
    for (let f = 8; f <= 38; f++) if (marcadas[`${col}${f}`]) total++;
    const re = new RegExp(`(<c r="${col}39"[^>]*>(?:<f[^>]*/>|<f[^>]*>[^<]*</f>))<v>[^<]*</v>`);
    xml = xml.replace(re, `$1<v>${total}</v>`);
  }
  return xml;
}

export async function generarHoja(plantilla, actividades, nombre) {
  const zip = await Zip.abrir(plantilla);
  const textos = (await zip.texto('xl/sharedStrings.xml')) || '';
  if (!textos.includes('REGISTRO HORAS')) throw new Error('El archivo no parece la plantilla de registro de horas de Luria.');

  const hojas = await hojasPorMes(zip);
  const { porMes, avisos } = asignarCasillas(actividades);
  for (const [mes, ruta] of Object.entries(hojas)) {
    const xml = await zip.texto(ruta); if (xml == null) continue;
    const nuevo = rellenarHojaXml(xml, porMes[mes] || {});
    if (nuevo !== xml) await zip.poner(ruta, nuevo);
  }
  for (const mes of Object.keys(porMes)) if (!hojas[mes]) avisos.push(`La plantilla no tiene pestaña para el mes ${mes}.`);

  if (nombre) {
    await zip.poner('xl/sharedStrings.xml', textos.replace(
      /<si><t xml:space="preserve">Nombre y apellidos: [^<]*<\/t><\/si>/,
      `<si><t xml:space="preserve">Nombre y apellidos: ${escXml(nombre)}</t></si>`));
  }
  const wb = await zip.texto('xl/workbook.xml');
  await zip.poner('xl/workbook.xml', wb.replace(/<calcPr([^>]*?)\/>/, (t, at) => at.includes('fullCalcOnLoad') ? t : `<calcPr${at} fullCalcOnLoad="1"/>`));

  const blob = zip.generar('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return { blob, avisos };
}

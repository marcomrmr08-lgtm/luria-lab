// Lector/escritor ZIP mínimo (un .xlsx es un ZIP), sin librerías externas.
// Usa la compresión nativa del navegador (CompressionStream 'deflate-raw').
// Las entradas que no se modifican se copian tal cual, sin recomprimir.

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = TABLA[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function transformar(u8, stream) {
  const s = new Blob([u8]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const inflar = (u8) => transformar(u8, new DecompressionStream('deflate-raw'));
const desinflar = (u8) => transformar(u8, new CompressionStream('deflate-raw'));

export class Zip {
  constructor(entradas) { this.entradas = entradas; } // [{nombre, metodo, crc, tam, comprimido, fecha, hora, nuevo?}]

  static async abrir(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('El archivo no es un .xlsx válido.');
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entradas = [];
    for (let i = 0; i < total; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El .xlsx está dañado.');
      const metodo = dv.getUint16(p + 10, true);
      const hora = dv.getUint16(p + 12, true), fecha = dv.getUint16(p + 14, true);
      const crc = dv.getUint32(p + 16, true);
      const tamC = dv.getUint32(p + 20, true), tam = dv.getUint32(p + 24, true);
      const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const nombre = dec.decode(u8.subarray(p + 46, p + 46 + ln));
      const lnL = dv.getUint16(off + 26, true), leL = dv.getUint16(off + 28, true);
      const ini = off + 30 + lnL + leL;
      entradas.push({ nombre, metodo, crc, tam, comprimido: u8.slice(ini, ini + tamC), fecha, hora });
      p += 46 + ln + le + lc;
    }
    return new Zip(entradas);
  }

  existe(nombre) { return this.entradas.some((e) => e.nombre === nombre); }

  async texto(nombre) {
    const e = this.entradas.find((x) => x.nombre === nombre);
    if (!e) return null;
    const datos = e.metodo === 0 ? e.comprimido : await inflar(e.comprimido);
    return new TextDecoder().decode(datos);
  }

  async poner(nombre, texto) {
    const datos = new TextEncoder().encode(texto);
    const e = this.entradas.find((x) => x.nombre === nombre);
    const nueva = { nombre, metodo: 8, crc: crc32(datos), tam: datos.length, comprimido: await desinflar(datos), fecha: e?.fecha ?? 0x5b61, hora: e?.hora ?? 0 };
    if (e) Object.assign(e, nueva); else this.entradas.push(nueva);
  }

  generar(tipo = 'application/zip') {
    const enc = new TextEncoder();
    const partes = []; const central = []; let off = 0;
    for (const e of this.entradas) {
      const n = enc.encode(e.nombre);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, e.metodo, true); h.setUint16(10, e.hora, true); h.setUint16(12, e.fecha, true);
      h.setUint32(14, e.crc, true); h.setUint32(18, e.comprimido.length, true); h.setUint32(22, e.tam, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), n, e.comprimido);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, e.metodo, true); c.setUint16(12, e.hora, true); c.setUint16(14, e.fecha, true);
      c.setUint32(16, e.crc, true); c.setUint32(20, e.comprimido.length, true); c.setUint32(24, e.tam, true);
      c.setUint16(28, n.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), n);
      off += 30 + n.length + e.comprimido.length;
    }
    const tamCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, this.entradas.length, true); fin.setUint16(10, this.entradas.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: tipo });
  }
}

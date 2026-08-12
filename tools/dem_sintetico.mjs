/* Generador de teselas DEM sintéticas CONTINUAS (formato terrarium: e = R*256 + G + B/256 - 32768).
   La primera versión del banco servía SIEMPRE la misma tesela: en una planta pequeña (Fayón,
   Bagnarelli) da igual porque solo se piden una o dos, pero en Páramo (1,2 km) se piden decenas y
   la tesela repetida creaba un diente de sierra con acantilados de 100 m en cada costura. Los
   postes salían a ±90 m de la malla y parecía un fallo del visor cuando era del banco.
   Aquí la cota es función de la POSICIÓN GLOBAL del píxel, así que las teselas casan entre sí y
   la rampa es la misma con independencia del tamaño de la planta.                              */
import zlib from 'node:zlib';

const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

/** PNG RGB de 256x256 a partir de una función cota(px,py) en metros. */
export function teselaTerrarium(z, x, y, cota) {
  const N = 256, filas = Buffer.alloc(N * (1 + N * 3));
  for (let j = 0; j < N; j++) {
    const off = j * (1 + N * 3); filas[off] = 0;                 // filtro 0 (None)
    for (let i = 0; i < N; i++) {
      const v = Math.round((cota(x * N + i, y * N + j, z) + 32768) * 256);
      const p = off + 1 + i * 3;
      filas[p] = (v >> 16) & 0xff; filas[p + 1] = (v >> 8) & 0xff; filas[p + 2] = v & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bits, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(filas, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Relieve ondulado continuo: dos senos cruzados de amplitud `amp` (m) y longitud de onda `L` (m).
    Es CONTINUO en todo el planeta —no depende de dónde caiga la planta— y acotado, así que se puede
    comparar contra él. Con amp 25 y L 800 la pendiente máxima es 2*pi*25/800 = 20%, de sobra para
    destapar cualquier cosa que se apoye en la cota equivocada. */
export function relieve(amp = 25, L = 800, base = 300) {
  return (px, py, z) => {
    const mpp = 156543.03392 / Math.pow(2, z);                   // m/píxel (ecuador; basta, es sintético)
    const k = 2 * Math.PI * mpp / L;
    return base + amp * Math.sin(px * k) + amp * Math.sin(py * k);
  };
}

/** Extrae z/x/y de una URL de elevation-tiles-prod (…/terrarium/{z}/{x}/{y}.png). */
export function zxy(url) {
  const m = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
  return m ? { z: +m[1], x: +m[2], y: +m[3] } : null;
}

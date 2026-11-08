// Ilustraciones animadas de los seis procesos del Hexaflex: minimalistas, con luz suave y ritmo lento.
// El color sale de --c (color del pilar). Se quedan quietas si el sistema pide menos movimiento.
const luz = (id, opac = 0.55) => `<radialGradient id="${id}"><stop offset="0" class="luz-c" stop-opacity="${opac}"/><stop offset="1" class="luz-c" stop-opacity="0"/></radialGradient>`;
const marco = (k, defs, interior, texto) => `<figure class="ilus ilus-${k}" aria-hidden="true"><svg viewBox="0 0 320 160" role="presentation"><defs>${defs}</defs>${interior}</svg></figure>`;
// Pétalo de loto centrado en (cx, base), girado «a» grados
const petalo = (a, h = 46, w = 16) => `<path d="M160 118 C ${160 - w} ${118 - h * 0.45}, ${160 - w * 0.4} ${118 - h * 0.9}, 160 ${118 - h} C ${160 + w * 0.4} ${118 - h * 0.9}, ${160 + w} ${118 - h * 0.45}, 160 118 Z" transform="rotate(${a} 160 118)" class="linea"/>`;

export const ILUSTRACION = {
  // Aceptación: un loto abierto recibe una luz que baja y se posa en él
  aceptacion: marco('aceptacion', luz('l-acep', 0.42),
    `<circle cx="160" cy="92" r="64" fill="url(#l-acep)" class="halo"/>
    <g transform="translate(160 118) scale(1.3) translate(-160 -118)">${petalo(-62, 34, 13)}${petalo(62, 34, 13)}${petalo(-32, 42, 15)}${petalo(32, 42, 15)}${petalo(0, 50, 16)}</g>
    <path d="M90 121 Q160 135 230 121" class="linea fina"/>
    <circle cx="160" cy="14" r="4.5" class="punto baja"/>`,
    'Hacer sitio a lo que aparece, con amabilidad'),
  // Defusión: hojas en el río, cada una con un pensamiento, que la corriente se lleva
  defusion: marco('defusion', luz('l-def', 0.25),
    `<ellipse cx="160" cy="96" rx="150" ry="46" fill="url(#l-def)"/>
    <path d="M10 92 C 70 78, 120 106, 180 92 S 280 80, 310 90" class="linea fina agua a1"/>
    <path d="M10 112 C 80 100, 130 124, 200 110 S 290 102, 310 110" class="linea fina agua a2"/>
    <path d="M10 132 C 70 124, 140 142, 210 130 S 290 124, 310 130" class="linea fina agua a3"/>
    <g class="hoja h1"><path d="M0 0 C 10 -12, 30 -12, 40 0 C 30 12, 10 12, 0 0 Z" class="lleno-suave"/><path d="M4 0 H36" class="linea fina"/></g>
    <g class="hoja h2"><path d="M0 0 C 8 -10, 24 -10, 32 0 C 24 10, 8 10, 0 0 Z" class="lleno-suave"/><path d="M4 0 H28" class="linea fina"/></g>`,
    'Pensamientos que pasan, como hojas en el río'),
  // Momento presente: una luz que respira y ondas lentas, sobre el horizonte
  presente: marco('presente', luz('l-pres', 0.45),
    `<circle cx="160" cy="80" r="70" fill="url(#l-pres)" class="halo"/>
    <circle cx="160" cy="80" r="26" class="linea fina onda o1"/><circle cx="160" cy="80" r="26" class="linea fina onda o2"/><circle cx="160" cy="80" r="26" class="linea fina onda o3"/>
    <circle cx="160" cy="80" r="11" class="punto respira"/>
    <path d="M40 140 H280" class="linea fina" opacity=".5"/>`,
    'Aquí y ahora, una respiración cada vez'),
  // Yo como contexto: el cielo permanece; las estrellas brillan y las nubes pasan
  yo: marco('yo', luz('l-yo', 0.3),
    `<ellipse cx="160" cy="80" rx="140" ry="70" fill="url(#l-yo)"/>
    <path d="M70 78 a90 90 0 0 1 180 0" class="linea fina" opacity=".45"/>
    <g class="estrellas"><circle cx="92" cy="40" r="2.4" class="punto e1"/><circle cx="210" cy="30" r="2" class="punto e2"/><circle cx="246" cy="62" r="2.6" class="punto e3"/><circle cx="130" cy="22" r="1.8" class="punto e4"/><circle cx="176" cy="54" r="1.6" class="punto e2"/></g>
    <g class="nube n1"><path d="M0 0 h56 a10 10 0 0 0 -12 -14 a16 16 0 0 0 -28 -4 a12 12 0 0 0 -16 18 Z" class="lleno-suave"/></g>
    <g class="nube n2"><path d="M0 0 h40 a8 8 0 0 0 -9 -10 a12 12 0 0 0 -20 -3 a9 9 0 0 0 -11 13 Z" class="lleno-suave"/></g>
    <path d="M40 140 H280" class="linea fina" opacity=".5"/>`,
    'Eres el cielo; lo demás pasa por él'),
  // Valores: una estrella guía con rayos lentos sobre el horizonte
  valores: marco('valores', luz('l-val', 0.45),
    `<circle cx="160" cy="62" r="62" fill="url(#l-val)" class="halo"/>
    <g class="rayos">${Array.from({ length: 12 }, (_, i) => `<path d="M160 ${i % 2 ? 34 : 26} V${i % 2 ? 22 : 10}" transform="rotate(${i * 30} 160 62)" class="linea fina"/>`).join('')}</g>
    <path d="M160 40 L166 56 L182 62 L166 68 L160 84 L154 68 L138 62 L154 56 Z" class="punto brilla"/>
    <path d="M30 140 H290" class="linea fina" opacity=".5"/><path d="M160 140 L160 104" class="linea fina" stroke-dasharray="2 5" opacity=".6"/>`,
    'Una dirección que guía, sin final'),
  // Acción comprometida: piedras que se iluminan, una a una, hacia el amanecer
  accion: marco('accion', luz('l-acc', 0.45),
    `<circle cx="252" cy="104" r="64" fill="url(#l-acc)" class="halo"/>
    <path d="M214 104 a38 38 0 0 1 76 0" class="linea"/>
    <path d="M20 104 H300" class="linea fina" opacity=".5"/>
    <g class="piedras"><ellipse cx="54" cy="140" rx="13" ry="5" class="punto p1"/><ellipse cx="96" cy="132" rx="12" ry="4.6" class="punto p2"/><ellipse cx="136" cy="125" rx="11" ry="4.2" class="punto p3"/><ellipse cx="172" cy="119" rx="10" ry="3.8" class="punto p4"/><ellipse cx="204" cy="114" rx="9" ry="3.4" class="punto p5"/></g>`,
    'Paso a paso, hacia lo que me importa'),
};

// Ilustraciones animadas sencillas de los seis procesos del Hexaflex (SVG + CSS, sin imágenes externas).
// El color sale de la variable --c (color del pilar). Las animaciones se paran si el sistema pide menos movimiento.
const marco = (k, interior, texto) => `<figure class="ilus ilus-${k}" aria-hidden="true"><svg viewBox="0 0 320 150" role="presentation">${interior}</svg><figcaption>${texto}</figcaption></figure>`;

export const ILUSTRACION = {
  // Aceptación: la emoción entra y encuentra sitio en un espacio abierto (no hay muro)
  aceptacion: marco('aceptacion', `
    <path d="M70 118 Q160 30 250 118" class="trazo" stroke-dasharray="6 7"/>
    <circle cx="160" cy="98" r="44" class="suave"/>
    <g class="ola"><path d="M20 98 q12 -14 24 0 t24 0 t24 0" class="trazo grueso"/></g>
    <circle cx="160" cy="98" r="14" class="lleno respira"/>`,
    'Hacer sitio a lo que aparece, sin pelear con ello'),
  // Defusión: el pensamiento se separa de la cabeza y se aleja
  defusion: marco('defusion', `
    <circle cx="84" cy="88" r="28" class="trazo grueso"/><path d="M58 130 q26 -22 52 0" class="trazo grueso"/>
    <g class="burbuja"><rect x="150" y="40" width="120" height="44" rx="22" class="suave"/>
      <rect x="166" y="56" width="62" height="5" rx="2.5" class="lleno"/><rect x="166" y="67" width="40" height="5" rx="2.5" class="lleno"/>
      <circle cx="138" cy="80" r="6" class="suave"/><circle cx="124" cy="88" r="4" class="suave"/></g>`,
    'Ver los pensamientos como pensamientos'),
  // Momento presente: respiración y ondas que vuelven al centro
  presente: marco('presente', `
    <circle cx="160" cy="75" r="22" class="onda o1"/><circle cx="160" cy="75" r="22" class="onda o2"/><circle cx="160" cy="75" r="22" class="onda o3"/>
    <circle cx="160" cy="75" r="18" class="lleno respira"/>`,
    'Volver aquí y ahora, con flexibilidad'),
  // Yo como contexto: el cielo permanece mientras pasan las nubes
  yo: marco('yo', `
    <rect x="30" y="18" width="260" height="114" rx="22" class="suave"/>
    <g class="nube n1"><circle cx="0" cy="0" r="14"/><circle cx="16" cy="-6" r="18"/><circle cx="34" cy="0" r="13"/><rect x="-6" y="0" width="46" height="13" rx="6"/></g>
    <g class="nube n2"><circle cx="0" cy="0" r="10"/><circle cx="12" cy="-5" r="13"/><circle cx="25" cy="0" r="9"/><rect x="-4" y="0" width="33" height="9" rx="4"/></g>
    <circle cx="250" cy="44" r="10" class="lleno"/>`,
    'Eres el cielo, no el tiempo que pasa por él'),
  // Valores: una brújula que, tras dudar, señala la dirección
  valores: marco('valores', `
    <circle cx="160" cy="75" r="52" class="suave"/><circle cx="160" cy="75" r="52" class="trazo"/>
    <path d="M160 31 v8 M160 111 v8 M116 75 h8 M196 75 h8" class="trazo grueso"/>
    <g class="aguja"><path d="M160 40 L170 75 L160 110 L150 75 Z" class="suave"/><path d="M160 40 L170 75 L150 75 Z" class="lleno"/></g>
    <circle cx="160" cy="75" r="5" class="lleno"/>`,
    'Elegir qué dirección quiero que tenga mi vida'),
  // Acción comprometida: pasos que avanzan hacia la bandera
  accion: marco('accion', `
    <path d="M40 118 Q130 118 170 88 T282 50" class="trazo" stroke-dasharray="4 8"/>
    <g class="pasos"><circle cx="64" cy="117" r="7" class="lleno p1"/><circle cx="110" cy="112" r="7" class="lleno p2"/><circle cx="152" cy="98" r="7" class="lleno p3"/><circle cx="194" cy="78" r="7" class="lleno p4"/><circle cx="236" cy="62" r="7" class="lleno p5"/></g>
    <path d="M278 52 V16" class="trazo grueso"/><path d="M278 16 L302 24 L278 32 Z" class="lleno bandera"/>`,
    'Paso a paso, en la dirección de mis valores'),
};

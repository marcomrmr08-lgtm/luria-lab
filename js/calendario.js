// Calendario oficial de la rotación (Dossier de actividades, octubre 2026 – febrero 2027)

export const TUTORIAS_METODOLOGICAS = [
  { n: 1, fecha: '2026-10-09', titulo: 'Presentación + HHTT Generales' },
  { n: 2, fecha: '2026-10-16', titulo: 'PDP individualizado. Prácticas HHTT Generales' },
  { n: 3, fecha: '2026-10-23', titulo: 'Análisis Funcional' },
  { n: 4, fecha: '2026-11-06', titulo: 'La intervención desde las terapias contextuales' },
  { n: 5, fecha: '2026-11-13', titulo: 'HHTT Infancia y Adolescencia' },
  { n: 6, fecha: '2026-11-20', titulo: 'La conducta ansiosa' },
  { n: 7, fecha: '2026-11-27', titulo: 'Prácticas HHTT Infancia y Adolescencia' },
  { n: 8, fecha: '2026-12-04', titulo: 'PDP individualizado. Prácticas Ansiedad' },
  { n: 9, fecha: '2026-12-11', titulo: 'Bajo estado de ánimo' },
  { n: 10, fecha: '2026-12-18', titulo: 'HHTT Infancia y Adolescencia. Trastornos emocionales y de conducta' },
  { n: 11, fecha: '2027-01-15', titulo: 'Personalidad' },
  { n: 12, fecha: '2027-01-22', titulo: 'HHTT Infancia y Adolescencia: Familias' },
  { n: 13, fecha: '2027-01-29', titulo: 'PDP individualizado. Prácticas ánimo' },
];
export const HORARIO_TM = '10:00';

export const SEMINARIOS = [
  { n: 1, fecha: '2026-10-21', titulo: 'La historia clínica' },
  { n: 2, fecha: '2026-11-17', titulo: 'Las pruebas de evaluación' },
  { n: 3, fecha: '2026-12-15', titulo: 'Los informes' },
  { n: 4, fecha: '2027-01-19', titulo: 'El uso de la metáfora en terapia' },
];

export const REVISIONES_PDP = [2, 8, 13];

export const TIPOS = {
  espejo: { nombre: 'Espejo', color: 'verde' },
  coterapia: { nombre: 'Coterapia', color: 'verde' },
  tutoria_caso: { nombre: 'Tutoría de caso', color: 'azul' },
  tutoria_metodologica: { nombre: 'Tutoría metodológica', color: 'morado' },
  seminario: { nombre: 'Seminario', color: 'ambar' },
  practica_pdp: { nombre: 'Práctica del PDP', color: 'gris' },
};

// Tipos que cuentan en la hoja de horas de Luria
export const TIPOS_HOJA = ['coterapia', 'espejo', 'tutoria_metodologica', 'tutoria_caso', 'seminario'];

export const TEMAS = [
  'Entrevista inicial', 'Historia clínica', 'Análisis funcional', 'Evaluación',
  'Terapias contextuales', 'Conducta ansiosa', 'Bajo estado de ánimo', 'Personalidad',
  'Infancia y adolescencia', 'Familias', 'Hexaflex',
];

// Meses de la plantilla de Luria (septiembre a julio)
export const MESES = [
  '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
  '2027-04', '2027-05', '2027-06', '2027-07',
];

// Los seis procesos del modelo de flexibilidad psicológica (Hexaflex) y su polo de inflexibilidad
export const PROCESOS = [
  { k: 'aceptacion', nombre: 'Aceptación', opuesto: 'Evitación experiencial' },
  { k: 'defusion', nombre: 'Defusión', opuesto: 'Fusión cognitiva' },
  { k: 'presente', nombre: 'Momento presente', opuesto: 'Atención rígida al pasado y al futuro' },
  { k: 'yo', nombre: 'Yo como contexto', opuesto: 'Apego al yo conceptualizado' },
  { k: 'valores', nombre: 'Valores', opuesto: 'Falta de claridad o contacto con los valores' },
  { k: 'accion', nombre: 'Acción comprometida', opuesto: 'Inacción, impulsividad o evitación persistente' },
];
export const TIPOS_FICHA = ['Metáfora', 'Ejercicio experiencial', 'Pregunta', 'Tarea para casa'];

// Fichas de ejemplo, redactadas para Luria Lab. Revísalas y adáptalas con tu lectura de Hayes.
export const FICHAS_EJEMPLO = [
  { id: 'ej-pasajeros', ejemplo: true, nombre: 'Pasajeros en el autobús', tipo: 'Metáfora', procesos: ['defusion', 'aceptacion', 'valores', 'accion'], principal: 'defusion',
    paraQue: 'Ver los pensamientos y emociones difíciles como pasajeros que pueden ir en el autobús mientras la persona sigue conduciendo hacia lo que le importa.',
    cuando: 'Cuando la persona deja de hacer cosas importantes para no sentir malestar o para que ciertos pensamientos «se callen».',
    guion: 'Eres el conductor de un autobús que va en una dirección que te importa. Por el camino suben pasajeros molestos (pensamientos, recuerdos, sensaciones) que te gritan que gires o pares. Puedes desviarte para que se callen, pero entonces no llegas a donde querías. ¿Qué pasaría si dejas que sigan dentro, gritando, mientras tú conduces hacia tu destino?',
    variaciones: '', fuente: 'Ejemplo de Luria Lab · revisar con tu bibliografía', exp: {}, notasExp: [] },
  { id: 'ej-hojas', ejemplo: true, nombre: 'Hojas en el río', tipo: 'Ejercicio experiencial', procesos: ['defusion', 'presente'], principal: 'defusion',
    paraQue: 'Practicar observar los pensamientos a medida que aparecen, sin engancharse a ellos ni apartarlos.',
    cuando: 'Cuando la persona se queda atrapada en la rumia o se toma sus pensamientos como verdades literales.',
    guion: 'Con los ojos cerrados, imagina un río con hojas que bajan flotando. Cada vez que aparezca un pensamiento, colócalo en una hoja y déjalo pasar a su ritmo. Si te descubres enganchado a uno, date cuenta con amabilidad y vuelve a la orilla.',
    variaciones: '', fuente: 'Ejemplo de Luria Lab · revisar con tu bibliografía', exp: {}, notasExp: [] },
  { id: 'ej-cuerda', ejemplo: true, nombre: 'Tirar de la cuerda con el monstruo', tipo: 'Metáfora', procesos: ['aceptacion'], principal: 'aceptacion',
    paraQue: 'Mostrar el coste de luchar contra el malestar y la alternativa de soltar la cuerda.',
    cuando: 'Cuando la persona dedica mucha energía a controlar o eliminar la ansiedad u otras emociones.',
    guion: 'Imagina que tiras de una cuerda contra un monstruo, con un abismo en medio. Cuanto más tiras, más tira él. ¿Y si en lugar de ganar la pelea, sueltas la cuerda? El monstruo sigue ahí, pero tus manos quedan libres para otras cosas.',
    variaciones: '', fuente: 'Ejemplo de Luria Lab · revisar con tu bibliografía', exp: {}, notasExp: [] },
  { id: 'ej-epitafio', ejemplo: true, nombre: '¿Qué te gustaría que dijeran de ti?', tipo: 'Ejercicio experiencial', procesos: ['valores'], principal: 'valores',
    paraQue: 'Contactar con lo que de verdad le importa a la persona, más allá de los objetivos concretos.',
    cuando: 'Cuando la persona no sabe hacia dónde ir o vive en función de evitar el malestar.',
    guion: 'Imagina que, dentro de muchos años, alguien que te quiere habla de ti en una celebración. ¿Qué te gustaría que contara de cómo has vivido, de cómo has tratado a los demás, de qué has defendido?',
    variaciones: '', fuente: 'Ejemplo de Luria Lab · revisar con tu bibliografía', exp: {}, notasExp: [] },
];

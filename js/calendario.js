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
// Los ejemplos ahora vienen de hexaflexBase.js (una ficha por proceso)
export const FICHAS_EJEMPLO = [];

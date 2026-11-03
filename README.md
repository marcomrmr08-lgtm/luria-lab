# Luria Lab

Cuadernillo de prácticas clínicas para el alumnado en prácticas: agenda, registro de actividades y horas, diario crítico y entregas mensuales.

App web instalable (PWA). No tiene servidor propio: funciona en el navegador y se conecta directamente con la cuenta de Google de cada alumno.

- **Permisos limitados:** solo accede a los archivos que crea la propia app (`drive.file`), a su carpeta oculta de datos (`drive.appdata`) y envía correos que el alumno revisa antes (`gmail.send`).
- **Sin datos en este repositorio:** aquí solo está el código. Los registros, documentos y plantillas de cada alumno viven en su propio Google Drive.
- **Sin dependencias externas:** el Excel de horas se genera con código propio (`js/zip.js`, `js/hojaHoras.js`).

## Fases

1. **Registro y horas** (esta versión): agenda precargada, espejos y coterapias con diario crítico en Google Docs, tutorías de caso, fichas de tutorías y seminarios con su tarea, hoja de horas de Luria, diario crítico mensual y envío por correo.
2. Guía clínica y «Si yo fuera el terapeuta».
3. PDP y banco Hexaflex.

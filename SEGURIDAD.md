# Seguridad y privacidad de Luria Lab

## Cómo está montada
- No hay servidor ni base de datos propios. Cada persona guarda sus datos en su propia cuenta de Google.
- Permisos de Google mínimos: `drive.file` (solo los archivos que crea la app), `drive.appdata` (su archivo oculto de datos) y, si se activa, `calendar.app.created` (solo el calendario «Luria Lab»). Sin acceso al correo ni al resto del Drive.
- El acceso de Google dura una hora y solo se guarda en la memoria de la página: no se escribe en el dispositivo.
- La app no envía correos ni comparte documentos.

## Protecciones en el código
- **Política de seguridad (CSP)** en `index.html` y `companeros/index.html`: solo se ejecuta código de la propia app y del inicio de sesión de Google, y la app solo puede conectarse con Google. Ni el código en línea ni los envíos a otros sitios están permitidos.
- **Sin servicios de terceros**: la fuente y el visor de PDF van dentro de la app (`vendor/`).
- **Texto siempre escapado**: todo lo que escribe el usuario pasa por `esc()` antes de mostrarse.
- **Datos saneados al cargar** (`sanear()` en `js/store.js`): se descartan identificadores, fechas y horas con formato extraño, vengan de Drive o de una copia importada.
- **Visor de PDF** sin `eval` ni formularios XFA.
- **Cerrar sesión y borrar** (Ajustes › Cuenta): retira el permiso en Google y borra todo lo guardado en el dispositivo.
- **Versión para compañeros**: sin iniciales de pacientes; solo el código del caso.

## Lo que depende de la configuración (no del código)
- GitHub: verificación en dos pasos y rama `main` protegida.
- Google Cloud: verificación en dos pasos, origen autorizado solo `https://marcomrmr08-lgtm.github.io` y app en modo prueba con lista cerrada de usuarios.
- Cada usuario: verificación en dos pasos en su Google y móvil con bloqueo. El permiso se puede retirar en https://myaccount.google.com/connections

## Al cambiar el código
- No añadir scripts en línea ni servicios externos. Si hace falta uno, añadirlo a la CSP de los dos HTML.
- Mostrar texto del usuario siempre con `esc()`.
- Nunca guardar el token de Google en `localStorage`.

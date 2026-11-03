// Configuración de Luria Lab.
// CLIENT_ID: el «ID de cliente» de Google Cloud (Aplicación web). Mientras esté vacío,
// la app funciona en modo prueba: guarda los datos solo en este dispositivo y
// las funciones de Google (Docs, Drive, Gmail) quedan desactivadas.
export const CONFIG = {
  CLIENT_ID: '632485670315-44h0reldorhd0pc09qvivhc9qdj3cdhv.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/gmail.send',
  ].join(' '),
  ARCHIVO_DATOS: 'luria-lab-datos.json',
  CARPETA_RAIZ: 'Luria Lab',
};

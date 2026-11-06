// Edición de la app. «personal» es la de Marco; «companeros» es la que se comparte.
// La elige la página que la abre (companeros/index.html pone window.LL_EDICION).
export const EDICION = (typeof window !== 'undefined' && window.LL_EDICION) || 'personal';
export const COMPANEROS = EDICION === 'companeros';

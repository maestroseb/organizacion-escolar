/**
 * Análisis de completitud de la configuración.
 *
 * No hay IA en tiempo de ejecución dentro de Apps Script: "que piense lo que
 * falta" se resuelve como una comprobación heurística de qué secciones están
 * vacías o incompletas. El resultado alimenta:
 *   - el paso "preguntar lo que falta" del alta guiada (formulario paso a paso),
 *   - el panel Resumen del espacio de trabajo.
 *
 * Cada sección devuelve:
 *   { clave, titulo, estado: 'vacio'|'incompleto'|'ok', total, aviso }
 * donde `clave` coincide con la pestaña correspondiente de la app.
 */

function analizarConfiguracion() {
  const centro = findById(SHEETS.CENTRO, CENTRO_ID) || {};
  const tramos = getAll(SHEETS.TRAMOS);
  const grupos = getAll(SHEETS.GRUPOS);
  const docentes = getAll(SHEETS.DOCENTES).filter(function(d) { return d.activo !== false; });
  const locs = getAll(SHEETS.LOCALIZACIONES);
  const materias = getAll(SHEETS.MATERIAS);
  const roles = getAll(SHEETS.ROLES);

  const secciones = [];

  // Centro
  (function() {
    const tieneNombre = !!String(centro.nombre || '').trim();
    const tieneCurso = !!String(centro.curso_academico || '').trim();
    const tieneEtapas = !!String(centro.etapas || '').trim();
    let estado = 'ok', aviso = '';
    if (!tieneNombre) { estado = 'vacio'; aviso = 'Falta el nombre del centro.'; }
    else if (!tieneCurso || !tieneEtapas) {
      estado = 'incompleto';
      aviso = !tieneCurso ? 'Falta el curso académico.' : 'Indica las etapas educativas.';
    }
    secciones.push({ clave: 'centro', titulo: 'Datos del centro', estado: estado,
                     total: tieneNombre ? 1 : 0, aviso: aviso });
  })();

  // Tramos
  secciones.push(_seccionSimple('tramos', 'Tramos horarios', tramos.length,
    'Define la jornada en tramos (incluidos los recreos).'));

  // Grupos
  secciones.push(_seccionSimple('grupos', 'Grupos', grupos.length,
    'Añade las clases del centro (INF 3, 1º, 2º…).'));

  // Docentes
  secciones.push(_seccionSimple('docentes', 'Docentes', docentes.length,
    'Añade el claustro. El nombre corto es el que verás en las vistas.'));

  // Tutorías (depende de grupos)
  (function() {
    if (grupos.length === 0) {
      secciones.push({ clave: 'tutorias', titulo: 'Tutorías', estado: 'vacio', total: 0,
                       aviso: 'Primero necesitas grupos.' });
      return;
    }
    const conTutor = grupos.filter(function(g) { return String(g.tutor_id || '').trim(); }).length;
    let estado = 'ok', aviso = '';
    if (conTutor === 0) { estado = 'vacio'; aviso = 'Asigna tutores a los grupos.'; }
    else if (conTutor < grupos.length) {
      estado = 'incompleto';
      aviso = (grupos.length - conTutor) + ' grupo(s) sin tutor.';
    }
    secciones.push({ clave: 'tutorias', titulo: 'Tutorías', estado: estado,
                     total: conTutor, aviso: aviso });
  })();

  // Localizaciones
  secciones.push(_seccionSimple('localizaciones', 'Localizaciones', locs.length,
    'Espacios del centro: aulas, biblioteca, patios, aula de PT…'));

  // Materias
  secciones.push(_seccionSimple('materias', 'Materias', materias.length,
    'Asignaturas que se imparten (los recreos también cuentan).'));

  // Roles
  secciones.push(_seccionSimple('roles', 'Cargos y roles', roles.length,
    'Cargos y perfiles: dirección, coordinaciones, PT, AL, guardias…'));

  const pendientes = secciones.filter(function(s) { return s.estado !== 'ok'; });
  return {
    secciones: secciones,
    completo: pendientes.length === 0,
    pendientes: pendientes.map(function(s) { return s.clave; })
  };
}

function _seccionSimple(clave, titulo, total, avisoVacio) {
  return {
    clave: clave,
    titulo: titulo,
    estado: total > 0 ? 'ok' : 'vacio',
    total: total,
    aviso: total > 0 ? '' : avisoVacio
  };
}

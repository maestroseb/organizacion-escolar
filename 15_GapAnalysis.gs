/**
 * Análisis de completitud de la configuración.
 *
 * No hay IA en tiempo de ejecución dentro de Apps Script: "que piense lo que
 * falta" se resuelve como una comprobación heurística de qué secciones están
 * vacías o incompletas. Alimenta el paso "repaso" del alta guiada y el panel
 * Resumen.
 *
 * Cada sección devuelve { clave, titulo, estado, total, aviso, tab } donde
 * `tab` es la pestaña donde se edita (varias secciones comparten pestaña tras
 * unificarlas: localizaciones vive en "grupos"; materias y roles en "areas").
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
    secciones.push({ clave: 'centro', titulo: 'Datos del centro', tab: 'centro', estado: estado,
                     total: tieneNombre ? 1 : 0, aviso: aviso });
  })();

  secciones.push(_seccion('tramos', 'Tramos horarios', 'tramos', tramos.length,
    'Define la jornada en tramos (incluidos los recreos).'));

  // Grupos: además avisa si hay grupos sin tutor (el tutor se asigna aquí).
  (function() {
    if (grupos.length === 0) {
      secciones.push({ clave: 'grupos', titulo: 'Grupos', tab: 'grupos', estado: 'vacio', total: 0,
                       aviso: 'Añade las clases del centro (INF 3, 1º, 2º…).' });
      return;
    }
    const sinTutor = grupos.filter(function(g) { return !String(g.tutor_id || '').trim(); }).length;
    secciones.push({ clave: 'grupos', titulo: 'Grupos', tab: 'grupos',
                     estado: sinTutor ? 'incompleto' : 'ok', total: grupos.length,
                     aviso: sinTutor ? (sinTutor + ' grupo(s) sin tutor asignado.') : '' });
  })();

  secciones.push(_seccion('docentes', 'Docentes', 'docentes', docentes.length,
    'Añade el claustro. El nombre corto es el que verás en las vistas.'));

  secciones.push(_seccion('localizaciones', 'Localizaciones', 'grupos', locs.length,
    'Espacios del centro: aulas, biblioteca, patios, aula de PT…'));

  secciones.push(_seccion('materias', 'Materias', 'areas', materias.length,
    'Asignaturas que se imparten (los recreos también cuentan).'));

  secciones.push(_seccion('roles', 'Cargos y roles', 'areas', roles.length,
    'Cargos y perfiles: dirección, coordinaciones, PT, AL, guardias…'));

  const pendientesTabs = [];
  secciones.forEach(function(s) {
    if (s.estado !== 'ok' && pendientesTabs.indexOf(s.tab) === -1) pendientesTabs.push(s.tab);
  });

  return {
    secciones: secciones,
    completo: pendientesTabs.length === 0,
    pendientes: pendientesTabs
  };
}

function _seccion(clave, titulo, tab, total, avisoVacio) {
  return {
    clave: clave, titulo: titulo, tab: tab,
    estado: total > 0 ? 'ok' : 'vacio',
    total: total,
    aviso: total > 0 ? '' : avisoVacio
  };
}

/**
 * Lógica del paso 9 del wizard: cargos y roles especiales.
 *
 * Roles que no van pegados a un grupo concreto: cargos directivos,
 * coordinaciones, perfiles de apoyo (PT/AL/Refuerzo/ATEDU) y guardias.
 * Se usan en _Ocupaciones para los tipos ESPECIAL y LOCALIZACION.
 *
 * El campo `orden` define la prioridad de sustitución (quién entra antes a
 * cubrir): la sábana numera las localizaciones (#01, #02…) siguiendo ese
 * orden, que el usuario reordena arrastrando en la pestaña Cargos.
 * El `color` es configurable por el usuario y lo usan las vistas.
 */

const ROLES_PLANTILLA = [
  // Apoyos y refuerzos (primeros: son los que antes entran a sustituir)
  { nombre: 'Ref.',  nombre_largo: 'Refuerzo educativo',              color: '#e7b23c' },
  { nombre: 'PT',    nombre_largo: 'Pedagogía Terapéutica',           color: '#d9e7f5' },
  { nombre: 'AL',    nombre_largo: 'Audición y Lenguaje',             color: '#d9e7f5' },
  { nombre: 'ATEDU', nombre_largo: 'Atención Educativa Domiciliaria', color: '#6a51a6' },
  // Coordinaciones
  { nombre: 'TDE',  nombre_largo: 'Coordinación TDE',            color: '#2f6fd0' },
  { nombre: 'COE',  nombre_largo: 'Coordinación Coeducación',    color: '#2f6fd0' },
  { nombre: 'CON',  nombre_largo: 'Coordinación Convivencia',    color: '#2f6fd0' },
  { nombre: 'BIB',  nombre_largo: 'Coordinación Biblioteca',     color: '#2f6fd0' },
  { nombre: 'PRL',  nombre_largo: 'Coordinación PRL',            color: '#2f6fd0' },
  { nombre: 'SAL',  nombre_largo: 'Coordinación Plan de Salud',  color: '#2f6fd0' },
  { nombre: 'CIC',  nombre_largo: 'Coordinación de Ciclo',       color: '#2f6fd0' },
  // Equipo directivo
  { nombre: 'DIR',  nombre_largo: 'Dirección',            color: '#e0863a' },
  { nombre: 'JE',   nombre_largo: 'Jefatura de Estudios', color: '#e0863a' },
  { nombre: 'SEC',  nombre_largo: 'Secretaría',           color: '#e0863a' },
  // Otros
  { nombre: 'Tut.',  nombre_largo: 'Tutoría',                     color: '' },
  { nombre: 'Gua.',  nombre_largo: 'Recreo de guardia',           color: '#9b9ba3' },
  { nombre: 'RH',    nombre_largo: 'Reducción Horaria (mayor de 55)', color: '#9b9ba3' }
];

function listarRoles() {
  const roles = getAll(SHEETS.ROLES);
  roles.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  return roles;
}

function plantillaRoles() {
  return ROLES_PLANTILLA.map(function(r, i) {
    return { nombre: r.nombre, nombre_largo: r.nombre_largo, color: r.color || '', orden: i + 1 };
  });
}

function guardarRoles(roles, modo) {
  if (!Array.isArray(roles)) throw new Error('Formato inválido.');

  roles.forEach(function(r, i) {
    const n = i + 1;
    if (!r.nombre || !String(r.nombre).trim()) {
      throw new Error('Rol ' + n + ': el nombre es obligatorio.');
    }
  });

  const nombres = {};
  roles.forEach(function(r) {
    const k = String(r.nombre).trim().toLowerCase();
    if (nombres[k]) {
      throw new Error('Hay roles con el mismo nombre: "' + r.nombre + '".');
    }
    nombres[k] = true;
  });

  // El orden viene dado por la posición en la lista (drag & drop en la UI).
  const filas = roles.map(function(r, i) {
    return {
      id: r.id || undefined,
      nombre: String(r.nombre).trim(),
      nombre_largo: r.nombre_largo || '',
      color: r.color || '',
      orden: i + 1
    };
  });
  const resumen = bulkMerge(SHEETS.ROLES, filas, ['nombre'], modo || 'reemplazar');
  return { ok: true, total: resumen.total, resumen: resumen };
}

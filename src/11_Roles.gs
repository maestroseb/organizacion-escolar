/**
 * Lógica del paso 9 del wizard: cargos y roles especiales.
 *
 * Roles que no van pegados a un grupo concreto: cargos directivos,
 * coordinaciones, perfiles de apoyo (PT/AL/Refuerzo/ATEDU) y guardias.
 * Se usan en _Ocupaciones para los tipos ESPECIAL y LOCALIZACION.
 *
 * Subset relevante de los 107 que define Séneca; el centro puede añadir
 * los suyos o quitar los que no use.
 */

const ROLES_PLANTILLA = [
  // Equipo directivo
  { nombre: 'DIR',  nombre_largo: 'Dirección' },
  { nombre: 'JE',   nombre_largo: 'Jefatura de Estudios' },
  { nombre: 'SEC',  nombre_largo: 'Secretaría' },

  // Transformación digital
  { nombre: 'TDE',  nombre_largo: 'Coordinación TDE' },

  // Coordinaciones
  { nombre: 'COE',  nombre_largo: 'Coordinación Coeducación' },
  { nombre: 'CON',  nombre_largo: 'Coordinación Convivencia' },
  { nombre: 'BIB',  nombre_largo: 'Coordinación Biblioteca' },
  { nombre: 'PRL',  nombre_largo: 'Coordinación PRL' },
  { nombre: 'SAL',  nombre_largo: 'Coordinación Plan de Salud' },
  { nombre: 'CIC',  nombre_largo: 'Coordinación de Ciclo' },

  // Apoyos y refuerzos
  { nombre: 'PT',    nombre_largo: 'Pedagogía Terapéutica' },
  { nombre: 'AL',    nombre_largo: 'Audición y Lenguaje' },
  { nombre: 'Ref.',  nombre_largo: 'Refuerzo educativo' },
  { nombre: 'ATEDU', nombre_largo: 'Atención Educativa Domiciliaria' },

  // Otros
  { nombre: 'Tut.',  nombre_largo: 'Tutoría' },
  { nombre: 'Gua.',  nombre_largo: 'Recreo de guardia' }
];

function listarRoles() {
  return getAll(SHEETS.ROLES);
}

function plantillaRoles() {
  return ROLES_PLANTILLA.map(function(r) {
    return { nombre: r.nombre, nombre_largo: r.nombre_largo };
  });
}

function guardarRoles(roles) {
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

  const filas = roles.map(function(r) {
    return {
      id: r.id || undefined,
      nombre: String(r.nombre).trim(),
      nombre_largo: r.nombre_largo || '',
      color: r.color || ''
    };
  });
  bulkReplace(SHEETS.ROLES, filas);
  return { ok: true, total: filas.length };
}

/**
 * Constantes globales del libro.
 *
 * SHEETS: nombre de cada pestaña de datos.
 * SCHEMA: cabeceras (fila 1) de cada pestaña, en el orden en que se crean.
 *
 * El orden de las columnas en SCHEMA es la fuente de verdad: el resto del
 * código accede a campos por nombre, nunca por índice fijo.
 */

const SHEETS = {
  CENTRO:          '_Centro',
  TRAMOS:          '_Tramos',
  GRUPOS:          '_Grupos',
  DOCENTES:        '_Docentes',
  LOCALIZACIONES:  '_Localizaciones',
  MATERIAS:        '_Materias',
  ROLES:           '_RolesEspeciales',
  OCUPACIONES:    '_Ocupaciones',
  SUSTITUCIONES:  '_Sustituciones'
};

const SCHEMA = {
  [SHEETS.CENTRO]: [
    'id', 'nombre', 'codigo', 'localidad', 'provincia', 'comunidad',
    'etapas', 'curso_academico', 'fecha_inicio', 'fecha_fin'
  ],
  [SHEETS.TRAMOS]: [
    'id', 'orden', 'hora_inicio', 'hora_fin', 'es_recreo', 'etiqueta'
  ],
  [SHEETS.GRUPOS]: [
    'id', 'nombre_corto', 'nombre_largo', 'nivel', 'etapa', 'orden',
    'tutor_id', 'color'
  ],
  [SHEETS.DOCENTES]: [
    'id', 'nombre_corto', 'nombre_completo', 'puesto', 'email',
    'activo', 'orden', 'color'
  ],
  [SHEETS.LOCALIZACIONES]: [
    'id', 'codigo', 'descripcion', 'orden'
  ],
  [SHEETS.MATERIAS]: [
    'id', 'nombre', 'abreviatura', 'color', 'es_recreo'
  ],
  [SHEETS.ROLES]: [
    'id', 'nombre', 'nombre_largo', 'color'
  ],
  [SHEETS.OCUPACIONES]: [
    'id', 'docente_id', 'dia', 'tramo_id', 'tipo',
    'grupo_id', 'materia_id',
    'localizacion_id', 'rol_loc_id', 'grupo_destino_id',
    'rol_especial_id', 'notas'
  ],
  [SHEETS.SUSTITUCIONES]: [
    'id', 'fecha', 'docente_ausente_id', 'docente_sustituto_id',
    'tramo_id', 'notas'
  ]
};

// Orden de creación de pestañas (de izquierda a derecha en el libro).
const SHEET_ORDER = [
  SHEETS.CENTRO,
  SHEETS.TRAMOS,
  SHEETS.GRUPOS,
  SHEETS.DOCENTES,
  SHEETS.LOCALIZACIONES,
  SHEETS.MATERIAS,
  SHEETS.ROLES,
  SHEETS.OCUPACIONES,
  SHEETS.SUSTITUCIONES
];

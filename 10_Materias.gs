/**
 * Lógica del paso 8 del wizard: materias.
 *
 * Cada materia es una asignatura del centro. La plantilla varía según
 * las etapas y el bilingüismo configurados en el paso 2.
 *
 * Decisión del modelo (§3 del DESIGN): los recreos también son materias,
 * con el flag `es_recreo=true`. Se incluyen automáticamente en la
 * plantilla para que las ocupaciones de recreo puedan referenciarlas.
 */

const MATERIAS_INFANTIL = [
  { nombre: 'Crecimiento en Armonía',            abreviatura: 'CRE' },
  { nombre: 'Descubrimiento del Entorno',        abreviatura: 'DES' },
  { nombre: 'Comunicación y Representación',     abreviatura: 'COM' },
  { nombre: 'Inglés',                            abreviatura: 'ING' },
  { nombre: 'Religión',                          abreviatura: 'REL' },
  { nombre: 'Atención Educativa',                abreviatura: 'AE'  }
];

const MATERIAS_PRIMARIA = [
  { nombre: 'Lengua',                            abreviatura: 'LCL' },
  { nombre: 'Matemáticas',                       abreviatura: 'MAT' },
  { nombre: 'Conocimiento del Medio',            abreviatura: 'CCN' },
  { nombre: 'Educación Artística',               abreviatura: 'EA'  },
  { nombre: 'Educación Física',                  abreviatura: 'EF'  },
  { nombre: 'Inglés',                            abreviatura: 'ING' },
  { nombre: 'Religión',                          abreviatura: 'REL' },
  { nombre: 'Atención Educativa',                abreviatura: 'AE'  },
  { nombre: 'Valores Cívicos y Éticos',          abreviatura: 'VAL' }
];

const MATERIAS_BILINGUE_INGLES = [
  { nombre: 'Natural Science',                   abreviatura: 'NSC' },
  { nombre: 'Social Science',                    abreviatura: 'SSC' },
  { nombre: 'Arts and Crafts',                   abreviatura: 'A&C' }
];

const MATERIAS_BILINGUE_FRANCES = [
  { nombre: 'Francés',                           abreviatura: 'FRA' }
];

/**
 * Abreviatura y color por defecto de una materia, por su nombre (Séneca o
 * forma corta). El orden importa: los ámbitos y áreas de Infantil/Aula
 * Específica van antes que «lengua», «medio»… para no confundirlos.
 */
const MATERIAS_POR_DEFECTO = [
  [/lenguajes.*comunicaci|^alcr$/,               'ALCR',  '#74a9e8'],
  [/ling[uü][ií]stica.*transversal|^alct$/,      'ALCT',  '#5c7cfa'],
  [/[aá]mbito de comunicaci[oó]n|^acl$/,         'ACL',   '#74a9e8'],
  [/corporal.*identidad|^accci$/,                'ACCCI', '#f4a259'],
  [/participaci[oó]n en el medio|^acpmf$/,       'ACPMF', '#69b578'],
  [/s[ií] mismo.*autonom|^acmap$/,               'ACMAP', '#f4a259'],
  [/[aá]rea de conocimiento del entorno|^acoen$/,'ACOEN', '#69b578'],
  [/crecimiento en armon|^ca$/,                  'CA',    '#f4a259'],
  [/representaci[oó]n de la realidad|comunicaci[oó]n y representaci|^crr$/, 'CRR', '#4dabf7'],
  [/descubrimiento|exploraci[oó]n del entorno|^dee$/, 'DEE', '#69b578'],
  [/lengua|^lcl$/,                               'LCL',   '#2f6fd0'],
  [/matem|^mat$/,                                'MAT',   '#d64545'],
  [/conocimiento del medio|natural science|social science|^cmn$|^ccn$/, 'CMN', '#3a9d5d'],
  [/ingl[eé]s|^ing$/,                            'ING',   '#8e5cc4'],
  [/franc[eé]s|^fr[a2]$/,                        'FRA',   '#b07cd8'],
  [/educaci[oó]n f[ií]sica|^efi?$/,              'EF',    '#f08a24'],
  [/m[uú]sica|^mus$/,                            'MUS',   '#e05fa0'],
  [/pl[aá]stica|arts and crafts|^pla$/,          'PLA',   '#e05fa0'],
  [/art[ií]stica|^ear?$/,                        'EA',    '#e05fa0'],
  [/religi[oó]n|^rel$/,                          'REL',   '#8d6e63'],
  [/atenci[oó]n educativa|^atedu$|^ae$/,         'AE',    '#a1887f'],
  [/valores|^vce$|^val$/,                        'VAL',   '#26a69a'],
  [/recreo/,                                     'REC',   '#9b9ba3']
];

function infoMateriaPorDefecto(nombre) {
  const n = String(nombre || '').trim().toLowerCase();
  for (let i = 0; i < MATERIAS_POR_DEFECTO.length; i++) {
    if (MATERIAS_POR_DEFECTO[i][0].test(n)) return { abreviatura: MATERIAS_POR_DEFECTO[i][1], color: MATERIAS_POR_DEFECTO[i][2] };
  }
  return { abreviatura: '', color: '' };
}

function listarMaterias() {
  const materias = getAll(SHEETS.MATERIAS);
  return materias;
}

function plantillaMaterias() {
  const prefs = obtenerPreferenciasWizard();
  const etapas = String(prefs.etapas || '').split(',');
  const bilingue = prefs.bilingue || 'no';

  const items = [];
  const vistas = {};
  function anadir(m, esRecreo) {
    const k = m.nombre.toLowerCase();
    if (vistas[k]) return;
    vistas[k] = true;
    items.push({
      nombre: m.nombre,
      abreviatura: m.abreviatura || '',
      es_recreo: !!esRecreo
    });
  }

  if (etapas.indexOf('INFANTIL') !== -1) MATERIAS_INFANTIL.forEach(function(m) { anadir(m, false); });
  if (etapas.indexOf('PRIMARIA') !== -1) MATERIAS_PRIMARIA.forEach(function(m) { anadir(m, false); });
  if (bilingue === 'ingles')  MATERIAS_BILINGUE_INGLES.forEach(function(m) { anadir(m, false); });
  if (bilingue === 'frances') MATERIAS_BILINGUE_FRANCES.forEach(function(m) { anadir(m, false); });

  anadir({ nombre: 'Recreo', abreviatura: 'REC' }, true);

  return items;
}

function guardarMaterias(materias, modo) {
  _exigirEdicion();
  if (!Array.isArray(materias)) throw new Error('Formato inválido.');

  materias.forEach(function(m, i) {
    const n = i + 1;
    if (!m.nombre || !String(m.nombre).trim()) {
      throw new Error('Materia ' + n + ': el nombre es obligatorio.');
    }
  });

  const nombres = {};
  materias.forEach(function(m) {
    const k = String(m.nombre).trim().toLowerCase();
    if (nombres[k]) {
      throw new Error('Hay materias con el mismo nombre: "' + m.nombre + '".');
    }
    nombres[k] = true;
  });

  // Lo que falte (abreviatura, color) se completa con el valor por defecto;
  // al combinar, sin pisar lo que ya tenga la materia existente.
  const previas = {};
  if (modo === 'combinar') getAll(SHEETS.MATERIAS).forEach(function(x) { previas[String(x.nombre).trim().toLowerCase()] = x; });
  const filas = materias.map(function(m) {
    const nombre = String(m.nombre).trim();
    const prev = previas[nombre.toLowerCase()] || {};
    const def = infoMateriaPorDefecto(nombre);
    return {
      id: m.id || undefined,
      nombre: nombre,
      abreviatura: String(m.abreviatura || '').trim() || prev.abreviatura || def.abreviatura,
      color: m.color || prev.color || def.color,
      es_recreo: !!m.es_recreo
    };
  });
  const resumen = bulkMerge_(SHEETS.MATERIAS, filas, ['nombre'], modo || 'reemplazar');
  return { ok: true, total: resumen.total, resumen: resumen };
}

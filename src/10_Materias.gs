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

function guardarMaterias(materias) {
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

  const idsConservados = {};
  materias.forEach(function(m) { if (m.id) idsConservados[m.id] = true; });
  const existentes = getAll(SHEETS.MATERIAS);
  existentes.forEach(function(e) {
    if (!idsConservados[e.id]) remove(SHEETS.MATERIAS, e.id);
  });

  const guardados = [];
  materias.forEach(function(m) {
    const fila = {
      id: m.id || undefined,
      nombre: String(m.nombre).trim(),
      abreviatura: m.abreviatura || '',
      color: m.color || '',
      es_recreo: !!m.es_recreo
    };
    guardados.push(upsert(SHEETS.MATERIAS, fila));
  });

  return { ok: true, total: guardados.length };
}

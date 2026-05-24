/**
 * Lógica del paso 4 del wizard: grupos.
 *
 * Cada grupo es un curso/clase del centro: INF3, INF4, INF5 (infantil)
 * y 1P a 6P (primaria), opcionalmente con líneas (A, B).
 *
 * La plantilla se genera a partir de las preferencias guardadas en el
 * paso 2 (etapas + líneas por curso). La tutoría (tutor_id) se asigna
 * en el paso 6, no aquí.
 */

const NIVELES_INFANTIL = [
  { nivel: 'INF3', nombre: 'INF 3', largo: 'Infantil 3 años', orden: 1 },
  { nivel: 'INF4', nombre: 'INF 4', largo: 'Infantil 4 años', orden: 2 },
  { nivel: 'INF5', nombre: 'INF 5', largo: 'Infantil 5 años', orden: 3 }
];

const NIVELES_PRIMARIA = [
  { nivel: '1P', nombre: '1º', largo: '1º de Primaria', orden: 11 },
  { nivel: '2P', nombre: '2º', largo: '2º de Primaria', orden: 12 },
  { nivel: '3P', nombre: '3º', largo: '3º de Primaria', orden: 13 },
  { nivel: '4P', nombre: '4º', largo: '4º de Primaria', orden: 14 },
  { nivel: '5P', nombre: '5º', largo: '5º de Primaria', orden: 15 },
  { nivel: '6P', nombre: '6º', largo: '6º de Primaria', orden: 16 }
];

function listarGrupos() {
  const grupos = getAll(SHEETS.GRUPOS);
  grupos.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  return grupos;
}

function plantillaGrupos() {
  const prefs = obtenerPreferenciasWizard();
  const etapas = String(prefs.etapas || '').split(',');
  const lineas = prefs.lineas || '1';

  const niveles = [];
  if (etapas.indexOf('INFANTIL') !== -1) niveles.push.apply(niveles, NIVELES_INFANTIL);
  if (etapas.indexOf('PRIMARIA') !== -1) niveles.push.apply(niveles, NIVELES_PRIMARIA);

  const resultado = [];
  let orden = 1;

  niveles.forEach(function(n) {
    const etapa = n.nivel.indexOf('INF') === 0 ? 'INFANTIL' : 'PRIMARIA';
    if (lineas === '2') {
      ['A', 'B'].forEach(function(letra) {
        resultado.push({
          nombre_corto: n.nombre + ' ' + letra,
          nombre_largo: n.largo + ' (' + letra + ')',
          nivel: n.nivel,
          etapa: etapa,
          orden: orden++
        });
      });
    } else {
      resultado.push({
        nombre_corto: n.nombre,
        nombre_largo: n.largo,
        nivel: n.nivel,
        etapa: etapa,
        orden: orden++
      });
    }
  });

  return resultado;
}

function guardarGrupos(grupos) {
  if (!Array.isArray(grupos)) throw new Error('Formato inválido.');

  grupos.forEach(function(g, i) {
    const n = i + 1;
    if (!g.nombre_corto || !String(g.nombre_corto).trim()) {
      throw new Error('Grupo ' + n + ': el nombre corto es obligatorio.');
    }
    if (!g.nivel) {
      throw new Error('Grupo ' + n + ' (' + g.nombre_corto + '): falta el nivel.');
    }
  });

  const nombres = {};
  grupos.forEach(function(g, i) {
    const k = String(g.nombre_corto).trim().toLowerCase();
    if (nombres[k]) {
      throw new Error('Hay grupos con el mismo nombre corto: "' + g.nombre_corto + '".');
    }
    nombres[k] = true;
  });

  const idsConservados = {};
  grupos.forEach(function(g) { if (g.id) idsConservados[g.id] = true; });
  const existentes = getAll(SHEETS.GRUPOS);
  existentes.forEach(function(e) {
    if (!idsConservados[e.id]) remove(SHEETS.GRUPOS, e.id);
  });

  const guardados = [];
  grupos.forEach(function(g, i) {
    const etapa = g.nivel.indexOf('INF') === 0 ? 'INFANTIL' : 'PRIMARIA';
    const fila = {
      id: g.id || undefined,
      nombre_corto: String(g.nombre_corto).trim(),
      nombre_largo: g.nombre_largo || '',
      nivel: g.nivel,
      etapa: etapa,
      orden: i + 1,
      tutor_id: g.tutor_id || '',
      color: g.color || ''
    };
    guardados.push(upsert(SHEETS.GRUPOS, fila));
  });

  return { ok: true, total: guardados.length };
}

function nivelesDisponibles() {
  return NIVELES_INFANTIL.concat(NIVELES_PRIMARIA).map(function(n) {
    return { nivel: n.nivel, etiqueta: n.largo };
  });
}

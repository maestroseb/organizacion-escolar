/**
 * Importador de horarios en formato CSV (el que produce el Gem).
 *
 * Flujo en dos fases:
 *   1) analizarCSV(csvText) → parsea, decodifica sufijos de tramo (5a/5b),
 *      detecta alternancias, hace matching difuso contra el catálogo real
 *      del centro y detecta conflictos. Devuelve filas "propuestas" para
 *      que el usuario las revise. No toca el libro.
 *   2) aplicarImportacionCSV(filas) → coge las filas ya revisadas/corregidas
 *      por el usuario y las vuelca en _Ocupaciones.
 *
 * Cabecera esperada del CSV:
 *   docente,dia,tramo,tipo,materia,grupo,rol,grupo_destino,notas
 */

const CSV_CABECERA = ['docente','dia','tramo','tipo','materia','grupo','rol','grupo_destino','notas'];
const UMBRAL_OK = 0.88;      // match automático fiable
const UMBRAL_DUDOSO = 0.60;  // por debajo → sin match

/**
 * Devuelve el catálogo del centro para poblar los desplegables de revisión.
 */
function catalogoImportacion() {
  return {
    docentes: listarDocentes().map(function(d) {
      return { id: d.id, nombre: d.nombre_corto, extra: d.nombre_completo || '' };
    }),
    grupos: listarGrupos().map(function(g) {
      return { id: g.id, nombre: g.nombre_corto, extra: g.nombre_largo || '' };
    }),
    materias: listarMaterias().map(function(m) {
      return { id: m.id, nombre: m.nombre, extra: m.abreviatura || '' };
    }),
    roles: listarRoles().map(function(r) {
      return { id: r.id, nombre: r.nombre, extra: r.nombre_largo || '' };
    }),
    tramos: listarTramos().map(function(t) {
      return { id: t.id, orden: t.orden, etiqueta: t.etiqueta || '',
               horas: (t.hora_inicio || '') + '-' + (t.hora_fin || '') };
    })
  };
}

function analizarCSV(csvText) {
  if (!csvText || !String(csvText).trim()) {
    throw new Error('El CSV está vacío.');
  }

  const cat = catalogoImportacion();
  const catDoc = cat.docentes.map(function(d) { return { id: d.id, nombre: d.nombre, alt: d.extra }; });
  const catGru = cat.grupos.map(function(g) { return { id: g.id, nombre: g.nombre, alt: g.extra }; });
  const catMat = cat.materias.map(function(m) { return { id: m.id, nombre: m.nombre, alt: m.extra }; });
  const catRol = cat.roles.map(function(r) { return { id: r.id, nombre: r.nombre, alt: r.extra }; });
  const tramosPorOrden = {};
  cat.tramos.forEach(function(t) { tramosPorOrden[t.orden] = t.id; });

  const crudas = _parsearFilasCSV(csvText);

  // Decodificar cada fila y hacer matching.
  const filas = crudas.map(function(c, i) {
    const dec = _decodificarTramo(c.tramo);
    const fila = {
      n: i + 1,
      raw: c,
      dia: (c.dia || '').trim().toUpperCase(),
      tramoOrden: dec.orden,
      mitad: dec.mitad,
      tipo: (c.tipo || '').trim().toLowerCase(),
      notas: c.notas || '',
      semana: '',
      avisos: []
    };

    fila.tramoId = tramosPorOrden[dec.orden] || '';
    if (!fila.tramoId && dec.orden) fila.avisos.push('No existe el tramo ' + dec.orden + ' en el centro');
    if (['L','M','X','J','V'].indexOf(fila.dia) === -1) fila.avisos.push('Día no válido: "' + c.dia + '"');

    fila.docente = _match(c.docente, catDoc);
    if (fila.tipo === 'grupo') {
      fila.materia = _match(c.materia, catMat);
      fila.grupo = _match(c.grupo, catGru);
    } else if (fila.tipo === 'localizacion') {
      fila.rol = _match(c.rol, catRol);
      fila.grupoDestino = _match(c.grupo_destino, catGru);
    } else if (fila.tipo === 'especial') {
      fila.rol = _match(c.rol, catRol);
    } else {
      fila.avisos.push('Tipo desconocido: "' + c.tipo + '"');
    }

    if (/^\?\?/.test(c.notas || '') || c.docente === '??' || c.materia === '??' ||
        c.rol === '??' || c.grupo === '??') {
      fila.avisos.push('Marcada con ?? por el Gem: revisar');
    }

    return fila;
  });

  _detectarAlternancias(filas);
  _detectarConflictos(filas);
  filas.forEach(_calcularEstadoFila);

  return { filas: filas, catalogo: cat };
}

/**
 * Aplica las filas ya resueltas por el usuario. Cada fila debe traer los
 * ids definitivos elegidos en la pantalla de revisión.
 */
function aplicarImportacionCSV(filas) {
  if (!Array.isArray(filas)) throw new Error('Formato inválido.');

  const nuevas = [];
  const errores = [];

  filas.forEach(function(f) {
    if (f.omitir) return;
    if (!f.docente_id || !f.tramo_id || !f.dia) {
      errores.push('Fila ' + f.n + ': faltan docente, tramo o día.');
      return;
    }
    const fila = {
      docente_id: f.docente_id,
      dia: f.dia,
      tramo_id: f.tramo_id,
      tipo: f.tipo,
      grupo_id: '', materia_id: '',
      localizacion_id: '', rol_loc_id: '', grupo_destino_id: '',
      rol_especial_id: '',
      notas: f.notas || '',
      mitad: f.mitad || '',
      semana: f.semana || ''
    };
    if (f.tipo === 'grupo') {
      fila.grupo_id = f.grupo_id || '';
      fila.materia_id = f.materia_id || '';
    } else if (f.tipo === 'localizacion') {
      fila.rol_loc_id = f.rol_id || '';
      fila.grupo_destino_id = f.grupo_destino_id || '';
    } else if (f.tipo === 'especial') {
      fila.rol_especial_id = f.rol_id || '';
    }
    nuevas.push(fila);
  });

  if (errores.length) {
    throw new Error('No se pudo aplicar:\n' + errores.join('\n'));
  }

  // Añadir en bloque a _Ocupaciones (sin borrar lo existente).
  _appendOcupaciones(nuevas);

  return { ok: true, total: nuevas.length };
}

// ---------- Parseo CSV ----------

function _parsearFilasCSV(texto) {
  const lineas = String(texto).replace(/\r/g, '').split('\n')
    .filter(function(l) { return l.trim() !== ''; });
  if (lineas.length === 0) return [];

  // Detectar y saltar cabecera si está.
  let inicio = 0;
  const prim = _split(lineas[0]).map(function(s) { return s.trim().toLowerCase(); });
  if (prim[0] === 'docente' && prim.indexOf('tramo') !== -1) inicio = 1;

  const filas = [];
  for (let i = inicio; i < lineas.length; i++) {
    const campos = _split(lineas[i]);
    if (campos.length < 4) continue; // línea basura
    filas.push({
      docente: (campos[0] || '').trim(),
      dia: (campos[1] || '').trim(),
      tramo: (campos[2] || '').trim(),
      tipo: (campos[3] || '').trim(),
      materia: (campos[4] || '').trim(),
      grupo: (campos[5] || '').trim(),
      rol: (campos[6] || '').trim(),
      grupo_destino: (campos[7] || '').trim(),
      notas: (campos[8] || '').trim()
    });
  }
  return filas;
}

/** Split CSV tolerante a comillas dobles. */
function _split(linea) {
  const out = [];
  let cur = '', dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') { dentro = !dentro; continue; }
    if (ch === ',' && !dentro) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** "5" → {orden:5, mitad:''}; "5a" → {orden:5, mitad:'1'}; "5b" → {orden:5, mitad:'2'} */
function _decodificarTramo(t) {
  const s = String(t || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*([ab])?$/);
  if (!m) return { orden: parseInt(s, 10) || 0, mitad: '' };
  return {
    orden: parseInt(m[1], 10),
    mitad: m[2] === 'a' ? '1' : (m[2] === 'b' ? '2' : '')
  };
}

// ---------- Matching difuso ----------

function _match(texto, candidatos) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t) return { texto: '', id: '', nombre: '', score: 0, estado: 'vacio' };

  const norm = _norm(t);
  let mejor = null, mejorScore = 0;
  candidatos.forEach(function(c) {
    const s1 = _sim(norm, _norm(c.nombre));
    const s2 = c.alt ? _sim(norm, _norm(c.alt)) : 0;
    const s = Math.max(s1, s2);
    if (s > mejorScore) { mejorScore = s; mejor = c; }
  });

  let estado = 'nomatch';
  if (mejorScore >= UMBRAL_OK) estado = 'ok';
  else if (mejorScore >= UMBRAL_DUDOSO) estado = 'dudoso';

  return {
    texto: t,
    id: mejor && estado !== 'nomatch' ? mejor.id : '',
    nombre: mejor && estado !== 'nomatch' ? mejor.nombre : '',
    score: Math.round(mejorScore * 100) / 100,
    estado: estado
  };
}

function _norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud 0..1 basada en distancia de Levenshtein. */
function _sim(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const d = _lev(a, b);
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - d / max;
}

function _lev(a, b) {
  const m = a.length, n = b.length;
  const fila = [];
  for (let j = 0; j <= n; j++) fila[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = fila[0];
    fila[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return fila[n];
}

// ---------- Alternancias, conflictos, estado ----------

/**
 * Agrupa por (docente, dia, tramo, mitad). Si en un grupo hay dos filas con
 * contenido distinto (mismo docente, imposible a la vez) → alternancia:
 * asigna semana A/B. Si son idénticas → duplicado, marca para omitir una.
 */
function _detectarAlternancias(filas) {
  const grupos = {};
  filas.forEach(function(f) {
    const k = [f.docente.texto, f.dia, f.tramoOrden, f.mitad].join('|');
    (grupos[k] = grupos[k] || []).push(f);
  });
  Object.keys(grupos).forEach(function(k) {
    const g = grupos[k];
    if (g.length < 2) return;
    const firmas = {};
    g.forEach(function(f) { firmas[_firma(f)] = (firmas[_firma(f)] || 0) + 1; });
    const distintas = Object.keys(firmas).length;
    if (distintas === 1) {
      // duplicados exactos: conserva la primera, omite el resto
      g.forEach(function(f, i) { if (i > 0) { f.omitir = true; f.avisos.push('Duplicado exacto, se omite'); } });
    } else if (distintas === 2 && g.length === 2) {
      g[0].semana = 'A'; g[1].semana = 'B';
      g[0].avisos.push('Alternancia semanal detectada (semana A)');
      g[1].avisos.push('Alternancia semanal detectada (semana B)');
    } else {
      g.forEach(function(f) { f.avisos.push('Varias ocupaciones en el mismo tramo: revisar a mano'); });
    }
  });
}

function _firma(f) {
  return [f.tipo,
    f.grupo ? f.grupo.texto : '', f.materia ? f.materia.texto : '',
    f.rol ? f.rol.texto : '', f.grupoDestino ? f.grupoDestino.texto : ''
  ].join('|');
}

/** Marca conflicto si el docente ya está ocupado en ese día/tramo/mitad/semana. */
function _detectarConflictos(filas) {
  const existentes = getAll(SHEETS.OCUPACIONES);
  const ocupado = {};
  existentes.forEach(function(o) {
    ocupado[[o.docente_id, o.dia, o.tramo_id, o.mitad || '', o.semana || ''].join('|')] = true;
  });
  filas.forEach(function(f) {
    if (f.omitir || !f.docente.id || !f.tramoId) return;
    const k = [f.docente.id, f.dia, f.tramoId, f.mitad, f.semana].join('|');
    if (ocupado[k]) f.avisos.push('CONFLICTO: el docente ya tiene algo en ese tramo (ya existe en _Ocupaciones)');
  });
}

function _calcularEstadoFila(f) {
  if (f.omitir) { f.estadoFila = 'omitir'; return; }
  const tieneConflicto = f.avisos.some(function(a) { return a.indexOf('CONFLICTO') === 0; });
  const partes = [f.docente];
  if (f.tipo === 'grupo') partes.push(f.materia, f.grupo);
  else if (f.tipo === 'localizacion') partes.push(f.rol, f.grupoDestino);
  else if (f.tipo === 'especial') partes.push(f.rol);

  const hayNomatch = partes.some(function(p) { return p && (p.estado === 'nomatch'); });
  const hayDudoso = partes.some(function(p) { return p && p.estado === 'dudoso'; });
  const faltaTramo = !f.tramoId;

  if (tieneConflicto) f.estadoFila = 'conflicto';
  else if (hayNomatch || faltaTramo || f.avisos.length > 0) f.estadoFila = 'revisar';
  else if (hayDudoso) f.estadoFila = 'dudoso';
  else f.estadoFila = 'ok';
}

// ---------- Escritura ----------

function _appendOcupaciones(nuevas) {
  const sheet = getBd().getSheetByName(SHEETS.OCUPACIONES);
  if (!sheet) throw new Error('No existe la pestaña ' + SHEETS.OCUPACIONES);
  const headers = SCHEMA[SHEETS.OCUPACIONES];

  // Calcular próximo id continuando desde el máximo.
  const existentes = getAll(SHEETS.OCUPACIONES);
  let maxN = 0;
  existentes.forEach(function(o) {
    const m = String(o.id).match(/^ocup_(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
  });

  const rows = nuevas.map(function(o) {
    maxN++;
    o.id = 'ocup_' + maxN;
    return headers.map(function(h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
}

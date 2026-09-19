/**
 * Extracción de catálogo a partir de un volcado de horarios.
 *
 * Un volcado de ocupaciones (el CSV del Gem o texto pegado) contiene, de
 * forma implícita, casi todo el catálogo del centro: docentes, grupos,
 * materias, cargos/roles y hasta la numeración de tramos. Antes de poder
 * volcar las ocupaciones hace falta que ese catálogo exista (el matching se
 * hace contra él). Este módulo lo detecta y lo crea, para que pegar los
 * horarios sirva también para arrancar la configuración.
 *
 * Flujo:
 *   1) extraerEntidadesVolcado(texto, fuente) → qué docentes/grupos/materias/
 *      roles/tramos aparecen, marcando cuáles son nuevos respecto al centro.
 *   2) crearEntidadesVolcado(seleccion, modo) → los crea (por defecto
 *      "combinar": añade lo nuevo y conserva lo existente).
 */

function extraerEntidadesVolcado(texto, fuente) {
  const crudas = _crudasVolcado(texto, fuente);
  if (!crudas.length) {
    throw new Error('No se ha podido leer ninguna línea. Revisa el formato.');
  }

  const docSet = _acumulador();
  const gruSet = _acumulador();
  const matSet = _acumulador();
  const rolSet = _acumulador();
  const ordenes = {};

  crudas.forEach(function(c) {
    const tipo = (c.tipo || '').trim().toLowerCase();

    if (c.docente && !_basura(c.docente)) docSet.add(c.docente);

    // Tramo (número, ignorando el sufijo a/b de mitades).
    const dec = _decodificarTramo(c.tramo);
    if (dec.orden) ordenes[dec.orden] = true;

    if (tipo === 'grupo') {
      if (c.materia && !_basura(c.materia)) matSet.add(c.materia);
      if (c.grupo && !_basura(c.grupo)) gruSet.add(c.grupo);
    } else if (tipo === 'localizacion') {
      if (c.rol && !_basura(c.rol)) rolSet.add(c.rol);
      // grupo_destino puede venir combinado: "6º B y 6º C".
      _partirGrupos(c.grupo_destino).forEach(function(g) { if (!_basura(g)) gruSet.add(g); });
    } else if (tipo === 'especial') {
      if (c.rol && !_basura(c.rol)) rolSet.add(c.rol);
    }
  });

  // Catálogo existente para marcar novedades.
  const exDoc = _claves(listarDocentes(), 'nombre_corto');
  const exGru = _claves(listarGrupos(), 'nombre_corto');
  const exMat = _claves(listarMaterias(), 'nombre');
  const exRol = _claves(listarRoles(), 'nombre');
  const exTramos = listarTramos().length;

  const docentes = docSet.lista().map(function(n) { return { nombre: n, existe: exDoc[_keyNorm(n)] === true }; });
  const grupos = gruSet.lista().map(function(n) { return { nombre: n, nivel: _detectarNivel(n), existe: exGru[_keyNorm(n)] === true }; });
  const materias = matSet.lista().map(function(n) { return { nombre: n, existe: exMat[_keyNorm(n)] === true }; });
  const roles = rolSet.lista().map(function(n) { return { nombre: n, existe: exRol[_keyNorm(n)] === true }; });

  const listaOrdenes = Object.keys(ordenes).map(Number).sort(function(a, b) { return a - b; });
  const tramos = { ordenes: listaOrdenes, existe: exTramos > 0, total: listaOrdenes.length };

  const nuevos = function(arr) { return arr.filter(function(x) { return !x.existe; }).length; };

  return {
    filas: crudas.length,
    docentes: docentes,
    grupos: grupos,
    materias: materias,
    roles: roles,
    tramos: tramos,
    nuevos: {
      docentes: nuevos(docentes),
      grupos: nuevos(grupos),
      materias: nuevos(materias),
      roles: nuevos(roles),
      tramos: tramos.existe ? 0 : listaOrdenes.length
    }
  };
}

/**
 * Crea las entidades seleccionadas. `seleccion` trae, por tipo, las listas
 * completas detectadas (el modo "combinar" evita duplicados):
 *   { docentes:[nombre], grupos:[{nombre,nivel}], materias:[nombre],
 *     roles:[nombre], tramosOrdenes:[n] }
 */
function crearEntidadesVolcado(seleccion, modo) {
  seleccion = seleccion || {};
  modo = modo || 'combinar';
  const resumen = {};

  if (seleccion.docentes && seleccion.docentes.length) {
    guardarDocentes(seleccion.docentes.map(function(n) {
      return { nombre_corto: String(n).trim(), activo: true };
    }), modo);
    resumen.docentes = seleccion.docentes.length;
  }

  if (seleccion.grupos && seleccion.grupos.length) {
    guardarGrupos(seleccion.grupos.map(function(g) {
      return { nombre_corto: String(g.nombre).trim(), nivel: g.nivel || _detectarNivel(g.nombre) || '' };
    }), modo);
    resumen.grupos = seleccion.grupos.length;
  }

  if (seleccion.materias && seleccion.materias.length) {
    guardarMaterias(seleccion.materias.map(function(n) {
      return { nombre: String(n).trim() };
    }), modo);
    resumen.materias = seleccion.materias.length;
  }

  if (seleccion.roles && seleccion.roles.length) {
    guardarRoles(seleccion.roles.map(function(n) {
      return { nombre: String(n).trim() };
    }), modo);
    resumen.roles = seleccion.roles.length;
  }

  // Tramos: solo se crean si el centro aún no tiene ninguno (no sabemos las
  // horas reales, así que generamos una rejilla por defecto que el usuario
  // podrá ajustar; el tramo que falte en la secuencia se marca como recreo).
  if (seleccion.tramosOrdenes && seleccion.tramosOrdenes.length && listarTramos().length === 0) {
    const filas = _generarTramosDesdeOrdenes(seleccion.tramosOrdenes);
    guardarTramos(filas, 'reemplazar');
    resumen.tramos = filas.length;
  }

  return { ok: true, resumen: resumen };
}

// ---------- Internos ----------

/** Parte el volcado en filas crudas según la fuente (csv/texto/auto). */
function _crudasVolcado(texto, fuente) {
  if (!texto || !String(texto).trim()) throw new Error('Pega algún dato primero.');
  if (fuente === 'texto') return _crudasDesdeTexto(texto);
  if (fuente === 'csv') return _parsearFilasCSV(texto);
  // Auto: si la primera línea parece CSV (cabecera o varias comas), CSV.
  const prim = String(texto).replace(/\r/g, '').split('\n').filter(function(l) { return l.trim(); })[0] || '';
  if (/^\s*docente\b/i.test(prim) || (prim.match(/,/g) || []).length >= 3) return _parsearFilasCSV(texto);
  return _crudasDesdeTexto(texto);
}

function _acumulador() {
  const vistos = {};
  const orden = [];
  return {
    add: function(v) {
      const t = String(v == null ? '' : v).trim();
      if (!t) return;
      const k = _keyNorm(t);
      if (!vistos[k]) { vistos[k] = true; orden.push(t); }
    },
    lista: function() { return orden; }
  };
}

function _claves(filas, campo) {
  const r = {};
  (filas || []).forEach(function(o) { r[_keyNorm(o[campo])] = true; });
  return r;
}

/** Marca vacíos y los "??" del Gem como no aprovechables. */
function _basura(v) {
  const t = String(v == null ? '' : v).trim();
  return !t || t === '??' || /^\?\?/.test(t);
}

/** "6º B y 6º C" → ["6º B", "6º C"]; "3º B" → ["3º B"]. */
function _partirGrupos(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return [];
  return t.split(/\s+y\s+|\s*\/\s*|\s*,\s*/i).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
}

/**
 * Genera tramos a partir de la lista de órdenes que aparecen en el volcado.
 * Rejilla de 45 min desde las 09:00. Los huecos de la secuencia (p.ej. el 4,
 * si hay 1,2,3,5,6) se marcan como recreo.
 */
function _generarTramosDesdeOrdenes(ordenes) {
  const set = {};
  ordenes.forEach(function(o) { const n = parseInt(o, 10); if (n) set[n] = true; });
  let max = 0;
  Object.keys(set).forEach(function(k) { const n = parseInt(k, 10); if (n > max) max = n; });
  if (max === 0) return [];

  const filas = [];
  let hora = 9 * 60; // 09:00 en minutos
  for (let orden = 1; orden <= max; orden++) {
    const esRecreo = !set[orden];
    const dur = esRecreo ? 30 : 45;
    filas.push({
      hora_inicio: _minsAHora(hora),
      hora_fin: _minsAHora(hora + dur),
      es_recreo: esRecreo,
      etiqueta: esRecreo ? 'Recreo' : ('TR' + String(orden).padStart(2, '0'))
    });
    hora += dur;
  }
  return filas;
}

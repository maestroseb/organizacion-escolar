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
  _aplicarSinonimosCrudas(crudas); // reconoce RH/M55 aunque el Gem lo dejara en notas

  const docSet = _acumulador();
  const gruSet = _acumulador();
  const matSet = _acumulador();
  const rolSet = _acumulador();
  const ordenes = {};
  // Columnas opcionales del CSV: nombre completo del docente y abreviatura.
  const completoDe = {};
  const horas = {};       // orden → [inicio, fin]
  const soloRecreo = {};  // orden → true si todas sus filas son de recreo
  const abrevDe = {};

  crudas.forEach(function(c) {
    const tipo = (c.tipo || '').trim().toLowerCase();

    if (c.docente && !_basura(c.docente)) {
      docSet.add(c.docente);
      if (c.docente_completo) completoDe[_keyNorm(c.docente)] = c.docente_completo;
    }
    if (tipo === 'grupo' && c.materia && c.abreviatura) abrevDe[_keyNorm(c.materia)] = c.abreviatura;

    // Tramo (número, ignorando el sufijo a/b de mitades).
    const dec = _decodificarTramo(c.tramo);
    if (dec.orden) {
      ordenes[dec.orden] = true;
      // Horas del tramo (columnas opcionales); en tramos partidos (5a/5b) no
      // valen para el tramo entero.
      if (!dec.mitad && /^\d{1,2}:\d{2}$/.test(c.hora_inicio || '') && /^\d{1,2}:\d{2}$/.test(c.hora_fin || '') && !horas[dec.orden]) {
        horas[dec.orden] = [c.hora_inicio, c.hora_fin];
      }
      // Recreo: tramo en el que todo lo que hay es vigilancia de recreo.
      const esRec = tipo === 'especial' && /recreo|^gua/i.test(c.rol || '');
      soloRecreo[dec.orden] = (soloRecreo[dec.orden] !== false) && esRec;
    }

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
  // Un docente ya existe si coincide su nombre corto o el completo (así no
  // se duplica al reimportar con nombre corto + completo).
  const listaDoc = listarDocentes();
  const exDoc = _claves(listaDoc, 'nombre_corto');
  const exDocCompleto = _claves(listaDoc, 'nombre_completo');
  const exGru = _claves(listarGrupos(), 'nombre_corto');
  const listaMat = listarMaterias();
  const exMat = _claves(listaMat, 'nombre');
  // Existentes a los que el CSV puede completar algo vacío (nombre completo
  // del docente, abreviatura de la materia).
  const docVacio = {}, matVacia = {};
  listaDoc.forEach(function(d) { if (!String(d.nombre_completo || '').trim()) docVacio[_keyNorm(d.nombre_corto)] = true; });
  listaMat.forEach(function(m) { if (!String(m.abreviatura || '').trim()) matVacia[_keyNorm(m.nombre)] = true; });
  const exRol = _claves(listarRoles(), 'nombre');
  const exTramos = listarTramos().length;

  const docentes = docSet.lista().map(function(n) {
    const completo = completoDe[_keyNorm(n)] || '';
    const kc = _keyNorm(completo);
    const existe = exDoc[_keyNorm(n)] === true || exDocCompleto[_keyNorm(n)] === true ||
      (!!kc && (exDoc[kc] === true || exDocCompleto[kc] === true));
    return { nombre: n, completo: completo, existe: existe, completar: existe && !!completo && docVacio[_keyNorm(n)] === true };
  });
  const grupos = gruSet.lista().map(function(n) { return { nombre: n, nivel: _detectarNivel(n), existe: exGru[_keyNorm(n)] === true }; });
  const materias = matSet.lista().map(function(n) {
    const abreviatura = abrevDe[_keyNorm(n)] || '';
    const existe = exMat[_keyNorm(n)] === true;
    return { nombre: n, abreviatura: abreviatura, existe: existe, completar: existe && !!abreviatura && matVacia[_keyNorm(n)] === true };
  });
  const roles = rolSet.lista().map(function(n) { return { nombre: n, existe: exRol[_keyNorm(n)] === true }; });

  const listaOrdenes = Object.keys(ordenes).map(Number).sort(function(a, b) { return a - b; });
  const tramos = {
    ordenes: listaOrdenes, existe: exTramos > 0, total: listaOrdenes.length,
    horas: horas,
    recreos: listaOrdenes.filter(function(o) { return soloRecreo[o] === true; })
  };

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
    },
    completar: {
      docentes: docentes.filter(function(x) { return x.completar; }).length,
      materias: materias.filter(function(x) { return x.completar; }).length
    }
  };
}

/**
 * Crea las entidades seleccionadas. `seleccion` trae, por tipo, las listas
 * completas detectadas (el modo "combinar" evita duplicados):
 *   { docentes:[nombre | {nombre,completo}], grupos:[{nombre,nivel}],
 *     materias:[nombre | {nombre,abreviatura}], roles:[nombre], tramosOrdenes:[n],
 *     tramosHoras:{orden:[inicio,fin]}, tramosRecreo:[orden] }
 */
function crearEntidadesVolcado(seleccion, modo) {
  _exigirEdicion();
  seleccion = seleccion || {};
  modo = modo || 'combinar';
  const resumen = {};

  if (seleccion.docentes && seleccion.docentes.length) {
    const lista = _docentesSinDuplicar(seleccion.docentes.map(function(d) {
      const o = typeof d === 'object' && d ? d : { nombre: d };
      return { nombre_corto: String(o.nombre).trim(), nombre_completo: String(o.completo || '').trim(), activo: true };
    }));
    if (lista.length) guardarDocentes(lista, modo);
    resumen.docentes = lista.length;
  }

  if (seleccion.grupos && seleccion.grupos.length) {
    guardarGrupos(seleccion.grupos.map(function(g) {
      return { nombre_corto: String(g.nombre).trim(), nivel: g.nivel || _detectarNivel(g.nombre) || '' };
    }), modo);
    resumen.grupos = seleccion.grupos.length;
  }

  if (seleccion.materias && seleccion.materias.length) {
    guardarMaterias(seleccion.materias.map(function(m) {
      const o = typeof m === 'object' && m ? m : { nombre: m };
      return { nombre: String(o.nombre).trim(), abreviatura: String(o.abreviatura || '').trim() };
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
    const filas = _generarTramosDesdeOrdenes(seleccion.tramosOrdenes, seleccion.tramosHoras, seleccion.tramosRecreo);
    guardarTramos(filas, 'reemplazar');
    resumen.tramos = filas.length;
  }

  return { ok: true, resumen: resumen };
}

// ---------- Internos ----------

/**
 * Evita duplicar docentes al crear el catálogo. Si ya existe por su nombre
 * corto, solo se le completa el nombre completo vacío. Si existe por su nombre completo (como nombre corto o completo de otro), no
 * se crea. Si existe uno cuyo nombre corto ES su nombre completo y aún no
 * tiene nombre completo (importación anterior con el nombre largo), se
 * corrige ese docente: pasa a tener el nombre corto y el completo nuevos.
 */
function _docentesSinDuplicar(entrantes) {
  const docs = getAll(SHEETS.DOCENTES);
  const porCorto = {}, porCompleto = {};
  docs.forEach(function(d) {
    porCorto[_keyNorm(d.nombre_corto)] = d;
    const k = _keyNorm(d.nombre_completo); if (k) porCompleto[k] = d;
  });
  let renombrados = false;
  const quedan = entrantes.filter(function(e) {
    const kn = _keyNorm(e.nombre_corto), kc = _keyNorm(e.nombre_completo);
    if (porCorto[kn]) {
      // Ya existe: solo se completa el nombre completo si lo tenía vacío (no
      // se pasa por guardarDocentes, que reescribiría permisos y orden).
      const d = porCorto[kn];
      if (kc && !String(d.nombre_completo || '').trim()) { d.nombre_completo = e.nombre_completo; porCompleto[kc] = d; renombrados = true; }
      return false;
    }
    if (!kc) return !porCompleto[kn];
    if (porCompleto[kc]) return false;
    const viejo = porCorto[kc];
    if (viejo) {
      if (!String(viejo.nombre_completo || '').trim()) {
        delete porCorto[kc];
        viejo.nombre_corto = e.nombre_corto; viejo.nombre_completo = e.nombre_completo;
        porCorto[kn] = viejo; porCompleto[kc] = viejo;
        renombrados = true;
      }
      return false;
    }
    return true;
  });
  if (renombrados) bulkReplace_(SHEETS.DOCENTES, docs);
  return quedan;
}

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
function _generarTramosDesdeOrdenes(ordenes, horas, recreos) {
  horas = horas || {};
  const rec = {};
  (recreos || []).forEach(function(o) { rec[parseInt(o, 10)] = true; });
  const set = {};
  ordenes.forEach(function(o) { const n = parseInt(o, 10); if (n) set[n] = true; });
  let max = 0;
  Object.keys(set).forEach(function(k) { const n = parseInt(k, 10); if (n > max) max = n; });
  if (max === 0) return [];

  // Sin horas en el volcado: rejilla de 45 min desde las 09:00 (recreo 30).
  const filas = [];
  let hora = 9 * 60;
  for (let orden = 1; orden <= max; orden++) {
    const esRecreo = !set[orden] || rec[orden] === true;
    const h = horas[orden];
    const ini = h ? _horaAMins(h[0]) : hora;
    const fin = h ? _horaAMins(h[1]) : hora + (esRecreo ? 30 : 45);
    filas.push({
      hora_inicio: _minsAHora(ini),
      hora_fin: _minsAHora(fin),
      es_recreo: esRecreo,
      etiqueta: esRecreo ? 'Recreo' : ('TR' + String(orden).padStart(2, '0'))
    });
    hora = fin;
  }
  return filas;
}

function _horaAMins(h) {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

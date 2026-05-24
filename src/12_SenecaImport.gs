/**
 * Importador del XML "Exportación de Horarios" de Séneca.
 *
 * Estrategia en dos fases:
 *   1) parsearSeneca(xmlText) → devuelve un objeto preview con todas las
 *      entidades extraídas, sin tocar el libro. El frontend lo muestra al
 *      usuario en una tabla resumen.
 *   2) aplicarSeneca(datos) → coge ese objeto (posiblemente filtrado por
 *      el usuario) y vuelca todo en _Centro, _Tramos, _Grupos, _Docentes,
 *      _Localizaciones, _Materias y _RolesEspeciales.
 *
 * El XML viene en ISO-8859-1. La conversión a UTF-8 se hace en el cliente
 * con FileReader.readAsText(file, 'ISO-8859-1') antes de enviarlo.
 */

function parsearSeneca(xmlText) {
  if (!xmlText || !String(xmlText).trim()) {
    throw new Error('El archivo XML está vacío.');
  }

  // El cliente nos pasa la cadena ya decodificada en JS, así que la
  // declaración encoding="ISO-8859-1" del XML hace que XmlService se
  // confunda y emita mojibake (InglÃ©s en lugar de Inglés). La
  // forzamos a UTF-8 (que es lo que ya tenemos en memoria).
  const normalizado = String(xmlText)
    .replace(/^﻿/, '')
    .replace(/encoding\s*=\s*["'][^"']+["']/i, 'encoding="UTF-8"');

  let root;
  try {
    root = XmlService.parse(normalizado).getRootElement();
  } catch (e) {
    throw new Error('No se pudo leer el XML: ' + e.message);
  }
  const bloque = root.getChild('BLOQUE_DATOS');
  if (!bloque) throw new Error('XML inesperado: falta BLOQUE_DATOS.');

  const secciones = _agruparPorSeq(bloque.getChildren('grupo_datos'));

  return {
    centro:         _parsearAnnoAcademico(secciones.ANNO_ACADEMICO),
    cursos:         _parsearCursos(secciones.CURSOS_DEL_CENTRO),
    tramos:         _parsearTramos(secciones.TRAMOS_HORARIOS),
    unidades:       _parsearUnidades(secciones.UNIDADES, secciones.CURSOS_DEL_CENTRO),
    docentes:       _parsearEmpleados(secciones.EMPLEADOS),
    localizaciones: _parsearDependencias(secciones.DEPENDENCIAS),
    materias:       _parsearMaterias(secciones.MATERIAS),
    roles:          _parsearActividades(secciones.ACTIVIDADES)
  };
}

/**
 * Aplica el resultado del parser al libro. `seleccion` es el mismo objeto
 * que devuelve parsearSeneca, posiblemente con algunos arrays vacíos si el
 * usuario ha desmarcado secciones.
 *
 * Las preferencias del wizard (etapas, líneas, bilingüe) se deducen del XML.
 */
function aplicarSeneca(seleccion) {
  if (!seleccion || typeof seleccion !== 'object') {
    throw new Error('Sin datos a aplicar.');
  }

  const resumen = {};

  if (seleccion.centro) {
    const c = seleccion.centro;
    const etapasDetect = _detectarEtapas(seleccion.unidades || []);
    guardarCentro({
      nombre: c.nombre || 'Centro',
      codigo: c.codigo || '',
      localidad: '', provincia: '', comunidad: 'Andalucía',
      curso_academico: c.curso_academico || '',
      fecha_inicio: c.fecha_inicio || '',
      fecha_fin: c.fecha_fin || '',
      etapas: etapasDetect.join(','),
      lineas: '',
      bilingue: 'no'
    });
    resumen.centro = 1;
  }

  if (seleccion.tramos && seleccion.tramos.length) {
    guardarTramos(seleccion.tramos.map(function(t) {
      return {
        hora_inicio: t.hora_inicio, hora_fin: t.hora_fin,
        es_recreo: !!t.es_recreo, etiqueta: t.etiqueta || ''
      };
    }));
    resumen.tramos = seleccion.tramos.length;
  }

  if (seleccion.unidades && seleccion.unidades.length) {
    guardarGrupos(seleccion.unidades.map(function(u) {
      return {
        nombre_corto: u.nombre_corto,
        nombre_largo: u.nombre_largo,
        nivel: u.nivel
      };
    }));
    resumen.grupos = seleccion.unidades.length;
  }

  if (seleccion.docentes && seleccion.docentes.length) {
    guardarDocentes(seleccion.docentes.map(function(d) {
      return {
        nombre_corto: d.nombre_corto,
        nombre_completo: d.nombre_completo,
        puesto: d.puesto,
        email: '', activo: true
      };
    }));
    resumen.docentes = seleccion.docentes.length;
  }

  if (seleccion.localizaciones && seleccion.localizaciones.length) {
    guardarLocalizaciones(seleccion.localizaciones.map(function(l) {
      return { codigo: l.codigo, descripcion: l.descripcion || '' };
    }));
    resumen.localizaciones = seleccion.localizaciones.length;
  }

  if (seleccion.materias && seleccion.materias.length) {
    guardarMaterias(seleccion.materias.map(function(m) {
      return {
        nombre: m.nombre, abreviatura: m.abreviatura || '',
        es_recreo: !!m.es_recreo
      };
    }));
    resumen.materias = seleccion.materias.length;
  }

  if (seleccion.roles && seleccion.roles.length) {
    guardarRoles(seleccion.roles.map(function(r) {
      return { nombre: r.nombre, nombre_largo: r.nombre_largo || '' };
    }));
    resumen.roles = seleccion.roles.length;
  }

  return { ok: true, resumen: resumen };
}

// ---------- Helpers de parseo ----------

function _agruparPorSeq(elems) {
  const r = {};
  elems.forEach(function(e) {
    const seq = e.getAttribute('seq') && e.getAttribute('seq').getValue();
    if (seq) r[seq] = e;
  });
  return r;
}

function _leerDatos(elem) {
  const r = {};
  if (!elem) return r;
  elem.getChildren('dato').forEach(function(d) {
    const nombre = d.getAttribute('nombre_dato') && d.getAttribute('nombre_dato').getValue();
    if (nombre) r[nombre] = d.getText();
  });
  return r;
}

function _leerHijos(elem) {
  if (!elem) return [];
  return elem.getChildren('grupo_datos');
}

function _parsearAnnoAcademico(seccion) {
  if (!seccion) return null;
  const d = _leerDatos(seccion);
  const anno = parseInt(d.C_ANNO, 10);
  return {
    nombre: '',
    codigo: '',
    curso_academico: anno ? (anno + '-' + (anno + 1)) : '',
    fecha_inicio: _fechaSeneca(d.F_INIHORREG),
    fecha_fin: _fechaSeneca(d.F_FINHORREG)
  };
}

function _parsearCursos(seccion) {
  const map = {};
  _leerHijos(seccion).forEach(function(c) {
    const d = _leerDatos(c);
    if (d.X_OFERTAMATRIG) map[d.X_OFERTAMATRIG] = d.D_OFERTAMATRIG || '';
  });
  return map;
}

function _parsearTramos(seccion) {
  const items = [];
  _leerHijos(seccion).forEach(function(t) {
    const d = _leerDatos(t);
    const ini = parseInt(d.N_INICIO, 10);
    const fin = parseInt(d.N_FIN, 10);
    if (isNaN(ini) || isNaN(fin)) return;
    items.push({
      etiqueta: (d.T_HORCEN || '').trim(),
      hora_inicio: _minsAHora(ini),
      hora_fin: _minsAHora(fin),
      es_recreo: /recreo|patio/i.test(d.T_HORCEN || '')
    });
  });
  items.sort(function(a, b) { return _minutos(a.hora_inicio) - _minutos(b.hora_inicio); });
  return items;
}

function _parsearUnidades(seccion, cursosSeccion) {
  const cursos = _parsearCursos(cursosSeccion);
  const items = [];
  _leerHijos(seccion).forEach(function(u) {
    const d = _leerDatos(u);
    const cursoTxt = cursos[d.X_OFERTAMATRIG] || '';
    items.push({
      nombre_corto: d.T_NOMBRE || '',
      nombre_largo: cursoTxt,
      nivel: _detectarNivel(cursoTxt)
    });
  });
  return items;
}

function _parsearEmpleados(seccion) {
  const items = [];
  const usados = {};
  _leerHijos(seccion).forEach(function(e) {
    const d = _leerDatos(e);
    const nombre = (d.NOMBRE || '').trim();
    const a1 = (d.APELLIDO1 || '').trim();
    const a2 = (d.APELLIDO2 || '').trim();
    if (!nombre && !a1) return;
    const completo = [nombre, a1, a2].filter(function(x) { return x; }).join(' ');
    let corto = nombre || a1;
    if (usados[corto.toLowerCase()]) {
      corto = (nombre + ' ' + a1).trim();
      let n = 2;
      while (usados[corto.toLowerCase()]) {
        corto = (nombre + ' ' + a1 + ' ' + n).trim();
        n++;
      }
    }
    usados[corto.toLowerCase()] = true;
    items.push({
      nombre_corto: corto,
      nombre_completo: completo,
      puesto: d.D_PUESTO || ''
    });
  });
  return items;
}

function _parsearDependencias(seccion) {
  const items = [];
  _leerHijos(seccion).forEach(function(dep) {
    const d = _leerDatos(dep);
    if (!d.D_DEPENDENCIA) return;
    items.push({ codigo: d.D_DEPENDENCIA.trim(), descripcion: '' });
  });
  return items;
}

function _parsearMaterias(seccion) {
  const vistas = {};
  const items = [];
  _leerHijos(seccion).forEach(function(m) {
    const d = _leerDatos(m);
    const nom = (d.D_MATERIAC || '').trim();
    if (!nom) return;
    const k = nom.toLowerCase();
    if (vistas[k]) return;
    vistas[k] = true;
    items.push({ nombre: nom, abreviatura: '', es_recreo: false });
  });
  return items;
}

/**
 * Filtra el catálogo de 107 actividades a un subset relevante para un CEIP.
 * El usuario podrá editar/quitar/añadir después en el wizard.
 */
function _parsearActividades(seccion) {
  const relevantes = [
    /direcci[óo]n/i, /jefatura/i, /secretar/i,
    /coordin/i, /tde/i,
    /pedagog/i, /pt\b/i, /audici/i, /al\b/i,
    /refuerzo/i, /atedu/i, /apoyo/i,
    /tutor/i, /guardia/i, /recreo/i, /biblioteca/i,
    /convivencia/i, /coeduca/i, /prl/i, /salud/i
  ];
  const items = [];
  const vistas = {};
  _leerHijos(seccion).forEach(function(a) {
    const d = _leerDatos(a);
    const nom = (d.D_ACTIVIDAD || '').trim();
    if (!nom) return;
    const ok = relevantes.some(function(r) { return r.test(nom); });
    if (!ok) return;
    const k = nom.toLowerCase();
    if (vistas[k]) return;
    vistas[k] = true;
    items.push({
      nombre: _siglaActividad(nom),
      nombre_largo: nom
    });
  });
  return items;
}

// ---------- Utilidades ----------

function _minsAHora(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return _pad2(h) + ':' + _pad2(m);
}
function _pad2(n) { return (n < 10 ? '0' : '') + n; }
function _minutos(hhmm) {
  const p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function _fechaSeneca(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}

function _detectarNivel(cursoTxt) {
  const t = (cursoTxt || '').toLowerCase();
  if (/tres/.test(t))   return 'INF3';
  if (/cuatro/.test(t)) return 'INF4';
  if (/cinco/.test(t))  return 'INF5';
  const m = t.match(/^([1-6])/);
  if (m) return m[1] + 'P';
  return '';
}

function _detectarEtapas(unidades) {
  const etapas = {};
  unidades.forEach(function(u) {
    if (!u.nivel) return;
    if (u.nivel.indexOf('INF') === 0) etapas.INFANTIL = true;
    else if (/^[1-6]P$/.test(u.nivel)) etapas.PRIMARIA = true;
  });
  return Object.keys(etapas);
}

function _siglaActividad(nombre) {
  const map = [
    [/direcci[óo]n/i, 'DIR'],
    [/jefatura/i, 'JE'],
    [/secretar/i, 'SEC'],
    [/tde/i, 'TDE'],
    [/coeduca/i, 'COE'],
    [/convivencia/i, 'CON'],
    [/biblioteca/i, 'BIB'],
    [/prl/i, 'PRL'],
    [/salud/i, 'SAL'],
    [/ciclo/i, 'CIC'],
    [/pedagog|^pt/i, 'PT'],
    [/audici|^al/i, 'AL'],
    [/refuerzo/i, 'Ref.'],
    [/atedu/i, 'ATEDU'],
    [/apoyo/i, 'Apoyo'],
    [/tutor/i, 'Tut.'],
    [/guardia.*recreo|recreo.*guardia/i, 'Gua.'],
    [/guardia/i, 'Gua.']
  ];
  for (let i = 0; i < map.length; i++) {
    if (map[i][0].test(nombre)) return map[i][1];
  }
  return nombre.substring(0, 6);
}

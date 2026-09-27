/**
 * Módulos AHORA y SUSTITUCIONES.
 *
 * - datosAhora(): el día de hoy (semana A/B incluida) tramo a tramo, con las
 *   sustituciones del día ya aplicadas. El cliente elige el tramo en curso
 *   con su reloj y navega sin volver a llamar al servidor.
 * - datosSustituciones(fecha): el parte de un día: horario de cada docente
 *   ese día, candidatos por tramo (apoyos por prioridad; `libres` = sin nada
 *   ese tramo, es decir, fuera del centro) y las
 *   sustituciones ya guardadas. Solo Equipo Directivo y Admin.
 * - guardarSustituciones(fecha, lista): reemplaza las de esa fecha.
 */

function datosAhora() {
  const tz = Session.getScriptTimeZone();
  const fecha = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const d = _fechaLocal(fecha).getDay();
  const dia = ['', 'L', 'M', 'X', 'J', 'V', ''][d];
  const semana = semanaActual(fecha);
  if (!dia) return { fecha: fecha, finDeSemana: true, semana: semana, tramos: [] };

  const ctx = _ctxDia(dia, semana);
  const sus = _susDeFecha(fecha);
  const ausentes = {};
  sus.forEach(function(s) { ausentes[s.docente_ausente_id] = true; });

  const nombre = function(id) { const x = ctx.docById[id]; return x ? (String(x.sustituto || '').trim() || x.nombre_corto) : ''; };
  const tramos = ctx.tramos.map(function(t) {
    const data = _sabanaTramoData(t, ctx.ocupDia, ctx);
    // Sustituciones de este tramo: ausente → sustituto.
    const map = {}, cubreGrupo = {};
    sus.filter(function(s) { return s.tramo_id === t.id; }).forEach(function(s) {
      // Cobertura de un grupo (no de una persona): quien entra se añade al curso.
      if (s.grupo_id && !s.docente_ausente_id) { if (s.docente_sustituto_id) cubreGrupo[s.grupo_id] = nombre(s.docente_sustituto_id); return; }
      map[nombre(s.docente_ausente_id)] = nombre(s.docente_sustituto_id);
    });
    const aplicar = function(o) {
      if (o.docente && map.hasOwnProperty(o.docente)) {
        o.ausente = o.docente;
        o.docente = map[o.docente] || '';
        o.sinCubrir = !o.docente;
      }
    };
    data.cursos.forEach(function(c) { c.ocupantes.forEach(aplicar); });
    data.apoyos.forEach(aplicar);
    const cubren = {};
    Object.keys(map).forEach(function(k) { if (map[k]) cubren[map[k]] = true; });
    data.cursos.forEach(function(c) {
      const n = cubreGrupo[c.grupo.id];
      if (!n) return;
      if (c.fallbackTutor) c.ocupantes = [];
      c.ocupantes.push({ docente: n, materia: '', color: '', cubre: true });
      c.vacio = false;
      cubren[n] = true;
    });
    data.libres = data.libres.filter(function(n) { return !cubren[n]; });
    data.apoyos.forEach(function(a) { if (cubren[a.docente] && !a.ausente) a.cubre = true; });
    return data;
  });

  return {
    fecha: fecha, dia: dia, diaLargo: _diaLargo(dia), semana: semana,
    ausentes: Object.keys(ausentes).map(nombre).filter(Boolean),
    tramos: tramos
  };
}

function datosSustituciones(fecha) {
  _exigirPermisoSust();
  fecha = _fechaIso(fecha);
  const dLocal = _fechaLocal(fecha);
  const dia = ['', 'L', 'M', 'X', 'J', 'V', ''][dLocal.getDay()];
  const semana = semanaActual(fecha);
  const base = { fecha: fecha, dia: dia, diaLargo: dia ? _diaLargo(dia) : '', semana: semana };
  if (!dia) return Object.assign(base, { finDeSemana: true });

  const ctx = _ctxDia(dia, semana);

  // Horario del día por docente y tramo (etiqueta compacta + color).
  const horario = {};
  ctx.ocupDia.forEach(function(o) {
    if (!o.docente_id || !ctx.docById[o.docente_id]) return;
    const h = horario[o.docente_id] || (horario[o.docente_id] = {});
    (h[o.tramo_id] || (h[o.tramo_id] = [])).push(_etiquetaOcupacion(o, ctx));
  });

  // Qué tiene cada grupo en cada tramo (para las coberturas por grupo).
  const grupoHorario = {};
  ctx.ocupDia.forEach(function(o) {
    if (o.tipo !== 'grupo') return;
    const m = ctx.materiaById[o.materia_id], d = ctx.docById[o.docente_id];
    _csvIds(o.grupo_id).forEach(function(g) {
      const h = grupoHorario[g] || (grupoHorario[g] = {});
      (h[o.tramo_id] || (h[o.tramo_id] = [])).push({
        texto: d ? (String(d.sustituto || '').trim() || d.nombre_corto) : '¿?',
        area: m ? (m.abreviatura || m.nombre) : '', color: m ? (m.color || '') : ''
      });
    });
  });

  // Candidatos por tramo: apoyos (por prioridad de sustitución) y libres.
  const candidatos = {};
  ctx.tramos.forEach(function(t) {
    if (t.es_recreo) return;
    const ocupados = {};
    ctx.ocupDia.forEach(function(o) { if (o.tramo_id === t.id) ocupados[o.docente_id] = true; });
    const apoyos = [];
    ctx.ocupDia.filter(function(o) { return o.tramo_id === t.id && (o.tipo === 'localizacion' || o.tipo === 'especial'); })
      .forEach(function(o) {
        const rol = ctx.rolById[o.tipo === 'localizacion' ? o.rol_loc_id : o.rol_especial_id];
        apoyos.push({ id: o.docente_id, prio: rol ? (rol.orden || 999) : 999, rol: rol ? rol.nombre : '', cat: categoriaRol(rol || { nombre: o.notas }) });
      });
    apoyos.sort(function(a, b) { return a.prio - b.prio; });
    candidatos[t.id] = {
      apoyos: apoyos.map(function(a) { return { id: a.id, rol: a.rol, cat: a.cat }; }),
      libres: ctx.docentes.filter(function(d) { return !ocupados[d.id]; }).map(function(d) { return d.id; })
    };
  });

  // Reparto: nº de sustituciones hechas en los últimos 30 días (equidad).
  const hace30 = Utilities.formatDate(new Date(dLocal.getTime() - 30 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const todas = getAll(SHEETS.SUSTITUCIONES);
  const carga = {};
  todas.forEach(function(s) {
    const f = String(s.fecha || '');
    if (s.docente_sustituto_id && f >= hace30 && f < fecha) carga[s.docente_sustituto_id] = (carga[s.docente_sustituto_id] || 0) + 1;
  });

  return Object.assign(base, {
    tramos: ctx.tramos.map(function(t) {
      return { id: t.id, orden: t.orden, horas: _hhmm(t.hora_inicio) + ' – ' + _hhmm(t.hora_fin), es_recreo: !!t.es_recreo, color: ctx.colorTramo[t.id] };
    }),
    docentes: ctx.docentes.map(function(d) {
      return { id: d.id, nombre: String(d.sustituto || '').trim() || d.nombre_corto, carga: carga[d.id] || 0 };
    }),
    horario: horario,
    candidatos: candidatos,
    grupos: ctx.grupos.map(function(g) { return { id: g.id, nombre: g.nombre_corto, nivel: g.nivel || '', tutor: g.tutor_id || '' }; }),
    grupoHorario: grupoHorario,
    sustituciones: todas.filter(function(s) { return String(s.fecha) === fecha; }).map(function(s) {
      return { ausente: s.docente_ausente_id || '', grupo: s.grupo_id || '', sustituto: s.docente_sustituto_id || '', tramo: s.tramo_id, notas: s.notas || '' };
    })
  });
}

/**
 * lista: [{ ausente, grupo, sustituto, tramo, notas }]. Reemplaza las de
 * `fecha`. Con `grupo` y sin `ausente` es una cobertura de grupo: alguien
 * entra en ese curso ese tramo (apoyo puntual, entrada, etc.).
 */
function guardarSustituciones(fecha, lista) {
  _exigirPermisoSust();
  fecha = _fechaIso(fecha);
  if (!Array.isArray(lista)) throw new Error('Formato inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const resto = getAll(SHEETS.SUSTITUCIONES).filter(function(s) { return String(s.fecha) !== fecha; });
    // Una persona no puede cubrir dos sustituciones en el mismo tramo, ni
    // sustituir quien también está ausente ese día.
    const ausentes = {}, vistos = {};
    lista.forEach(function(x) { if (x && x.ausente) ausentes[x.ausente] = true; });
    lista.forEach(function(x) {
      if (!x || !x.sustituto) return;
      if (ausentes[x.sustituto]) throw new Error('Un docente ausente no puede sustituir a otro.');
      const k = x.tramo + '|' + x.sustituto;
      if (vistos[k]) throw new Error('Una misma persona está asignada a dos sustituciones en el mismo tramo.');
      vistos[k] = true;
    });
    const nuevas = lista.filter(function(x) { return x && (x.ausente || x.grupo) && x.tramo; }).map(function(x) {
      return { fecha: fecha, docente_ausente_id: x.ausente || '', docente_sustituto_id: x.sustituto || '', tramo_id: x.tramo, notas: x.notas || '',
        grupo_id: x.ausente ? '' : (x.grupo || '') };
    });
    bulkReplace(SHEETS.SUSTITUCIONES, resto.concat(nuevas));
    return { ok: true, total: nuevas.length };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Internos ----------

function _exigirPermisoSust() {
  if (!permisosUsuario().sustituciones) throw new Error('No tienes acceso a Sustituciones.');
}

function _fechaIso(f) {
  const s = String(f || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Fecha inválida.');
  return s;
}

function _susDeFecha(fecha) {
  return getAll(SHEETS.SUSTITUCIONES).filter(function(s) { return String(s.fecha) === fecha; });
}

/** Contexto de la sábana restringido a un día y una semana alterna. */
function _ctxDia(dia, semana) {
  const ctx = _sabanaContexto();
  ctx.ocupDia = ctx.ocupaciones.filter(function(o) {
    const s = String(o.semana || '').trim().toUpperCase();
    return _diaCanon(o.dia) === dia && (!s || s === semana);
  });
  return ctx;
}

function _etiquetaOcupacion(o, ctx) {
  if (o.tipo === 'grupo') {
    const m = ctx.materiaById[o.materia_id];
    return { tipo: 'grupo', grupos: _csvIds(o.grupo_id), texto: _nombresGrupos(o.grupo_id, ctx).join('/'), area: m ? (m.abreviatura || m.nombre) : '', color: m ? (m.color || '') : '' };
  }
  const rol = ctx.rolById[o.tipo === 'localizacion' ? o.rol_loc_id : o.rol_especial_id];
  const nombre = rol ? rol.nombre : (String(o.notas || '').trim() || '¿?');
  const dest = _nombresGrupos(o.grupo_destino_id, ctx).join('/');
  return { tipo: o.tipo, cat: categoriaRol(rol || { nombre: nombre }), texto: nombre + (dest ? ' ' + dest : ''), area: '', color: (rol && rol.color) || _colorPorNombreRol(nombre) };
}

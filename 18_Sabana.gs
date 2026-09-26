/**
 * Vista SÁBANA.
 *
 * El "ladrillo" es un tramo (día + tramo horario). Para cada tramo se
 * resuelve, a partir de _Ocupaciones:
 *
 *   - cursos: una entrada por grupo con quién da clase y de qué (tipo
 *     'grupo'). Si no hay clase concreta, cae al TUTOR del grupo (queda en
 *     su aula), replicando la sábana en papel; si no hay tutor, vacío.
 *   - apoyos: las de tipo 'localizacion' (Ref., AL, PT, ATEDU…) y 'especial'
 *     (DIR, coordinaciones, RH…), ordenadas por la prioridad de sustitución
 *     (el `orden` de la pestaña Cargos) y numeradas #01, #02… Cada una lleva
 *     su color (el del rol; configurable por el usuario).
 *   - libres: docentes activos sin ninguna ocupación ese tramo.
 *
 * Alternancia semanal: se muestra una semana (A o B). Las ocupaciones sin
 * semana valen para ambas. Los desdobles (a/b) se muestran juntos.
 */

/**
 * Toda la semana de una vez: una matriz tramos × días. Cada celda trae los
 * cursos, apoyos y libres de ese (día, tramo). Para la vista "semana completa".
 */
function sabanaSemana(semana) {
  const ctx = _sabanaContexto();
  const actual = semanaActual();
  semana = (semana === 'A' || semana === 'B') ? semana : actual;
  ctx.ocupaciones = ctx.ocupaciones.filter(function(o) {
    const s = String(o.semana || '').trim().toUpperCase();
    return !s || s === semana;
  });
  const dias = ['L', 'M', 'X', 'J', 'V'];
  const ocupPorDia = {};
  dias.forEach(function(d) { ocupPorDia[d] = ctx.ocupaciones.filter(function(o) { return _diaCanon(o.dia) === d; }); });

  const tramos = ctx.tramos.map(function(t) {
    const porDia = {};
    let meta = null;
    dias.forEach(function(d) {
      const data = _sabanaTramoData(t, ocupPorDia[d], ctx);
      if (!meta) meta = data.tramo;
      porDia[d] = { cursos: data.cursos, apoyos: data.apoyos, libres: data.libres };
    });
    return { tramo: meta, porDia: porDia };
  });

  return {
    semana: semana,
    semanaActual: actual,
    dias: dias.map(function(d) { return { k: d, n: _diaLargo(d) }; }),
    hayTramos: ctx.tramos.length > 0,
    tramos: tramos
  };
}

/**
 * Semana alterna ('A' o 'B') de una fecha (por defecto, hoy). La semana A es
 * la que contiene la fecha de inicio del curso (Centro) y se alterna cada
 * semana natural; sin fecha, se usa la paridad de la semana ISO. Sábado y
 * domingo cuentan ya como la semana siguiente.
 */
function semanaActual(fecha) {
  const DIA = 86400000;
  const lunes = function(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - (x.getDay() + 6) % 7);
    return x;
  };
  let hoy = fecha ? _fechaLocal(fecha) : new Date();
  if (hoy.getDay() === 0 || hoy.getDay() === 6) hoy = new Date(hoy.getTime() + 2 * DIA);
  const centro = findById(SHEETS.CENTRO, CENTRO_ID) || {};
  const ini = centro.fecha_inicio ? _fechaLocal(centro.fecha_inicio) : null;
  let n;
  if (ini && !isNaN(ini)) {
    n = Math.round((lunes(hoy) - lunes(ini)) / (7 * DIA));
  } else {
    n = Math.round((lunes(hoy) - lunes(new Date(hoy.getFullYear(), 0, 4))) / (7 * DIA));
  }
  return (((n % 2) + 2) % 2) === 0 ? 'A' : 'B';
}

/** 'yyyy-MM-dd' (o Date) → Date a medianoche local. */
function _fechaLocal(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(String(v));
}

// ---------- Internos ----------

function _sabanaContexto() {
  const docentes = getAll(SHEETS.DOCENTES)
    .filter(function(d) { return d.activo !== false; })
    .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  // Cursos siempre en orden canónico: INF3, INF4, INF5, 1º…6º de Primaria.
  const grupos = getAll(SHEETS.GRUPOS).sort(function(a, b) {
    return (ordenNivel(a.nivel) - ordenNivel(b.nivel)) ||
           String(a.nombre_corto || '').localeCompare(String(b.nombre_corto || ''), 'es');
  });
  const tramos = getAll(SHEETS.TRAMOS).sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });
  const materias = getAll(SHEETS.MATERIAS);
  const roles = getAll(SHEETS.ROLES);

  const docById = {}; docentes.forEach(function(d) { docById[d.id] = d; });
  const grupoById = {}; grupos.forEach(function(g) { grupoById[g.id] = g; });
  const materiaById = {}; materias.forEach(function(m) { materiaById[m.id] = m; });
  const rolById = {}; roles.forEach(function(r) { rolById[r.id] = r; });

  // Color de cada tramo: el elegido por el usuario o, si no, el de la paleta
  // arcoíris repartida según el número de tramos.
  const paleta = _paletaTramos(tramos.length);
  const colorTramo = {};
  tramos.forEach(function(t, i) { colorTramo[t.id] = t.color || paleta[i] || '#4f9d84'; });

  return {
    docentes: docentes, grupos: grupos, tramos: tramos,
    ocupaciones: getAll(SHEETS.OCUPACIONES),
    docById: docById, grupoById: grupoById, materiaById: materiaById, rolById: rolById,
    colorTramo: colorTramo
  };
}

// Paleta base (tipo arcoíris) y selección de N colores repartidos: con menos
// tramos se descartan los más parecidos entre sí (los del centro del arcoíris).
const _PALETA_TRAMOS = ['#277da1','#577590','#4d908e','#43aa8b','#90be6d','#f9c74f','#f8961e','#f3722c','#f94144'];
function _paletaTramos(n) {
  const L = _PALETA_TRAMOS.length;
  if (n <= 0) return [];
  if (n === 1) return [_PALETA_TRAMOS[0]];
  if (n >= L) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(_PALETA_TRAMOS[i % L]);
    return out;
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(_PALETA_TRAMOS[Math.round(i * (L - 1) / (n - 1))]);
  return out;
}

function _sabanaTramoData(t, ocupDia, ctx) {
  const ocs = ocupDia.filter(function(o) { return o.tramo_id === t.id; });

  // Si el docente tiene un sustituto asignado, se muestra el sustituto en su
  // lugar en todas las vistas (al quitarlo, vuelve el titular).
  const nombreDoc = function(id) {
    const d = ctx.docById[id];
    if (!d) return '';
    return String(d.sustituto || '').trim() || d.nombre_corto;
  };

  // --- Cursos (panel izquierdo) ---
  const cursos = ctx.grupos.map(function(g) {
    const clases = ocs
      .filter(function(o) { return o.tipo === 'grupo' && _incluyeId(o.grupo_id, g.id); })
      .map(function(o) {
        const m = ctx.materiaById[o.materia_id];
        return {
          docente: nombreDoc(o.docente_id),
          materia: m ? (m.abreviatura || m.nombre) : '',
          color: m ? (m.color || '') : '',
          mitad: String(o.mitad || ''), semana: String(o.semana || '')
        };
      });

    let ocupantes = clases, fallback = false;
    if (!ocupantes.length && g.tutor_id) {
      ocupantes = [{ docente: nombreDoc(g.tutor_id), materia: '', color: '', tutor: true }];
      fallback = true;
    }
    return {
      grupo: { id: g.id, nombre: g.nombre_corto, nivel: g.nivel },
      ocupantes: ocupantes,
      fallbackTutor: fallback,
      vacio: ocupantes.length === 0
    };
  });

  // --- Apoyos y cargos (panel derecho) ---
  const apoyos = ocs
    .filter(function(o) { return o.tipo === 'localizacion' || o.tipo === 'especial'; })
    .map(function(o) {
      const rolId = o.tipo === 'localizacion' ? o.rol_loc_id : o.rol_especial_id;
      const rol = ctx.rolById[rolId] || null;
      const nombre = rol ? rol.nombre : (String(o.notas || '').trim() || '¿?');
      return {
        docente: nombreDoc(o.docente_id),
        rol: nombre,
        rolLargo: rol ? (rol.nombre_largo || '') : '',
        color: (rol && rol.color) ? rol.color : _colorPorNombreRol(nombre),
        orden: rol ? (rol.orden || 999) : 999,
        tipo: o.tipo,
        destino: _nombresGrupos(o.grupo_destino_id, ctx),
        _docOrden: (ctx.docById[o.docente_id] || {}).orden || 0
      };
    });
  apoyos.sort(function(a, b) {
    return (a.orden - b.orden) || (a._docOrden - b._docOrden) || String(a.docente).localeCompare(b.docente);
  });
  apoyos.forEach(function(a, i) { a.loc = i + 1; delete a._docOrden; });

  // --- Libres ---
  const ocupados = {};
  ocs.forEach(function(o) { if (o.docente_id) ocupados[o.docente_id] = true; });
  const libres = ctx.docentes
    .filter(function(d) { return !ocupados[d.id]; })
    .map(function(d) { return String(d.sustituto || '').trim() || d.nombre_corto; });

  return {
    tramo: {
      id: t.id, orden: t.orden, etiqueta: t.etiqueta || '',
      horas: _hhmm(t.hora_inicio) + ' – ' + _hhmm(t.hora_fin),
      es_recreo: !!t.es_recreo,
      color: ctx.colorTramo[t.id] || '#4f9d84'
    },
    cursos: cursos,
    apoyos: apoyos,
    libres: libres
  };
}

function _incluyeId(csv, id) {
  if (!csv) return false;
  return String(csv).split(',').map(function(s) { return s.trim(); }).indexOf(id) !== -1;
}

function _nombresGrupos(csv, ctx) {
  if (!csv) return [];
  return String(csv).split(',').map(function(s) { return s.trim(); }).filter(Boolean)
    .map(function(id) { const g = ctx.grupoById[id]; return g ? g.nombre_corto : id; });
}

function _diaCanon(d) {
  const s = String(d || '').trim().toUpperCase();
  if (s.indexOf('MI') === 0) return 'X'; // 'MIÉRCOLES' no es martes
  return s.charAt(0); // 'LUNES'→'L', ya viene 'L'…'V'
}

function _diaLargo(d) {
  return { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' }[d] || d;
}

function _hhmm(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
  }
  return String(v);
}

/** Color por defecto de un rol cuando no tiene uno asignado (por nombre). */
function _colorPorNombreRol(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/ref/.test(n)) return '#e7b23c';
  if (/atedu/.test(n)) return '#6a51a6';
  if (/^al$|^pt$|audici|pedagog/.test(n)) return '#d9e7f5';
  if (/dir|jefatura|^je$|secretar|^sec$/.test(n)) return '#e0863a';
  if (/coord|tde|coe|con|bib|prl|sal|cic/.test(n)) return '#2f6fd0';
  return '#9b9ba3';
}

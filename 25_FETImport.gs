/**
 * Importación del CSV de actividades que exporta FET (generador de horarios).
 *
 * Cabecera típica: Activity Id,Day,Hour,Students Sets,Subject,Teachers,Room
 * (también en castellano). Cada fila es una franja de una actividad:
 *   - Day: D1…D5 o el nombre del día.
 *   - Hour: «09:00-09:30». Las franjas más cortas que la habitual (p. ej. dos
 *     de 15 min en el recreo) se agrupan en un tramo partido (a/b).
 *   - Students Sets / Subject / Teachers pueden venir combinados con «+»
 *     (varios grupos o docentes) y las materias con «-» o «/» (desdobles:
 *     «Religión/At.Educativa» con «Elena+Sandra» → una materia por docente).
 *   - Filas con solo el docente: profesorado sin actividades (catálogo).
 *
 * Devuelve filas «crudas» con las columnas del CSV propio, listas para el
 * análisis y la creación del catálogo.
 */

function _esCabeceraFET(campos) {
  const c = campos.map(function(s) { return String(s || '').trim().toLowerCase(); });
  const tiene = function(re) { return c.some(function(x) { return re.test(x); }); };
  return tiene(/^(activity id|id de actividad|id actividad)$/) && tiene(/^(day|d[ií]a)$/) && tiene(/^(hour|hora)$/);
}

function _crudasDesdeFET(lineas) {
  const cab = _split(lineas[0]).map(function(s) { return s.trim().toLowerCase(); });
  const col = function(re) { for (let i = 0; i < cab.length; i++) if (re.test(cab[i])) return i; return -1; };
  const iDia = col(/^(day|d[ií]a)$/), iHora = col(/^(hour|hora)$/), iGru = col(/student|alumn|grupo/),
        iMat = col(/subject|asignatura|materia/), iDoc = col(/teacher|profesor|docente/), iNot = col(/^(notes|notas)$/),
        iComp = col(/^(teachers full|nombre completo|docente completo|docente_completo)$/);

  const filas = lineas.slice(1).map(function(l) {
    const c = _split(l);
    const v = function(i) { return i < 0 ? '' : String(c[i] || '').trim(); };
    return { dia: v(iDia), hora: v(iHora), grupos: v(iGru), materia: v(iMat), docentes: v(iDoc), notas: v(iNot), completos: v(iComp) };
  });

  const tramoDe = _tramosFET(filas.map(function(f) { return f.hora; }));
  const crudas = [];
  const filaBase = function(o) {
    crudas.push({
      docente: o.docente || '', dia: o.dia || '', tramo: o.tramo || '', tipo: o.tipo || '',
      materia: o.materia || '', grupo: o.grupo || '', rol: o.rol || '', grupo_destino: o.grupo_destino || '',
      notas: o.notas || '', abreviatura: '', docente_completo: o.docente_completo || '',
      hora_inicio: o.hora_inicio || '', hora_fin: o.hora_fin || '', horas_tramo: true,
      soloCatalogo: !!o.soloCatalogo
    });
  };

  filas.forEach(function(f) {
    const docentes = f.docentes.split('+').map(function(s) { return s.trim(); }).filter(String);
    // Nombre completo de cada docente (columna opcional, en el mismo orden).
    const completos = f.completos.split('+').map(function(s) { return s.trim(); });
    const fila = function(o) {
      if (f.notas) o.notas = o.notas ? o.notas + ' · ' + f.notas : f.notas;
      const k = docentes.indexOf(o.docente);
      if (k !== -1 && completos[k] && completos[k] !== o.docente) o.docente_completo = completos[k];
      filaBase(o);
    };
    if (!docentes.length) return;
    // Docente sin actividad: solo para el catálogo.
    if (!f.dia && !f.hora) { docentes.forEach(function(d) { fila({ docente: d, soloCatalogo: true }); }); return; }

    const dia = _diaFET(f.dia);
    // Hour puede ser también el nº de tramo (CSV convertido por el mapeador).
    const t = tramoDe[f.hora] || (/^\d{1,2}[ab]?$/.test(f.hora) ? { tramo: f.hora } : {});
    const base = { dia: dia, tramo: t.tramo || '', hora_inicio: t.inicio || '', hora_fin: t.fin || '' };
    const conjuntos = f.grupos.split('+').map(function(s) { return s.trim(); }).filter(String);
    const grupos = conjuntos.filter(function(g) { return !/^refuerzo$/i.test(g); }).map(_grupoFET);
    const mat = f.materia.trim();

    // Vigilancia de recreo: el «grupo» es la zona.
    if (/vigilancia|recreo|guardia/i.test(mat)) {
      docentes.forEach(function(d) { fila(Object.assign({ docente: d, tipo: 'especial', rol: 'Recreo', notas: f.grupos ? 'Zona: ' + f.grupos : '' }, base)); });
      return;
    }
    // Cargos, coordinaciones y reducciones (con o sin grupo asociado).
    if (!conjuntos.length || /coordinaci|^rh$|reducci|^cargo|direcci|jefatura|secretar/i.test(mat)) {
      docentes.forEach(function(d) { fila(Object.assign({ docente: d, tipo: 'especial', rol: _rolFET(mat), notas: f.grupos }, base)); });
      return;
    }

    // Clases, desdobles y apoyos: una materia por docente si cuadran.
    const materias = [];
    mat.split('-').forEach(function(p) { p.split('/').forEach(function(q) { if (q.trim()) materias.push(q.trim()); }); });
    const cuadra = materias.length === docentes.length || materias.length === 1;
    docentes.forEach(function(d, i) {
      const m = materias.length === 1 ? materias[0] : (materias[i] || materias[materias.length - 1] || '');
      const notas = cuadra ? '' : '?? reparto dudoso: ' + mat + ' / ' + f.docentes;
      if (/^(apoyo|refuerzo)$/i.test(m) || (!grupos.length && /refuerzo/i.test(f.grupos))) {
        fila(Object.assign({ docente: d, tipo: 'localizacion', rol: 'Ref.', grupo_destino: grupos.join(' y '), notas: notas }, base));
      } else {
        fila(Object.assign({ docente: d, tipo: 'grupo', materia: _materiaFET(m), grupo: grupos.join(' y '), notas: notas }, base));
      }
    });
  });
  return crudas;
}

/**
 * Franjas horarias de FET → tramos. Las franjas de la duración habitual son
 * tramos; las más cortas (p. ej. 12:00-12:15 y 12:15-12:30) forman un tramo
 * partido. Devuelve { "09:00-09:30": { tramo: "1", inicio, fin }, … }.
 */
function _tramosFET(horas) {
  const rangos = {};
  horas.forEach(function(h) {
    const m = String(h || '').match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
    if (m) rangos[h] = { h: h, a: +m[1] * 60 + +m[2], b: +m[3] * 60 + +m[4] };
  });
  // Solo hora de inicio («09:00»): cada tramo acaba donde empieza el siguiente.
  const inicios = horas.filter(function(h) { return /^\s*\d{1,2}:\d{2}\s*$/.test(h || ''); })
    .map(function(h) { const m = h.trim().split(':'); return { h: h, a: +m[0] * 60 + +m[1] }; })
    .sort(function(x, y) { return x.a - y.a; })
    .filter(function(r, i, arr) { return !i || arr[i - 1].a !== r.a; });
  inicios.forEach(function(r, i) {
    const sig = inicios[i + 1];
    const dur = sig ? sig.a - r.a : (i ? r.a - inicios[i - 1].a : 60);
    horas.forEach(function(h) { if (String(h).trim() === r.h.trim()) rangos[h] = { h: h, a: r.a, b: r.a + dur }; });
  });
  const lista = Object.keys(rangos).map(function(k) { return rangos[k]; });
  if (!lista.length) return {};
  const cuenta = {};
  lista.forEach(function(r) { const d = r.b - r.a; cuenta[d] = (cuenta[d] || 0) + 1; });
  const modo = +Object.keys(cuenta).sort(function(x, y) { return cuenta[y] - cuenta[x] || y - x; })[0];

  // Tramos completos y bloques de franjas cortas contiguas.
  const tramos = lista.filter(function(r) { return r.b - r.a >= modo * 0.9; }).map(function(r) { return { a: r.a, b: r.b, partes: [] }; });
  const cortas = lista.filter(function(r) { return r.b - r.a < modo * 0.9; }).sort(function(x, y) { return x.a - y.a; });
  cortas.forEach(function(r) {
    let t = tramos.filter(function(x) { return x.a <= r.a && r.b <= x.b; })[0] ||
            tramos.filter(function(x) { return x.partes.length && x.b === r.a && x.b - x.a < modo; })[0];
    if (!t) { t = { a: r.a, b: r.b, partes: [] }; tramos.push(t); }
    t.b = Math.max(t.b, r.b);
    t.partes.push(r);
  });
  tramos.sort(function(x, y) { return x.a - y.a; });
  // Huecos sin actividad (p. ej. un recreo que no viene en el archivo):
  // ocupan su número de tramo para no descolocar los siguientes.
  for (let i = tramos.length - 1; i > 0; i--) {
    if (tramos[i].a - tramos[i - 1].b >= 10) tramos.splice(i, 0, { a: tramos[i - 1].b, b: tramos[i].a, partes: [] });
  }

  const hhmm = function(n) { return ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + n % 60).slice(-2); };
  const res = {};
  tramos.forEach(function(t, i) {
    const orden = String(i + 1), ini = hhmm(t.a), fin = hhmm(t.b);
    lista.forEach(function(r) {
      if (r.a === t.a && r.b === t.b) res[r.h] = { tramo: orden, inicio: ini, fin: fin };
    });
    t.partes.sort(function(x, y) { return x.a - y.a; }).forEach(function(r, j) {
      res[r.h] = { tramo: orden + (t.partes.length > 1 ? (j === 0 ? 'a' : 'b') : ''), inicio: ini, fin: fin };
    });
  });
  return res;
}

function _diaFET(d) {
  const s = String(d || '').trim().toLowerCase();
  const m = s.match(/^d(\d)$/);
  if (m) return 'LMXJV'.charAt(+m[1] - 1) || '';
  if (/^(mon|lun)/.test(s)) return 'L';
  if (/^(tue|mar)/.test(s)) return 'M';
  if (/^(wed|mi)/.test(s)) return 'X';
  if (/^(thu|jue)/.test(s)) return 'J';
  if (/^(fri|vie)/.test(s)) return 'V';
  return String(d || '').trim().toUpperCase().charAt(0);
}

/** «5A» → «5º A»; «Inf5B» → «I5 B»; lo demás, tal cual. */
function _grupoFET(g) {
  const s = String(g || '').trim();
  let m = s.match(/^(\d)\s*º?\s*([A-Za-z])$/);
  if (m) return m[1] + 'º ' + m[2].toUpperCase();
  m = s.match(/^inf(?:antil)?\s*(\d)\s*(?:años)?\s*([A-Za-z])$/i);
  if (m) return 'I' + m[1] + ' ' + m[2].toUpperCase();
  return s;
}

function _materiaFET(m) {
  const s = String(m || '').trim(), n = s.toLowerCase();
  if (/^mates?$|matem/.test(n)) return 'Matemáticas';
  if (/^cono$|conocimiento/.test(n)) return 'Conocimiento del Medio';
  if (/^(english|ingl[eé]s)$/.test(n)) return 'Inglés';
  if (/^e\.?\s*f\.?$|educaci[oó]n f[ií]sica/.test(n)) return 'Educación Física';
  if (/^lengua$|^leng$/.test(n)) return 'Lengua Castellana y Literatura';
  if (/^at\.?\s*educ/.test(n)) return 'Atención Educativa';
  if (/^reli/.test(n)) return 'Religión';
  if (/^valores$/.test(n)) return 'Educación en Valores Cívicos y Éticos';
  return s;
}

function _rolFET(m) {
  const n = String(m || '').trim().toLowerCase();
  if (/^rh$|mayor|reducci/.test(n)) return 'RH';
  if (/direcci/.test(n)) return 'DIR';
  if (/jefatura/.test(n)) return 'JE';
  if (/secretar/.test(n)) return 'SEC';
  return String(m || '').trim() || '??';
}

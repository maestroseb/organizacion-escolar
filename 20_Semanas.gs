/**
 * Semanas alternas (semana A / semana B).
 *
 * Muchos centros alternan actividades cada semana (p.ej. una asignatura en
 * las semanas "A" y otra en las "B"). _SemanasAlternas es un calendario: una
 * fila por semana lectiva, con su rango de fechas y su tipo (A o B). Dada una
 * fecha cualquiera (hoy, para el módulo "Ahora"; o el "hoy" real para resaltar
 * en la sábana), se busca en qué rango cae y así se sabe qué semana toca.
 *
 * El campo `orden` fija la secuencia; el tipo se guarda explícito para poder
 * corregir a mano cualquier semana suelta sin depender de la alternancia.
 */

function listarSemanas() {
  const semanas = getAll(SHEETS.SEMANAS);
  semanas.sort(_ordenSemanas);
  return semanas;
}

function _ordenSemanas(a, b) {
  const fa = String(a.fecha_inicio || ''), fb = String(b.fecha_inicio || '');
  if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
  return (a.orden || 0) - (b.orden || 0);
}

/**
 * Guarda la lista completa de semanas (el editor envía todas en cada save).
 * Conserva IDs existentes cuando vienen y reordena por fecha de inicio.
 */
function guardarSemanas(semanas) {
  if (!Array.isArray(semanas)) throw new Error('Formato inválido.');

  semanas.forEach(function(s, i) {
    const n = i + 1;
    if (!s.fecha_inicio || !s.fecha_fin) {
      throw new Error('Semana ' + n + ': falta la fecha de inicio o de fin.');
    }
    if (!_esFechaISO(s.fecha_inicio) || !_esFechaISO(s.fecha_fin)) {
      throw new Error('Semana ' + n + ': las fechas deben tener formato AAAA-MM-DD.');
    }
    if (String(s.fecha_inicio) > String(s.fecha_fin)) {
      throw new Error('Semana ' + n + ': la fecha de fin no puede ser anterior al inicio.');
    }
    const tipo = String(s.tipo || '').trim().toUpperCase();
    if (tipo !== 'A' && tipo !== 'B') {
      throw new Error('Semana ' + n + ': el tipo debe ser A o B.');
    }
  });

  const ordenadas = semanas.slice().sort(function(a, b) {
    return String(a.fecha_inicio) < String(b.fecha_inicio) ? -1
         : String(a.fecha_inicio) > String(b.fecha_inicio) ? 1 : 0;
  });

  const filas = ordenadas.map(function(s, i) {
    return {
      id: s.id || undefined,
      orden: i + 1,
      fecha_inicio: s.fecha_inicio,
      fecha_fin: s.fecha_fin,
      tipo: String(s.tipo).trim().toUpperCase(),
      etiqueta: s.etiqueta || ''
    };
  });
  bulkReplace(SHEETS.SEMANAS, filas);
  return { ok: true, total: filas.length };
}

/**
 * Tipo de semana (A/B) en el que cae una fecha, o '' si no hay ninguna semana
 * configurada que la contenga (vacaciones, festivos, verano…).
 * `fecha` puede ser un Date o una cadena AAAA-MM-DD.
 */
function semanaDeFecha(fecha) {
  const iso = _aFechaISO(fecha);
  if (!iso) return null;
  const semanas = getAll(SHEETS.SEMANAS);
  for (let i = 0; i < semanas.length; i++) {
    const s = semanas[i];
    const ini = String(s.fecha_inicio || ''), fin = String(s.fecha_fin || '');
    if (ini && fin && iso >= ini && iso <= fin) {
      return { tipo: String(s.tipo || '').trim().toUpperCase(), etiqueta: s.etiqueta || '', id: s.id };
    }
  }
  return null;
}

/** La semana (A/B) de HOY, según el reloj del servidor. null si no hay match. */
function semanaActual() {
  return semanaDeFecha(_hoyISO());
}

/** Solo el tipo ('A' | 'B' | ''), cómodo para las vistas. */
function semanaActualTipo() {
  const s = semanaActual();
  return s ? s.tipo : '';
}

/**
 * Importador (pegar). Recibe el texto tal cual lo pasa jefatura (el cuadro de
 * semanas por trimestres, alternando rojas y negras). Como al pegar se pierde
 * el color, se aplica la regla observada en ese formato: dentro de cada
 * trimestre las semanas alternan A, B, A, B… empezando por A (rojas = A).
 *
 * Devuelve filas propuestas { fecha_inicio, fecha_fin, tipo, etiqueta } para
 * que el usuario las revise y edite antes de guardar. No toca el libro.
 */
function importarSemanas(texto, opciones) {
  opciones = opciones || {};
  if (!texto || !String(texto).trim()) throw new Error('Pega primero el cuadro de semanas.');

  const anios = _aniosAcademicos(opciones.anioInicio);

  // Columnas = trimestres. Al pegar desde una tabla, cada línea trae las
  // celdas separadas por tabulador; si no hay tabuladores, es una sola lista.
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  const columnas = [];
  let hayTabs = false;
  lineas.forEach(function(linea) {
    if (/\t/.test(linea)) hayTabs = true;
  });
  const sep = hayTabs ? '\t' : null;

  lineas.forEach(function(linea) {
    if (!linea.trim()) return;
    if (/trimestre/i.test(linea)) return; // cabeceras
    const celdas = sep ? linea.split(sep) : [linea];
    celdas.forEach(function(celda, c) {
      const txt = String(celda || '').trim();
      if (!txt) return;
      if (/trimestre/i.test(txt)) return;
      (columnas[c] = columnas[c] || []).push(txt);
    });
  });

  const filas = [];
  const avisos = [];
  columnas.forEach(function(col) {
    if (!col) return;
    let ab = 0; // reinicia la alternancia en cada trimestre: empieza en A
    col.forEach(function(txt) {
      const rango = _parseRangoSemana(txt, anios.inicio, anios.fin);
      const tipo = (ab % 2 === 0) ? 'A' : 'B';
      ab++;
      if (!rango) {
        avisos.push('No se pudo interpretar: "' + txt + '"');
        filas.push({ fecha_inicio: '', fecha_fin: '', tipo: tipo, etiqueta: txt });
      } else {
        filas.push({ fecha_inicio: rango.inicio, fecha_fin: rango.fin, tipo: tipo, etiqueta: txt });
      }
    });
  });

  filas.sort(function(a, b) {
    return String(a.fecha_inicio) < String(b.fecha_inicio) ? -1
         : String(a.fecha_inicio) > String(b.fecha_inicio) ? 1 : 0;
  });

  return { ok: true, total: filas.length, semanas: filas, avisos: avisos };
}

// ---------- Parseo de rangos de fecha en español ----------

const _MESES_ES = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12
};

function _mesDe(token) {
  const t = String(token || '').toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  if (t.length < 3) return 0;
  return _MESES_ES[t.substr(0, 3)] || 0;
}

/**
 * "14 SEP A 18 SEP" → {inicio:'AAAA-09-14', fin:'AAAA-09-18'}
 * "8 ENERO"         → inicio = fin = ese día
 * "29 MARZO A 2 ABRIL" y "21 Y 22 JUNIO" → soportados.
 * El año lo decide el mes: SEP–DIC → año de inicio; ENE–AGO → año de fin.
 */
function _parseRangoSemana(texto, anioInicio, anioFin) {
  let s = String(texto || '').toUpperCase().trim();
  s = s.replace(/\s+/g, ' ');
  // "21 Y 22 JUNIO" se comporta como un rango 21 A 22.
  s = s.replace(/\bY\b/g, 'A');
  s = s.replace(/\bAL\b/g, 'A');

  const partes = s.split(/\s+A\s+/);
  const ini = _parseDiaMes(partes[0]);
  const fin = partes.length > 1 ? _parseDiaMes(partes[partes.length - 1]) : { dia: ini.dia, mes: ini.mes };

  // Herencia de mes cuando falta en uno de los lados.
  if (!ini.mes && fin.mes) ini.mes = fin.mes;
  if (!fin.mes && ini.mes) fin.mes = ini.mes;
  if (!ini.dia || !ini.mes || !fin.dia || !fin.mes) return null;

  const isoIni = _iso(anioInicio, anioFin, ini.mes, ini.dia);
  const isoFin = _iso(anioInicio, anioFin, fin.mes, fin.dia);
  if (!isoIni || !isoFin) return null;
  return { inicio: isoIni, fin: isoFin };
}

function _parseDiaMes(txt) {
  const t = String(txt || '');
  const md = t.match(/\d{1,2}/);
  const dia = md ? parseInt(md[0], 10) : 0;
  let mes = 0;
  const palabras = t.split(/\s+/);
  for (let i = 0; i < palabras.length; i++) {
    const m = _mesDe(palabras[i]);
    if (m) { mes = m; break; }
  }
  return { dia: dia, mes: mes };
}

function _iso(anioInicio, anioFin, mes, dia) {
  if (!mes || !dia) return '';
  const anio = (mes >= 9) ? anioInicio : anioFin; // SEP–DIC año 1; ENE–AGO año 2
  const mm = ('0' + mes).slice(-2), dd = ('0' + dia).slice(-2);
  return anio + '-' + mm + '-' + dd;
}

/**
 * Años del curso académico para colocar cada fecha. Toma el año de inicio de
 * las opciones, del centro (curso_academico o fecha_inicio) o, en último caso,
 * lo deduce de la fecha actual (Sep–Dic → este año; resto → año anterior).
 */
function _aniosAcademicos(anioInicioOpc) {
  let inicio = parseInt(anioInicioOpc, 10);
  if (!inicio) {
    const centro = findById(SHEETS.CENTRO, CENTRO_ID) || {};
    const ca = String(centro.curso_academico || '');
    const m = ca.match(/(\d{4})/);
    if (m) inicio = parseInt(m[1], 10);
    if (!inicio && centro.fecha_inicio) {
      const mf = String(centro.fecha_inicio).match(/(\d{4})/);
      if (mf) inicio = parseInt(mf[1], 10);
    }
  }
  if (!inicio) {
    const hoy = new Date();
    inicio = hoy.getMonth() >= 8 ? hoy.getFullYear() : hoy.getFullYear() - 1; // getMonth() 8 = septiembre
  }
  return { inicio: inicio, fin: inicio + 1 };
}

// ---------- Utilidades de fecha ----------

function _esFechaISO(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function _aFechaISO(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v || '').trim();
  if (_esFechaISO(s)) return s;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return '';
}

function _hoyISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

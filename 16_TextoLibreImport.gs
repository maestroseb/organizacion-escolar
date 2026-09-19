/**
 * Importador de horarios pegados como TEXTO LIBRE (best-effort).
 *
 * A diferencia del CSV del Gem (formato fijo), aquí el usuario pega texto tal
 * cual lo tenga (una línea por sesión, con delimitadores variados o lenguaje
 * natural). La heurística intenta extraer de cada línea: docente, día, tramo
 * y actividad, y deja vacío lo que no sepa mapear (no inventa datos). Todo
 * pasa por el MISMO pipeline de matching y revisión que el CSV, de modo que
 * nada se guarda hasta que el usuario confirma en la tabla de revisión.
 *
 * Devuelve { filas, catalogo } igual que analizarCSV.
 */

function analizarTextoLibre(texto) {
  if (!texto || !String(texto).trim()) {
    throw new Error('Pega algún texto primero.');
  }
  const crudas = _crudasDesdeTexto(texto);
  if (!crudas.length) {
    throw new Error('No se ha podido interpretar ninguna línea. Revisa el formato o usa el CSV del Gem.');
  }
  return _analizarFilasCrudas(crudas);
}

// ---------- Heurística ----------

const _DIAS_TXT = [
  { re: /\bl(unes)?\b/i,             dia: 'L' },
  { re: /\bmartes\b/i,               dia: 'M' },
  { re: /\b(mi[eé]rcoles|mierc|x)\b/i, dia: 'X' },
  { re: /\bj(ueves)?\b/i,            dia: 'J' },
  { re: /\bv(iernes)?\b/i,           dia: 'V' },
  { re: /\bmar\b/i,                  dia: 'M' },
  { re: /\bmi[eé]\b/i,               dia: 'X' },
  { re: /\bm\b/i,                    dia: 'M' } // 'M' suelta = martes (convención L,M,X,J,V)
];

function _crudasDesdeTexto(texto) {
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  const crudas = [];
  lineas.forEach(function(linea) {
    const c = _parsearLineaLibre(linea);
    if (c) crudas.push(c);
  });
  return crudas;
}

function _parsearLineaLibre(linea) {
  const bruta = String(linea || '').trim();
  if (!bruta) return null;
  // Saltar cabeceras evidentes.
  if (/^docente\b/i.test(bruta) && /tramo/i.test(bruta)) return null;

  // 1) Si viene claramente delimitado (comas, tabs, ; o |) con >=4 campos,
  //    lo tratamos posicionalmente como el CSV: docente,dia,tramo,tipo,
  //    materia,grupo,rol,grupo_destino,notas.
  const delim = _detectarDelimitador(bruta);
  if (delim) {
    const partes = bruta.split(delim).map(function(s) { return s.trim().replace(/^["']|["']$/g, ''); });
    if (partes.length >= 4 && (partes[0] || partes[1])) {
      return {
        docente: partes[0] || '',
        dia: _normDia(partes[1]) || partes[1] || '',
        tramo: _extraerTramo(partes[2]) || partes[2] || '',
        tipo: (partes[3] || 'grupo').toLowerCase(),
        materia: partes[4] || '',
        grupo: partes[5] || '',
        rol: partes[6] || '',
        grupo_destino: partes[7] || '',
        notas: partes.slice(8).join(' ') || ''
      };
    }
  }

  // 2) Lenguaje natural: localizamos día y tramo dentro de la línea; lo que
  //    hay antes del día suele ser el docente y lo que hay después del tramo,
  //    la actividad (materia + grupo).
  const dia = _diaEnTexto(bruta);
  const tramoInfo = _tramoEnTexto(bruta);
  if (!dia && !tramoInfo) return null; // no parece una línea de horario

  let docente = '';
  let resto = bruta;
  if (dia) {
    const idx = bruta.search(dia.re);
    if (idx > 0) docente = bruta.slice(0, idx).replace(/[·,;|\-\s]+$/, '').trim();
    resto = bruta.slice(idx >= 0 ? idx + dia.match.length : 0);
  }

  let actividad = resto;
  if (tramoInfo) {
    actividad = resto.slice(resto.indexOf(tramoInfo.match) + tramoInfo.match.length);
  }
  actividad = actividad.replace(/^[·,;:|\-\s]+/, '').trim();

  // Intentar separar un grupo al final (p.ej. "Lengua 3ºB" o "Mates 1º A").
  const mGrupo = actividad.match(/\b(\d+\s*º?\s*[A-Da-d]?|inf\s*[345]|[123456]\s*p)\s*$/i);
  let materia = actividad, grupo = '';
  if (mGrupo && actividad.length > mGrupo[0].length) {
    grupo = mGrupo[0].trim();
    materia = actividad.slice(0, actividad.length - mGrupo[0].length).replace(/[·,;:|\-\s]+$/, '').trim();
  }

  return {
    docente: docente,
    dia: dia ? dia.dia : '',
    tramo: tramoInfo ? String(tramoInfo.orden) + (tramoInfo.mitad || '') : '',
    tipo: 'grupo',
    materia: materia,
    grupo: grupo,
    rol: '',
    grupo_destino: '',
    notas: ''
  };
}

function _detectarDelimitador(linea) {
  if (linea.indexOf('\t') !== -1) return '\t';
  if (linea.indexOf(';') !== -1) return ';';
  if (linea.indexOf('|') !== -1) return '|';
  // Coma solo si hay al menos 3 (para no partir "1º, A" natural).
  if ((linea.match(/,/g) || []).length >= 3) return ',';
  return null;
}

function _diaEnTexto(linea) {
  for (let i = 0; i < _DIAS_TXT.length; i++) {
    const m = linea.match(_DIAS_TXT[i].re);
    if (m) return { dia: _DIAS_TXT[i].dia, re: _DIAS_TXT[i].re, match: m[0] };
  }
  return null;
}

function _tramoEnTexto(linea) {
  // "1ª", "tramo 3", "sesión 2", "5a"/"5b" o un número suelto 1-12.
  const m = linea.match(/\b(?:tramo|sesi[oó]n|hora)?\s*(\d{1,2})\s*([ab])?\s*[ª°]?\b/i);
  if (!m) return null;
  const orden = parseInt(m[1], 10);
  if (isNaN(orden) || orden < 1 || orden > 12) return null;
  const mitad = m[2] ? m[2].toLowerCase() : '';
  return { orden: orden, mitad: mitad, match: m[0] };
}

function _normDia(s) {
  const d = _diaEnTexto(String(s || ''));
  return d ? d.dia : '';
}

function _extraerTramo(s) {
  const t = _tramoEnTexto(String(s || ''));
  return t ? (String(t.orden) + (t.mitad || '')) : '';
}

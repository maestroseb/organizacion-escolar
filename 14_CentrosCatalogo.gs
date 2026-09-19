/**
 * Catálogo de centros de Andalucía para el alta guiada.
 *
 * El catálogo vive en un repo aparte (maestroseb/contactos-g.educaand,
 * fichero CentrosCatalogo.gs) como un objeto `const CENTROS = { 'codigo':
 * 'nombre', ... }` con ~1500 centros. Aquí lo descargamos con UrlFetchApp,
 * lo cacheamos en CacheService (6 h) y lo parseamos con una expresión
 * regular, sin depender del repo en tiempo real en cada búsqueda.
 *
 * Si la red falla o el código no está en el catálogo, las funciones
 * devuelven { encontrado: false } y el alta guiada permite escribir el
 * nombre del centro a mano. (Apps Script infiere el scope
 * script.external_request automáticamente por el uso de UrlFetchApp.)
 */

const CATALOGO_URL =
  'https://raw.githubusercontent.com/maestroseb/contactos-g.educaand/main/CentrosCatalogo.gs';
const CATALOGO_CACHE_KEY = 'catalogo_centros_v1';
const CATALOGO_CACHE_SEG = 21600; // 6 horas

const PROVINCIAS_ANDALUCIA = {
  '04': 'Almería',
  '11': 'Cádiz',
  '14': 'Córdoba',
  '18': 'Granada',
  '21': 'Huelva',
  '23': 'Jaén',
  '29': 'Málaga',
  '41': 'Sevilla'
};

/**
 * Busca un centro por su código (8 dígitos). Devuelve
 * { encontrado, codigo, nombre, provincia } o { encontrado:false, codigo }.
 */
function buscarCentroPorCodigo(codigo) {
  const cod = _normalizarCodigo(codigo);
  if (!cod) return { encontrado: false, codigo: '' };

  const mapa = _cargarCatalogo();
  const nombre = mapa[cod];
  if (!nombre) {
    return { encontrado: false, codigo: cod, provincia: _provinciaDeCodigo(cod) };
  }
  return {
    encontrado: true,
    codigo: cod,
    nombre: nombre,
    provincia: _provinciaDeCodigo(cod)
  };
}

/**
 * Busca centros cuyo nombre contenga el texto dado (para cuando no se sabe
 * el código). Devuelve hasta `limite` resultados
 * [{ codigo, nombre, provincia }].
 */
function buscarCentrosPorNombre(texto, limite) {
  const q = _normalizarTexto(texto);
  if (q.length < 3) return { resultados: [], truncado: false };
  limite = limite || 25;

  const mapa = _cargarCatalogo();
  const out = [];
  let total = 0;
  const codigos = Object.keys(mapa);
  for (let i = 0; i < codigos.length; i++) {
    const cod = codigos[i];
    if (_normalizarTexto(mapa[cod]).indexOf(q) !== -1) {
      total++;
      if (out.length < limite) {
        out.push({ codigo: cod, nombre: mapa[cod], provincia: _provinciaDeCodigo(cod) });
      }
    }
  }
  out.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
  return { resultados: out, truncado: total > out.length, total: total };
}

// ---------- Internos ----------

function _cargarCatalogo() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(CATALOGO_CACHE_KEY);
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) {}
  }

  let texto = '';
  try {
    const resp = UrlFetchApp.fetch(CATALOGO_URL, {
      muteHttpExceptions: true,
      followRedirects: true
    });
    if (resp.getResponseCode() === 200) texto = resp.getContentText('UTF-8');
  } catch (e) {
    // Sin red: devolvemos un catálogo vacío (el alta guiada lo permite).
    return {};
  }

  const mapa = _parsearCatalogo(texto);

  // CacheService limita cada valor a 100 KB; el catálogo entero puede pasarse,
  // así que lo troceamos en varias claves.
  try { _guardarEnCache(cache, mapa); } catch (e) {}
  return mapa;
}

function _parsearCatalogo(texto) {
  const mapa = {};
  if (!texto) return mapa;
  // Pares del tipo:  '04000018': 'C.E.I.P. JOAQUÍN TENA SICILIA',
  const re = /['"](\d{6,8})['"]\s*:\s*['"]((?:[^'"\\]|\\.)*)['"]/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    mapa[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
  }
  return mapa;
}

function _guardarEnCache(cache, mapa) {
  const json = JSON.stringify(mapa);
  if (json.length <= 95000) {
    cache.put(CATALOGO_CACHE_KEY, json, CATALOGO_CACHE_SEG);
  }
  // Si es demasiado grande para una sola clave, no cacheamos (se volverá a
  // descargar): mantiene el código simple y la descarga es rápida.
}

function _normalizarCodigo(codigo) {
  const s = String(codigo == null ? '' : codigo).replace(/\D/g, '');
  if (!s) return '';
  // Los códigos del catálogo tienen 8 dígitos con cero inicial.
  return s.length < 8 ? ('00000000' + s).slice(-8) : s.slice(0, 8);
}

function _normalizarTexto(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _provinciaDeCodigo(cod) {
  return PROVINCIAS_ANDALUCIA[String(cod).slice(0, 2)] || '';
}

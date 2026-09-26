/**
 * Catálogo de centros de Andalucía para el alta guiada.
 *
 * Los datos (código → nombre) viven INCLUIDOS en la app, en
 * 14_CentrosDatos.gs (función `_datosCatalogoCentros()`), copiados del repo
 * maestroseb/contactos-g.educaand. Se incluyen en lugar de descargarlos en
 * tiempo de ejecución para que el buscador funcione siempre, sin red ni
 * permisos de conexión externa (coste cero, sin dependencias frágiles).
 *
 * Si un código no está en el catálogo, las funciones devuelven
 * { encontrado: false } y el alta guiada permite escribir el nombre a mano.
 */

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
  if (q.length < 3) return { resultados: [], truncado: false, total: 0 };
  limite = Math.max(1, Math.min(parseInt(limite, 10) || 25, 100));

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

/** Devuelve el catálogo incluido (14_CentrosDatos.gs), construido una vez por ejecución. */
let _CATALOGO_CACHE = null;
function _cargarCatalogo() {
  if (!_CATALOGO_CACHE) {
    _CATALOGO_CACHE = (typeof _datosCatalogoCentros === 'function') ? (_datosCatalogoCentros() || {}) : {};
  }
  return _CATALOGO_CACHE;
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

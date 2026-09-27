/**
 * Vista REFUERZO, PT y AL: por grupo, los tramos en que recibe alguno de
 * estos apoyos (ocupaciones de tipo 'localizacion' cuyo grupo destino es el
 * grupo), quién lo da, qué área y docente hay en clase en ese momento, y el
 * cómputo de horas semanales por tipo (separado por semana A/B si alterna).
 */

function _tipoApoyo(texto) {
  const t = String(texto || '');
  if (/^\s*ref|refuerzo/i.test(t)) return 'Refuerzo';
  if (/\bPT\b|pedagog/i.test(t)) return 'PT';
  if (/\bAL\b|audici/i.test(t)) return 'AL';
  return '';
}

function datosApoyos() {
  const ctx = _sabanaContexto();
  const tramoById = {};
  ctx.tramos.forEach(function(t) { tramoById[t.id] = t; });
  const mins = function(t) {
    const a = _minutos(_hhmm(t.hora_inicio)), b = _minutos(_hhmm(t.hora_fin));
    return (isNaN(a) || isNaN(b) || b <= a) ? 0 : b - a;
  };
  const nombreDoc = function(id) { const d = ctx.docById[id]; return d ? (String(d.sustituto || '').trim() || d.nombre_corto) : '¿?'; };
  const ordenDia = { L: 0, M: 1, X: 2, J: 3, V: 4 };

  const porGrupo = {};
  ctx.ocupaciones.forEach(function(o) {
    if (o.tipo !== 'localizacion') return;
    const rol = ctx.rolById[o.rol_loc_id];
    const tipo = _tipoApoyo(rol ? rol.nombre + ' ' + (rol.nombre_largo || '') : o.notas);
    const t = tramoById[o.tramo_id];
    if (!tipo || !t) return;
    const dia = _diaCanon(o.dia), sem = String(o.semana || '').trim().toUpperCase();
    _csvIds(o.grupo_destino_id).forEach(function(gid) {
      if (!ctx.grupoById[gid]) return;
      // Clase en el grupo en ese momento (compatible con la semana del apoyo).
      const clase = ctx.ocupaciones.filter(function(c) {
        const cs = String(c.semana || '').trim().toUpperCase();
        return c.tipo === 'grupo' && _diaCanon(c.dia) === dia && c.tramo_id === o.tramo_id &&
               _csvIds(c.grupo_id).indexOf(gid) !== -1 && (!sem || !cs || cs === sem);
      }).map(function(c) {
        const m = ctx.materiaById[c.materia_id];
        return { docente: nombreDoc(c.docente_id), area: m ? (m.abreviatura || m.nombre) : '', color: m ? (m.color || '') : '', semana: String(c.semana || '') };
      });
      const g = porGrupo[gid] || (porGrupo[gid] = { filas: [], totales: {} });
      g.filas.push({
        dia: dia, diaLargo: _diaLargo(dia), tramo: t.orden, horas: _hhmm(t.hora_inicio) + '–' + _hhmm(t.hora_fin),
        _ord: (ordenDia[dia] || 0) * 100 + (t.orden || 0),
        tipo: tipo, rol: rol ? rol.nombre : tipo, color: (rol && rol.color) || _colorPorNombreRol(rol ? rol.nombre : tipo),
        apoyo: nombreDoc(o.docente_id), semana: sem, clase: clase
      });
      const tot = g.totales[tipo] || (g.totales[tipo] = { A: 0, B: 0 });
      const m = mins(t);
      if (sem !== 'B') tot.A += m;
      if (sem !== 'A') tot.B += m;
    });
  });

  const grupos = ctx.grupos.filter(function(g) { return porGrupo[g.id]; }).map(function(g) {
    const x = porGrupo[g.id];
    x.filas.sort(function(a, b) { return a._ord - b._ord; });
    x.filas.forEach(function(f) { delete f._ord; });
    return { id: g.id, nombre: g.nombre_corto, filas: x.filas, totales: x.totales };
  });
  return { tipos: ['Refuerzo', 'PT', 'AL'], grupos: grupos };
}

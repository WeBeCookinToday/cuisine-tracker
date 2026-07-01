// Inline TopoJSON-to-GeoJSON decoder (avoids pulling in topojson-client)
export function topoToFeatures(topo, key) {
  const obj = topo.objects[key];
  const T = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return T ? [x * T.scale[0] + T.translate[0], y * T.scale[1] + T.translate[1]] : [x, y];
    });
  });
  const stitch = (indices) => {
    const out = [];
    indices.forEach((idx, i) => {
      const a = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx].slice();
      if (i > 0) a.shift();
      out.push(...a);
    });
    return out;
  };
  const toCoords = (g) => {
    if (g.type === "Polygon") return g.arcs.map(stitch);
    if (g.type === "MultiPolygon") return g.arcs.map((poly) => poly.map(stitch));
    return null;
  };
  return obj.geometries
    .filter((g) => g.type === "Polygon" || g.type === "MultiPolygon")
    .map((g) => ({
      type: "Feature",
      id: g.id,
      properties: g.properties || {},
      geometry: { type: g.type, coordinates: toCoords(g) },
    }));
}

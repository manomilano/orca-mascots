export const solids = {
  sky: ['Sky', '#B3DBF4'], mint: ['Sea glass', '#B6DEC9'],
  sand: ['Sand', '#F1DDB3'], coral: ['Coral', '#F1B5A6'],
  lilac: ['Lilac', '#D1C1EA'], slate: ['Deep sea', '#344E62']
};
export const gradients = {
  lagoon: ['Lagoon', '#BCEBCE', '#75BCE5'],
  dusk: ['Dusk', '#EAC2D5', '#A5ABDA'],
  dawn: ['Dawn', '#FFE3AA', '#F1A99B']
};
export const defaults = Object.freeze({
  mascot: 'D1', background: 'sky', custom: '#B3DBF4', shape: 'rounded', size: 512
});

export function normalizeHex(text) {
  if (typeof text !== 'string') return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const digits = match[1];
  return '#' + (digits.length === 3 ? [...digits].map(c => c + c).join('') : digits).toUpperCase();
}

// A fit shrinks the art toward the edge its body runs off, so a circular crop keeps the face.
function validFit(fit) {
  if (fit === undefined) return true;
  return fit !== null && typeof fit === 'object' && typeof fit.scale === 'number' &&
    fit.scale >= 0.5 && fit.scale <= 1 &&
    [fit.x, fit.y].every(anchor => anchor === 0 || anchor === 0.5 || anchor === 1);
}

export function parseCatalog(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Empty mascot catalog');
  const ids = new Set();
  for (const { id, name, asset, fit } of rows) {
    if (!/^[A-Z][1-9]$/.test(id) || ids.has(id) || typeof name !== 'string' ||
        !name.trim() || asset !== 'assets/mascots/' + id + '.webp' || !validFit(fit)) {
      throw new Error('Invalid mascot catalog entry');
    }
    ids.add(id);
  }
  return rows;
}

export function preferences(raw, catalog) {
  let value;
  try { value = JSON.parse(raw); } catch { value = null; }
  const v = value && typeof value === 'object' ? value : {};
  const allowed = [...Object.keys(solids), ...Object.keys(gradients), 'custom', 'transparent'];
  return {
    mascot: catalog.some(row => row.id === v.mascot) ? v.mascot : defaults.mascot,
    background: allowed.includes(v.background) ? v.background : defaults.background,
    custom: normalizeHex(v.custom) ?? defaults.custom,
    shape: v.shape === 'circle' ? 'circle' : defaults.shape,
    size: v.size === 1024 ? 1024 : defaults.size
  };
}

export function escapeXml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return value.replace(/[&<>"']/g, c => entities[c]);
}

export function composeSvg({ background, custom, size, shape }, name, imageUri, fit) {
  if (![512, 1024].includes(size)) throw new Error('Invalid export size');
  if (!/^data:image\/(png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(imageUri)) {
    throw new Error('Expected an embedded mascot image');
  }
  let defs = '';
  let fill = null;
  if (Object.hasOwn(gradients, background)) {
    const [, start, end] = gradients[background];
    defs = '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="' + start +
      '"/><stop offset="1" stop-color="' + end + '"/></linearGradient></defs>';
    fill = 'url(#bg)';
  } else if (Object.hasOwn(solids, background)) {
    fill = solids[background][1];
  } else if (background === 'custom' && normalizeHex(custom)) {
    fill = normalizeHex(custom);
  } else if (background !== 'transparent') {
    throw new Error('Invalid background');
  }
  const rect = fill ? '<rect width="1024" height="1024" fill="' + fill + '"/>' : '';
  if (!validFit(fit)) throw new Error('Invalid mascot fit');
  const side = Math.round(1024 * (fit?.scale ?? 1));
  const place = 'x="' + Math.round((fit?.x ?? 0) * (1024 - side)) + '" y="' +
    Math.round((fit?.y ?? 0) * (1024 - side)) + '" width="' + side + '" height="' + side + '"';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
    '" viewBox="0 0 1024 1024"><title>' + escapeXml(name) + '</title>' + defs +
    // A circle is cut into the picture itself, so the saved file matches the preview.
    (shape === 'circle' ? '<clipPath id="crop"><circle cx="512" cy="512" r="512"/></clipPath>' +
      '<g clip-path="url(#crop)">' : '<g>') +
    rect + '<image ' + place + ' href="' + imageUri + '"/></g></svg>';
}

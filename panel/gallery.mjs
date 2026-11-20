import { solids, gradients, normalizeHex, parseCatalog, preferences } from './compose.mjs';
import { readDataUrl, renderAvatar } from './render.mjs';

const $ = id => document.getElementById(id);
const key = 'orca-mascots.preferences.v1';
const status = $('status');

async function start() {
  const response = await fetch('./catalog.json');
  if (!response.ok) throw new Error('Could not load the mascot catalog.');
  const catalog = parseCatalog(await response.json());
  let stored;
  try { stored = localStorage.getItem(key); } catch { /* Private browsing can disable storage. */ }
  let state = preferences(stored, catalog);
  let generation = 0;
  let output;
  const sources = new Map();
  const labels = { transparent: 'Transparent', custom: 'Custom' };
  const assetUrl = row => '../' + row.asset;
  const canSave = Boolean(window.orca?.files?.saveAs);
  let saving = false;

  function enableExport() {
    $('png').disabled = !canSave || !output || saving;
  }

  function choose(change) {
    state = { ...state, ...change };
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Keep session preferences. */ }
    show();
  }

  for (const row of catalog) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.id = row.id;
    const img = new Image();
    img.alt = '';
    img.src = assetUrl(row);
    tile.append(img, document.createTextNode(row.name));
    tile.onclick = () => choose({ mascot: row.id });
    $('gallery').append(tile);
  }
  function swatch(id, name, fill) {
    labels[id] = name;
    const button = document.createElement('button');
    button.className = fill ? 'swatch' : 'swatch checker';
    if (fill) button.style.background = fill;
    button.title = name;
    button.setAttribute('aria-label', name);
    button.dataset.bg = id;
    button.onclick = () => choose({ background: id });
    $('swatches').append(button);
  }
  for (const [id, [name, fill]] of Object.entries(solids)) swatch(id, name, fill);
  for (const [id, [name, from, to]] of Object.entries(gradients)) {
    swatch(id, name, 'linear-gradient(135deg,' + from + ',' + to + ')');
  }
  swatch('transparent', 'Transparent', '');
  for (const button of document.querySelectorAll('[data-shape]')) {
    button.onclick = () => choose({ shape: button.dataset.shape });
  }
  $('size').onchange = () => choose({ size: Number($('size').value) });
  $('picker').oninput = () => choose({ background: 'custom', custom: normalizeHex($('picker').value) });
  $('hex').oninput = () => {
    const valid = normalizeHex($('hex').value);
    $('hex-error').textContent = valid ? '' : 'Enter a 3- or 6-digit hex colour.';
    $('hex').setAttribute('aria-invalid', String(!valid));
    if (valid) choose({ background: 'custom', custom: valid });
  };
  $('hex').onblur = () => {
    if (normalizeHex($('hex').value)) $('hex').value = state.custom;
  };

  async function show() {
    const revision = ++generation;
    const row = catalog.find(item => item.id === state.mascot);
    const previous = output;
    output = null;
    enableExport();
    if (previous) URL.revokeObjectURL(previous.preview);
    status.textContent = canSave ? '' : 'Saving requires Orca Desktop with isolated plugin frames.';
    $('current-name').textContent = row.name;
    $('current-id').textContent = row.id;
    $('mask').classList.toggle('circle', state.shape === 'circle');
    $('background-name').textContent = labels[state.background];
    $('picker').value = state.custom;
    if (document.activeElement !== $('hex')) {
      $('hex').value = state.custom;
      $('hex-error').textContent = '';
      $('hex').setAttribute('aria-invalid', 'false');
    }
    $('size').value = state.size;
    for (const b of document.querySelectorAll('[data-id], [data-bg], [data-shape]')) {
      const active = b.dataset.id === state.mascot || b.dataset.bg === state.background ||
        b.dataset.shape === state.shape;
      b.setAttribute('aria-pressed', String(active));
    }
    try {
      if (!sources.has(row.id)) {
        sources.set(row.id, fetch(assetUrl(row)).then(res => {
          if (!res.ok) throw new Error('Mascot image unavailable.');
          return res.blob();
        }).then(readDataUrl).catch(error => { sources.delete(row.id); throw error; }));
      }
      const data = await sources.get(row.id);
      if (revision !== generation) return;
      const ready = await renderAvatar(state, row, data);
      if (revision !== generation) { URL.revokeObjectURL(ready.preview); return; }
      output = ready;
      $('preview').src = output.preview;
      $('preview').alt = row.name + ' on ' + labels[state.background].toLowerCase() + ' background';
      enableExport();
    } catch (error) {
      if (revision === generation) status.textContent = 'Preview unavailable. ' + error.message;
    }
  }

  $('png').onclick = async () => {
    if (!output || saving) return;
    saving = true;
    enableExport();
    try {
      const result = await window.orca.files.saveAs({
        suggestedName: 'mascot-' + state.mascot + '-' + state.size + '.png',
        mimeType: 'image/png',
        data: output.png
      });
      status.textContent = result.status === 'saved' ? 'PNG saved.' : '';
    } catch (error) {
      status.textContent = 'Could not save. ' + error.message;
    } finally {
      saving = false;
      enableExport();
    }
  };
  await show();
}

start().catch(error => { status.textContent = error.message; });

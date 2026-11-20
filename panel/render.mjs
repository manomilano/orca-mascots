import { composeSvg } from './compose.mjs';

export function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function renderAvatar(settings, mascot, dataUri) {
  const svg = composeSvg(settings, mascot.name, dataUri);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = settings.size;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
    if (settings.size === 512 && blob.size >= 2 * 1024 * 1024) throw new Error('PNG exceeds 2 MiB');
    return { png: await blob.arrayBuffer(), preview: url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

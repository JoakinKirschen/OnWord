/** Photos for site reviews: shrunk in the browser before they are stored, as JPEG data URLs. */

const STORED_SIDE = 1600; // pixels on the longer side: sharp on a tablet, a few hundred KB
const REPORT_SIDE = 1000; // in a report two photos sit side by side on the page
const QUALITY = 0.8;

/** @param {Blob} blob @returns {Promise<string>} */
function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Draws an image at most `maxSide` pixels long and wide, as a JPEG data URL. */
async function draw(/** @type {ImageBitmap} */ bitmap, /** @type {number} */ maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return dataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY }));
}

/** A photo file from the camera or the gallery, turned upright and shrunk for storing. */
export async function shrinkPhoto(/** @type {Blob} */ file) {
  return draw(await createImageBitmap(file, { imageOrientation: 'from-image' }), STORED_SIDE);
}

/** A stored photo made smaller for a report, which holds many of them. */
export async function reportPhoto(/** @type {string} */ image) {
  // An <img> rather than fetch(): the security policy allows data: URLs for images only.
  const element = new Image();
  element.src = image;
  await element.decode();
  return draw(await createImageBitmap(element), REPORT_SIDE);
}

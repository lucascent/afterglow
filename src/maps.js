// Afterglow — fetching a photograph to lay on something. All the photographed surfaces (asphalt, grass,
// rock, snow) come in through here.

import * as THREE from 'three';

// It is decoded off the main thread, so the camera does not catch on it, and it repeats in both directions.
export async function loadMap(url, colour, anisotropy = 1) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;                                  // already turned over, above
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;                        // for what is seen at a slant, as a road always is
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

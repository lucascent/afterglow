# Afterglow

> Those fleeting encounters,\
> those brief, beautiful moments—
>
> Could they have planted\
> seeds that quietly take root\
> and live on within our hearts?
>
> More and more, I believe\
> that those brought together by love\
> will find each other again.
>
> At some time,\
> in some place,\
> beneath some bright moon rising,\
> in some way I cannot yet imagine.
>
> Or perhaps,\
> within each other’s thoughts,\
> somewhere among the galaxies,\
> in that boundless sea of stars,\
> our signals have already crossed\
> and collided countless times—\
> and countless times,\
> we have found each other again,\
> with joy—

A procedural WebGL scene: a two-lane road through a mountain valley at dusk, with the camera moving forward along it indefinitely.

![A two-lane road between dark conifers, a snow peak lit pink at the end of the valley](docs/screenshot.jpg)

[中文](README.zh.md)

## Features

- Endless, non-repeating road, valley and forest generated from road-relative coordinates
- Far mountain range ray-marched from a height field once at load, then lit per frame from a panorama
- About 80,000 trees and shrubs, painted at load time and drawn as instanced cross-cards
- Analytic lighting: sun gaps, tree-shadow bands and light shafts without lights or shadow maps
- Film-style post-processing: soft highlight roll-off, grade, vignette, grain, bloom
- Live parameter panel (**Tune**) with per-setting reset, local persistence and JSON export
- Plain ES modules, no build step, no runtime network requests

## Requirements

- A browser with WebGL2
- Any static HTTP server (ES modules and `fetch` do not work over `file://`)

## Quick start

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `?tune` | Open the Tune panel on load |
| `?s=1200` | Start 1200 m along the road |
| `?still` | Freeze the camera and render a single frame |
| `?atlas` | Skip the scene and display the painted tree and grass atlases (for editing `forest.js` / `verge.js`) |
| `?lang=zh` | Show a second language beside the English labels in the panel: `zh` (Traditional Chinese), `ja`, `ko`, `es`, `fr` |

Parameters can be combined, e.g. `?s=1200&still`.

## Tune panel

Opened from **Tune** in the top-right corner. Changes apply immediately.

| Group | Parameters |
| --- | --- |
| Travel | Speed, lens, gaze, camera height |
| Land | Relief, noise detail, snowline, road bends, forest density, tree height |
| Air | Sun azimuth, sun strength, glow line, sunbeams, haze, valley mist, cloud |
| Film | Exposure, saturation, hue, warmth, contrast, vignette, grain, bloom, trails, render scale |
| Colour | Zenith, afterglow, horizon, forest, last light, grass, asphalt, lit snow, shaded snow |

| Control | Behaviour |
| --- | --- |
| reset | Restores a single parameter; shown only once that parameter has changed |
| Reset all | Restores every parameter and clears saved settings; requires a second press to confirm |
| Keep | Saves the current settings to `localStorage` (this browser only) |
| Copy | Copies the changed parameters as JSON |
| Hold | Stops the camera; clouds and grain keep running |
| Replay | Returns to the start position and replays the fade-in |

To make a configuration the default for all visitors, paste the JSON from **Copy** into `tuned: {}` in `src/config.js`. **reset** then returns to those values. Setting the render scale manually disables automatic resolution scaling.

## Configuration

All tunable values live in [`src/config.js`](src/config.js): speed, camera, road geometry, forest, terrain, palette, fog, lighting, grade and quality. Lengths are in metres, angles in degrees, colours in sRGB.

## How it works

### Road space

The world is described by two coordinates: distance along the road and offset from its centre line. The centre line is a sum of sine waves with incommensurate wavelengths, so the road is unbounded and never repeats. Terrain and vegetation are defined relative to the road, which keeps the road on the valley floor and trees off the asphalt. Bend radius stays above about 290 m and grade below about 4%.

### Near geometry, far painting

Within about 4 km, the valley, road and trees are real geometry. Beyond that, mountains and sky are drawn by a shader on a sky dome. A shared fog model joins the two.

### Far range (`range.js`)

A height field 7–36 km away, generated as in Iñigo Quilez's *Elevated*: fBm whose higher octaves are damped where the slope is already steep, giving eroded ridges and valleys. Since the range does not change visibly as the camera moves, the ray-march runs once per view direction at load and is stored as a horizon panorama of distance and surface normal (8192×1024 on large screens, 4096×512 otherwise). The bake is split into 16 strips to avoid GPU watchdog timeouts; mipmaps are generated once at the end. Each frame samples the panorama and shades it: sun-facing light, short shadow marches between peaks, snow by altitude and slope, stratified rock, and distance haze. Only Relief and Detail trigger a re-bake, about 0.1 s after the slider is released.

Rock and snow detail come from Poly Haven textures. *Rock Face 03* is projected at 1.3 km width plus a second layer at a quarter of that, using two side projections so that cracks stay horizontal and vertical; only its detail and normals are used, not its colour. *Snow 02* contributes normals only, projected from above. The panorama stores distance as half-float for metre-level precision, so the textures do not slide.

### Ground

A single grid follows the camera in 16 m steps and is displaced into the valley on the GPU. Each row always lands on a position an earlier row occupied, so silhouettes do not shimmer as the camera advances.

### Trees

At load, eight plants are painted to a canvas atlas: six conifers (Douglas fir, spruce, subalpine fir, hemlock, an old fir with a dead top, lodgepole pine), a sapling and a shrub. Boughs are painted bottom to top, each casting a shadow onto those already drawn. Besides the silhouette, the atlas encodes brightness, distance along the bough (only outer tips receive sky light and sun) and wood versus needles. Twig and bark detail comes from Poly Haven's *Fir Tree 01* and *Pine Tree 01* textures; colour comes from the palette. Each tree is three crossed cards, all drawn in one instanced call. The instance budget (`forest` in `config.js`) is 24,000 forest trees, about 45% of them in the band beside the road; 50,000 more on the valley walls (25,000 on narrow screens); 3,200 shrubs along the forest edge; and 2,600 in clearings. Each instance is assigned in these proportions at random. Close up, a stretched noise erodes the edges into needles. Shrubs follow the forest edge as it opens and closes.

### Lighting

The scene contains no lights and no shadow maps.

- **Sun gaps**: where the last sunlight reaches the valley floor is a slowly varying function along the road (`sunGap`).
- **Tree shadows**: with the sun this low, shadows are treated as infinite parallel bands along the sun's azimuth, so occlusion depends on one coordinate and is modelled as three summed sines (`streaks`) fixed to the ground.
- **Light shafts**: the amount of lit fog along a view ray is the closed-form integral of those sines, so shafts separate when looking toward the sun, merge when looking across, and do not flicker.
- **Additive light**: shaded surfaces receive skylight only (`light.sky`); sunlit surfaces receive warm light on top.
- **Tree crowns** are shaded as rounded volumes, so only the sun-facing side and the outer tips light up, with per-tree and dappled variation.
- **Far peaks** receive sun only above the glow line (`light.peaks`): peach in light, deep blue in shade, slightly pink on shaded faces toward the sunset.
- **Sky view**: where forest walls close in, the floor sees less sky (`skyView`) and darkens.
- **Asphalt** reflects the sky at grazing angles and forward-scatters the sun where it is lit (`beam.shine`). Valley mist glows only when looking toward the sun (`beam.glow`). Upright objects catch more of the low sun than flat ground (`beam.upright`).

### Textures

Photographic textures (asphalt, grass, rock, snow) contribute detail only: each map's mean colour is divided out, so the palette controls colour. Asphalt is sampled twice with an offset and alternated every few metres to hide its 2 m tile; a roughness map makes worn areas reflect more sky. Grass is also sampled at 16× and 128× scale so that hillsides at distance read as canopy and gaps. About 30,000 upright grass tufts (`verge.js`) are kept within 160 m of the camera. Textures fade in over 1.5 s after load; if they fail, procedural surfaces remain.

2K textures are sufficient: the nearest road surface is 6 m from the camera, where one pixel on a 4K display covers more than 2 mm of road, while a 2K texel covers 1 mm. Larger versions would not be sampled. To change it, edit `surface.size` in `src/config.js` and download the matching maps.

### Post-processing (`film.js`)

One full-screen pass: soft shoulder above 0.75 instead of clipping, with bleaching only far above white; slight desaturation; cool shadows and warm highlights; vignette; fine grain, which also removes banding; and bloom from the scene target's mip chain above a threshold of 0.8, so only lit snow, the sunset sky and sunlit tips glow. Optional frame trails.

### Performance and fallbacks

- If frame time stays above budget, render scale drops (to a minimum of 60%). It never increases again.
- Rendering pauses while the tab is hidden.
- With *prefers-reduced-motion*, a single still frame is drawn.
- Without WebGL2, a one-line message is shown.
- On portrait screens the field of view widens.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page shell: canvas, corner labels, Tune panel |
| `src/config.js` | All tunable values |
| `src/path.js` | Road centre line on the CPU (camera) |
| `src/glsl.js` | Shared GLSL: road, terrain, fog, uniforms |
| `src/maps.js` | Texture loading (off the main thread) |
| `src/range.js` | Far-range terrain and panorama bake |
| `src/sky.js` | Sky, clouds, far-range shading, two nearer forested ridges |
| `src/ground.js` | Valley mesh, road surface, markings |
| `src/forest.js` | Tree and shrub painting and placement |
| `src/verge.js` | Upright grass tufts |
| `src/posts.js` | Delineator posts |
| `src/film.js` | Post-processing |
| `src/tune.js` | Tune panel |
| `src/main.js` | Frame loop, camera, resolution scaling |
| `vendor/three/` | Three.js 0.186.1 with a security patch |
| `tools/vendor-three/` | Patch and reproducible build for `vendor/three/` |
| `textures/` | Poly Haven textures |
| `fonts/` | Newsreader |

## Third-party components

| Component | Author | License |
| --- | --- | --- |
| [Three.js](https://threejs.org) 0.186.1 | three.js authors | MIT ([`vendor/three/LICENSE`](vendor/three/LICENSE)) |
| [Worn Asphalt](https://polyhaven.com/a/worn_asphalt) | Amal Kumar | CC0 |
| [Sparse Grass](https://polyhaven.com/a/sparse_grass) | Amal Kumar | CC0 |
| [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) (twig and bark textures only) | Rob Tuytel, Rico Cilliers | CC0 |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) (twig and bark textures only) | Rob Tuytel, Rico Cilliers | CC0 |
| [Rock Face 03](https://polyhaven.com/a/rock_face_03) | Dario Barresi, Rico Cilliers | CC0 |
| [Snow 02](https://polyhaven.com/a/snow_02) | Rob Tuytel | CC0 |
| [Newsreader](https://github.com/productiontype/Newsreader) | Production Type | SIL OFL 1.1 ([`fonts/OFL.txt`](fonts/OFL.txt)) |

The bundled Three.js is built from the official npm source with a patch covering property binding, animation caches, curve sampling and shadow material caches. None of these affect rendering in this scene. See [`tools/vendor-three/`](tools/vendor-three/); the official build of the same version is a drop-in replacement.

## Acknowledgements

Thanks to:

- **mdb**: [*Up in the Cloud Sea*](https://www.shadertoy.com/view/Ndc3zl) (ShaderToy). Source of the layered, noise-silhouette ridges in `sky.js`, depth-dependent parallax and the vignette curve in `film.js`.
- **Tianxiu (Tyson) Zhou**: course adaptation of *Up in the Cloud Sea*, whose GLSL source was studied.
- **HoytXU**: [*Cloudglen Express*](https://github.com/HoytXU/cloudglen_express), a WebGL2 breakdown of the same scene into noise, fBm, parallax, masks, smoke and compositing.
- **Rice-dog**: Cloud Train Background in [*code-codex*](https://github.com/Rice-dog/code-codex), an adjustable-parameter adaptation of mdb's shader.
- **incarnation-gem**: [*Sunset Cloud Train*](https://github.com/incarnation-gem/sunset-cloud-train) (落日云间列车), a standalone version of Rice-dog's plugin with a settings panel. Basis for the design of the Tune panel.
- **Iñigo Quilez**: *Elevated* (2009). Basis for the far-range terrain generation.

No code from these works is included in this repository.

## License

[MIT](LICENSE), covering everything outside `vendor/`, `textures/` and `fonts/`. Third-party components retain their own licenses (see above).

// Afterglow — every number worth turning, in one place, so the scene can be tuned without reading a shader.
// Lengths are metres, angles are degrees, colours are sRGB (they are made linear on their way to the GPU).

export const config = {
  speed: 12.5,                 // metres a second: 45 km/h. Slow enough to look at things

  camera: {
    height: 2.0,               // above the asphalt
    lane: 1.8,                 // right of the centre line: the middle of the right-hand lane
    fov: 46,                   // vertical. A longish lens: it brings the mountains closer than a wide one would
    minAcross: 56,             // on a tall screen the lens widens until it sees at least this much from side to side
    maxFov: 78,
    pitch: 3.5,                // the gaze is lifted this much, so the horizon sits below the middle of the picture
    lookNear: 45,              // the gaze rests between two points this far down the road:
    lookFar: 120,              //   it turns into a bend before the camera does, and has nothing in it that can jolt
    near: 0.5,
    far: 16000,
    zoom: 1,                   // the lens narrowed (above 1) or widened (below) from what the screen's shape asks for
  },

  // The road is a sum of sine waves whose lengths share no common measure, so it never repeats and
  // never needs joining. `x` is how far it wanders sideways, `y` how it rises and falls.
  // As set here: no bend tighter than about 290 m, no grade steeper than about 4 %.
  path: {
    x: { amp: [300, 44, 7], wave: [5200, 1150, 410], phase: [0.6, 2.1, 4.4] },
    y: { amp: [12, 3], wave: [3100, 980], phase: [1.0, 3.3] },
    // where the forest stands back from the road. Each side opens and closes on its own
    open: { wave: [1900, 830], left: [0.4, 1.9], right: [2.6, 5.0], from: 0.15, to: 0.6 },
    bend: 1,                   // every sideways wave multiplied by this: 0 is a straight road
    // where the ridge that hides the sun is notched, and its last light comes down to the valley floor
    gap: { wave: [2600, 1100], phase: [0, 0], from: 0.25, to: 0.65 },
    clear: 9,                  // how far from the centre line the first small trees stand
    meadow: 110,               // and how much further back they stand where the forest opens
    solidBend: 0.0016,         // curvature (1/m) past which the centre line may not be crossed: both yellow lines solid
  },

  // One grid, laid out in "road space" (across the road, along the road) and bent into the valley on the GPU.
  ground: {
    snap: 16,                  // the grid follows the camera in steps of this, so no vertex ever slides over the land
    back: 48,                  // how far behind the camera it starts
    nearStep: 4, nearTo: 400,  // rows every 4 m close by,
    farStep: 16, farTo: 4400,  //   every 16 m beyond
    across: [5.6, 6.6, 8, 10, 13, 17, 22, 28, 36, 46, 58, 72, 90, 110, 135, 165, 200, 240, 285, 335,
      390, 450, 510, 575, 640, 710, 780, 850, 925, 1000, 1075, 1150],
    repeat: 8192,              // the land's own noise repeats after this far (the road over it does not)
    lane: 3.6,                 // one lane
    paved: 4.3,                // centre line to the edge of the asphalt
    shoulder: 5.6,             // centre line to where the gravel ends and the land begins
  },

  // The far range: real mountains, from `from` to `to` kilometres off (range.js).
  range: {
    rock: { path: 'textures/rock_face_03/rock_face_03_', size: '1k', px: 1024, tile: 1.3, bump: 0.9 },   // Poly Haven's "Rock Face 03" (CC0): a 2.7 m face, laid on 1.3 km wide
    snow: { path: 'textures/snow_02/snow_02_', size: '1k', tile: 0.45, bump: 0.3 },                      // and "Snow 02": only which way its surface leans
    height: 2.3,               // km: how tall the land stands, before one massif is raised above the rest
    snowline: 1.25,            // km above the valley floor
    from: 7,
    to: 36,
  },

  // What the asphalt is made of up close: Poly Haven's "Worn Asphalt" (CC0), a photographed 2 m square.
  // 2k is deliberate. The camera is never nearer than 6 m to the road it can see, where one pixel of even a
  // 4K screen covers more than 2 mm of asphalt; at 2k one texel is 1 mm. A larger file would be drawn
  // identically, and take four times the download and memory for each step up.
  surface: {
    path: 'textures/worn_asphalt/worn_asphalt_',
    size: '2k',
    tile: 2,                   // metres the photograph covers before it repeats
    relief: 0.4,               // how strongly its grain catches the light
    anisotropy: 8,
    fade: 1.5,                 // seconds it takes to come in once it has loaded
  },

  // What the land beside the road is made of up close: Poly Haven's "Sparse Grass" (CC0), also a 2 m square.
  // On open ground it is used as it is, for grass; under the trees only its light and dark, for litter and moss.
  turf: {
    path: 'textures/sparse_grass/sparse_grass_',
    size: '2k',
  },

  forest: {
    count: 24000,
    nearShare: 0.45,           // this share of the trees stands in the band beside the road; the rest dress the slopes
    band: 55,
    reach: 1100,
    length: 2048,              // the trees are planted once along this much road and come round again
    back: 48,
    atlas: 4096,               // width of the canvas the eight plants are painted on (it is half as tall)
    slope: 50000,              // more trees for the valley walls, as many high up as low down (half that on a phone)
    loose: 2600,               // shrubs scattered over the clearings
    undergrowth: 3200,         // shrubs along the edge of the forest, on top of the trees
    seed: 260925,
  },

  // Grass that stands up: tufts, kept in the stretch of road around the camera (verge.js).
  verge: {
    count: 30000,
    length: 160,
    back: 12,
  },

  // Marker posts on the gravel at each side of the road (posts.js). A spacing of 0 leaves them out.
  posts: {
    spacing: 40,
    height: 1.2,
    width: 0.1,
  },

  // The sun is already behind the right-hand ridge. Its light still reaches whatever stands high enough.
  light: {
    azimuth: 55,               // right of straight down the valley
    elevation: 8,
    shadowAt: 250,             // height above the road, at its centre line, where the valley's shadow ends
    peaks: 1.0,                // km above the valley floor: on the far range, only what stands higher than this still has the sun
    bright: 1.5,               // what the last sun does to whatever it falls on full, against that thing's colour in the light below: past white, which the film rounds off
    sky: [0.9, 0.98, 1.08],    // the light in the shade is the sky's, and the sky is cool: what it does to white
    corridor: 0.85,            // how much less sky reaches the road where the forest stands close on both sides: 0 none less, 1 as if the trees were a solid wall
    // The light that comes down through a gap: low, warm, and striped by the shadows of the trees it passes.
    beam: {
      warm: [1.0, 0.66, 0.36],  // its colour, as what it does to white
      rake: 2.2,                // how much it adds to ground it falls on
      upright: 1.6,             // and how much more to what stands up (grass, posts), which takes a light this low more squarely
      shine: 1.2,               // how brightly asphalt in it shines, looked at toward the sun
      dim: 0.5,                 // how much of the sun's strength is left by the time it has come down through a gap
      glow: 0.5,                // how brightly lit mist shows, looked at toward the sun (across the light it hardly shows)
      air: 250,                 // metres of lit mist it takes to show fully
      shadows: [23, 9.1, 3.7],  // the widths (m) the shadows across it come in
      phase: [0.3, 2.2, 4.1],
    },
  },

  air: {
    haze: 1.1e-4,              // per metre, everywhere
    mist: 3.5e-4,              // per metre more, down on the valley floor
    mistDepth: 35,             // the mist thins by 1/e for each this many metres of height
    hazeTint: [0.86, 0.91, 0.96],  // far air: nearly the sky's own colour, so a far ridge fades into the sky behind it
    mistTint: [0.6, 0.68, 0.72],   // the mist down in the valley's shade, lit only by the sky: dimmer and cooler
    patch: 128,                // the mist lies in patches about this many metres across
    drift: 0.6,                // which drift across the valley at this many metres a second
  },

  colour: {
    skyWarm: '#f0e2c6',        // the horizon toward where the sun went
    skyCool: '#aacdc4',        // the horizon away from it
    skyZenith: '#5a8a94',
    skyFalloff: 3.2,           // how quickly the horizon's colour gives way to the zenith's
    cloudLit: '#f4e6cf',
    cloudShade: '#a9b7b3',
    cloud: 0.75,               // how solid a cloud is
    cloudCover: 0.5,           // how much of the sky has one

    snowLit: '#f3c3a6',        // the last sun on snow: peach, going on rose. On a mountain this is the afterglow itself
    snowShade: '#5c7396',      // and snow it has left, lit by the sky alone: deep blue, so the lit faces burn against it
    rockLit: '#b08870',
    rockShade: '#4d5f68',
    ridgeFar: '#2c4244',
    ridgeNear: '#17272a',
    hero: 0.08,                // where along the horizon the tallest peak stands (radians right of centre)

    tree: '#0c1611',
    bark: '#1c1814',
    post: '#6b706c',
    forest: '#0a120d',
    forestLit: '#9a8a48',      // what the last sun adds to the needles it reaches: olive gold
    grass: '#28321f',
    gravel: '#44443f',
    asphalt: '#3a3d3d',
    white: '#c4c8c0',
    yellow: '#b3922b',
    sheen: 0.35,               // how much sky the far asphalt gives back
  },

  film: {
    saturation: 0.95,
    shade: [0.9, 1.0, 1.0],    // what the darks are multiplied by: a little red taken out
    glow: [1.03, 1.0, 0.95],   // and the lights: a little blue taken out
    contrast: 0.25,
    lift: 0.018,               // black is never quite black
    vignette: 0.38,
    grain: 0.08,
    shoulder: 0.75,            // light up to this is left as it is; brighter is eased toward white instead of cut at it
    bleach: 0.6,               // and what is far past white loses its colour this quickly
    bloom: 0.35,               // how much the bright parts of the picture spill into the dark
    bloomAt: 0.8,              // how bright a part has to be to spill: what the last sun is on, the sky where it went
  },

  // Your own settings, on top of everything above. Whatever the Tune panel's Copy gives goes here,
  // and becomes what every visitor sees and what the panel's "reset" returns to.
  tuned: {},

  quality: {
    maxDpr: 1.75,
    samples: 4,                // MSAA. The trees' edges depend on it
    minScale: 0.6,             // on a slow machine the picture is drawn smaller, down to this share, before it is allowed to stutter
  },
};

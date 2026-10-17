# Study Knight

A desktop study timer. While you focus, a little knight runs through the mountains and the sky moves
from sunrise to noon, sunset and night over your whole plan. On breaks he makes camp by a fire in the
glacial peaks.

```
npm install
npm start
```

## Methods

| Method | Blocks |
|---|---|
| Descending | 50 · 10 · 40 · 10 · 30 · 10 |
| Pomodoro | 4 × (25 · 5), last break 15 |
| 52 / 17 | 52 · 17, ×3 rounds by default |
| Ultradian | 90 · 20, ×2 rounds by default |
| Flowtime | count up; break is 5 / 8 / 10 / 15 min for < 25 / < 50 / < 90 / 90+ min of focus |
| Custom | any sequence you build in the Plan drawer |

Rounds repeat the whole sequence. "Auto-start next block" chains blocks without a click.

## Keys

`Space` start / pause · `S` skip (or take a Flowtime break) · `M` mini mode (small, always on top) · `Esc` close drawer

## Notes

- Timing uses timestamps, so it stays right when minimized. A session left running when you quit comes
  back paused where you left it (if you reopen within 12 hours).
- Focus minutes per day are stored locally and shown in the Journey log (today, last 7 days, streak).
- The renderer also runs in a plain browser (`python -m http.server -d src`); mini mode and native
  notifications only work in the desktop app.

## Scenery

Open the drawer (☰) → **Scenery** to pick:

- **Character**: Meow Knight plus palette swaps (Ginger, Paladin, Rose, Shadow) and any packs you add.
- **Focus scene** and **Break scene**: chosen separately. A scene with several phases (Four Skies has
  Sunrise / Noon / Sunset / Night) can be pinned to one phase or set to **Day cycle**, which moves through
  every phase over the length of your plan. Scenes with no ground of their own (Glacial Mountains) get a
  stone ridge to run on and an outcrop for the campfire.

### Custom packs (desktop app)

**Import folder…** copies a folder into the packs folder (`%APPDATA%/study-knight/packs`). You can
also drop folders there yourself and hit **Reload**. **✕** moves a pack to the Recycle Bin.

A folder with no `manifest.json` is read like this:

| Folder contains | Becomes |
|---|---|
| `idle.png` and `run.png` (optional `jump.png`) | a character; each file is a horizontal strip of square frames |
| image files | a background with one phase; layers go back to front in filename order (`1.png`, `2.png`, …) |
| subfolders of images | a background with one phase per subfolder (e.g. `Day/`, `Night/`) |

For anything else, add a `manifest.json`:

```jsonc
// character
{
  "type": "character",
  "name": "Fox Ranger",
  "frameWidth": 32, "frameHeight": 32,   // omit for square frames in horizontal strips
  "scale": 2,                             // default: whatever makes the frame ~48px tall
  "feet": 3,                              // empty rows under the feet in each frame
  "facing": "left",                       // if the art faces left; the app runs to the right
  "anims": {
    "idle": { "src": "idle.png", "frames": 4, "ms": 150 },
    "run":  { "src": "run.png", "ms": 90 },
    "jump": { "src": "jump.png", "air": [2, 5] }, // optional; "air" = frames spent off the ground
    // optional; any anim named attack… is used on enemies. "hit" = frame where the blow lands.
    // frameWidth/frameHeight can be set per animation when attack frames are wider.
    "attack1": { "src": "slash.png", "frames": 6, "frameWidth": 48, "frameHeight": 32, "hit": 3 }
  }
}
```

Heroes without attack animations hop on enemies (if they have `jump`); with neither, enemies just poof
on contact.

```jsonc
// background
{
  "type": "background",
  "name": "Desert",
  "scale": 2,       // default: fit the layer height to the 320px-tall scene
  "cropY": 40,      // scaled px cut from the top if the layers are taller than the view
  "groundY": 170,   // where feet land, in source pixels of the layer images
  "ledge": false,   // true draws a stone path / outcrop for scenes without ground
  "phases": [
    { "name": "Day", "layers": [
      { "src": "day/sky.png",   "parallax": 0 },              // 0 = static, 1 = moves with the runner
      { "src": "day/dunes.png", "parallax": 0.4, "drift": 3 }, // drift = px/s of motion of its own (clouds)
      { "src": "day/floor.png", "parallax": 1, "y": 150 }       // y = source px from the top (e.g. a ground strip)
    ] }
  ]
}
```

Strips can also run top to bottom (`"vertical": true` on an animation). Layers should tile horizontally.

## Credits

- Meow Knight character sprites
- Four Skies parallax backgrounds
- Enemies and the Four Skies floor: Kenney "Pixel Platformer" (https://kenney.nl), CC0. The floor is the
  grass-top tile recoloured to each sky's forest palette.
- Glacial Mountains parallax background by Vicente Nitti (@vnitti), CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Layers used as-is, scaled 2×.

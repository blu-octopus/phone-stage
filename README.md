# Phone Stage

Drop a design onto a 3D phone, pick a motion, and export it as an **MP4, GIF, WebM or PNG**. It's built for designers who want a polished device animation for X, Instagram, Dribbble, LinkedIn, a portfolio or a pitch deck, without opening a 3D app.

Everything runs in your browser. Your files never leave your computer.

**▶ Use it: https://blu-octopus.github.io/phone-stage/**

## What you can drop in

| Type | Formats | Notes |
|---|---|---|
| Stills | PNG, JPG, WebP, SVG, AVIF | Phone-shaped exports look best (e.g. 1170×2532 or 390×844 @3x) |
| Animated | GIF | Plays at its real speed, frame-exact on export (Chrome, Edge, Safari) |
| Video | MP4, WebM, MOV | H.264 MP4 works everywhere; HEVC MOV depends on your browser |

Drop a file anywhere on the window, click **Choose a file**, or **paste** an image (in Figma: right-click → Copy as PNG, then Cmd+V).

Design files like `.fig`, `.sketch` or `.xd` can't be rendered directly, so export the frame as PNG or a prototype recording as MP4 first.

## Controls

- **Design:** *Fill* crops your design to the screen; *Fit* shows all of it on a color you pick.
- **Phone:** five finishes (Midnight, Silver, Blush, Lavender, Mint), size, camera island, floor shadow.
- **Motion:**

  | Preset | What it does |
  |---|---|
  | Sway | gentle figure-8, the safe default |
  | Turntable | full 360° spin, back included |
  | Float | hovering drift |
  | Spin & hold | holds, spins once, holds |
  | Still | one hero angle, no motion |

  **Amount** scales the motion and **Loop** sets the clip length. Every preset ends where it starts, so exports loop seamlessly. If your design is a video or GIF, **Match the video/GIF length** makes the two loops line up too.
- **Background:** studio, graphite, vapor, sunset, ocean, mint, blush, any solid color, or none (transparent, for PNG and WebM).
- **Export:**
  - **Shape:** 16:9 (X / YouTube), 1:1, 4:5 (Instagram feed) or 9:16 (Stories / Reels / TikTok)
  - **Format** and **frame rate**
  - **Quality:** Full is 1080p for video and 600px on the short side for GIF

Space toggles play/pause, and the timeline scrubs.

### Which format?

| Format | Use it for |
|---|---|
| **MP4** | Posting almost anywhere (X, Instagram, LinkedIn, Slack). Small and sharp |
| **GIF** | Places that only take images (README files, some chat apps). Bigger, 256 colors |
| **WebM** | Websites; keeps a transparent background |
| **PNG** | A single still at the moment the timeline is on |

## Run it

It's a static site with no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. It deploys as-is to GitHub Pages, Netlify or Vercel.

**Browser support:**
- Video export uses WebCodecs: Chrome, Edge and Safari 16.4+.
- GIF and PNG export work in every modern browser.

## How it works

```
your file ──▶ media.js ──▶ screen canvas ──▶ stage.js (three.js phone) ──▶ composite ──▶ exporter.js
              (image / GIF frames /            (texture on the        (background   MP4 · WebM · GIF · PNG
               seekable video)                  screen mesh)           + phone)
```

- **[src/stage.js](src/stage.js):** the phone, built from three.js primitives. It has a rounded metal body, a black glass front with the screen set into it, side buttons, and a camera bump with three lenses on the back. It's lit by a studio environment map, with a contact shadow. Screen colors are drawn unlit and without tone mapping, so your design keeps its exact colors.
- **[src/media.js](src/media.js):** loads your file. GIFs are decoded into frames with their real timings using `ImageDecoder`. Videos play live in the preview, and on export they seek to each exact frame time.
- **[src/motion.js](src/motion.js):** the presets, each a function of loop progress (0 → 1) that returns rotation and height.
- **[src/exporter.js](src/exporter.js):** renders every frame at an exact time (`i / fps`), so clips are evenly timed however long each frame takes to render.
  - MP4 and WebM are encoded with WebCodecs and muxed in the browser.
  - GIFs use one shared palette, so colors don't shimmer.
  - Exports keep running in a background tab.
- **[src/main.js](src/main.js):** the UI. Settings are remembered between visits.

There's also a small scripting hook for batch jobs and tests: `await window.phoneStage.load(file)`, then `await window.phoneStage.exportBlob('mp4')`.

## Credits

- [three.js](https://github.com/mrdoob/three.js) (MIT): 3D rendering, `RoundedBoxGeometry`, `RoomEnvironment`
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) and [webm-muxer](https://github.com/Vanilagy/webm-muxer) by Vanilagy (MIT): in-browser MP4/WebM files
- [gifenc](https://github.com/mattdesl/gifenc) by Matt DesLauriers (MIT): fast GIF encoding
- [Inter](https://rsms.me/inter/) by Rasmus Andersson (SIL Open Font License)
- Grew out of the promo-clip stage in [DOUGHNUT3D](https://github.com/blu-octopus/terminal-donut)

## License

[MIT](LICENSE) — use it, change it, ship it. Attribution appreciated, not required.

Made by [blu-octopus](https://github.com/blu-octopus), built with [Claude Code](https://claude.com/claude-code).

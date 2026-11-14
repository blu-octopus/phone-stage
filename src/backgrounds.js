// Backdrops drawn behind the phone. Each paints a w×h canvas.

const radial = (inner, outer) => (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

const linear = (...stops) => (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

export const BACKGROUNDS = {
  studio: { label: 'Studio', swatch: 'radial-gradient(#ffffff, #dcdce4)', paint: radial('#ffffff', '#d9d9e2') },
  graphite: { label: 'Graphite', swatch: 'radial-gradient(#3a3a46, #0c0c10)', paint: radial('#34343f', '#0b0b0f') },
  vapor: { label: 'Vapor', swatch: 'linear-gradient(160deg, #0d0221, #6b1f8f 60%, #ff71ce)', paint: linear('#0d0221', '#4a1a6b', '#b33ea8', '#ff9ad5') },
  sunset: { label: 'Sunset', swatch: 'linear-gradient(160deg, #ffd29a, #ff6f91 55%, #6c3cb4)', paint: linear('#ffd29a', '#ff8e8e', '#ff6f91', '#6c3cb4') },
  ocean: { label: 'Ocean', swatch: 'linear-gradient(160deg, #061a40, #1f5fbf 60%, #74d7ff)', paint: linear('#061a40', '#0d3b8a', '#1f5fbf', '#74d7ff') },
  mint: { label: 'Mint', swatch: 'radial-gradient(#f4fff9, #a9e4c8)', paint: radial('#f4fff9', '#a9e4c8') },
  blush: { label: 'Blush', swatch: 'radial-gradient(#fff7fa, #f3c1d3)', paint: radial('#fff7fa', '#f1bccf') },
  custom: { label: 'Solid', swatch: null, paint: null }, // uses the color picker
  transparent: { label: 'None', swatch: null, paint: null }, // PNG / WebM only
};

export function paintBackground(ctx, w, h, key, customColor) {
  ctx.clearRect(0, 0, w, h);
  if (key === 'transparent') return;
  if (key === 'custom') {
    ctx.fillStyle = customColor;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  (BACKGROUNDS[key] ?? BACKGROUNDS.studio).paint(ctx, w, h);
}

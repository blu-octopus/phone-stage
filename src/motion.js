// Motion presets. Each takes the loop phase p (0 → 1) and an amount (0 → 1.5)
// and returns the phone's pose. Every preset ends exactly where it starts, so
// exported clips loop seamlessly.

const TAU = Math.PI * 2;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export const MOTIONS = {
  sway: {
    label: 'Sway',
    hint: 'gentle figure-8',
    pose: (p, a) => ({
      ry: 0.5 * a * Math.sin(TAU * p),
      rx: -0.06 + 0.14 * a * Math.sin(2 * TAU * p),
      rz: 0.03 * a * Math.sin(TAU * p),
      y: 0,
    }),
  },
  turntable: {
    label: 'Turntable',
    hint: 'full 360° spin',
    pose: (p, a) => ({
      ry: TAU * p,
      rx: -0.12 * a,
      rz: 0,
      y: 0.06 * a * Math.sin(2 * TAU * p),
    }),
  },
  float: {
    label: 'Float',
    hint: 'hover and drift',
    pose: (p, a) => ({
      ry: -0.28 * a + 0.22 * a * Math.sin(TAU * p),
      rx: -0.1 * a + 0.06 * a * Math.cos(TAU * p),
      rz: 0.05 * a * Math.sin(TAU * p + 1),
      y: 0.18 * a * Math.sin(TAU * p),
    }),
  },
  showcase: {
    label: 'Spin & hold',
    hint: 'hold, spin once, hold',
    pose: (p, a) => {
      const spin = easeInOut(clamp01((p - 0.35) / 0.45));
      return {
        ry: TAU * spin - 0.22 * a * Math.cos(TAU * p),
        rx: -0.08 * a,
        rz: 0,
        y: 0.05 * a * Math.sin(TAU * p),
      };
    },
  },
  still: {
    label: 'Still',
    hint: 'hero angle, no motion',
    pose: (p, a) => ({ ry: -0.35 * a, rx: -0.1 * a, rz: 0, y: 0 }),
  },
};

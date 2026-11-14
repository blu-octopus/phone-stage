// Turns the animation into a file, entirely in the browser.
//
// Every frame is rendered at an exact time (i / fps), so clips are evenly timed
// and loop seamlessly no matter how long each frame takes to render.
//   MP4  — H.264 via WebCodecs, muxed with mp4-muxer
//   WebM — VP9 via WebCodecs (keeps transparency), muxed with webm-muxer
//   GIF  — gifenc, one shared palette for steady colors
//   PNG  — a single still frame

import * as Mp4 from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs';
import * as WebM from 'https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.mjs';
import { GIFEncoder, quantize, applyPalette } from 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';

export const FORMATS = {
  mp4: { label: 'MP4', ext: 'mp4', mime: 'video/mp4', note: 'Best for X, Instagram, LinkedIn, Slack' },
  gif: { label: 'GIF', ext: 'gif', mime: 'image/gif', note: 'Plays everywhere; larger file, 256 colors' },
  webm: { label: 'WebM', ext: 'webm', mime: 'video/webm', note: 'Small; supports a transparent background' },
  png: { label: 'PNG', ext: 'png', mime: 'image/png', note: 'One still frame at the current moment' },
};

export function videoSupported() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

// Yield to the browser between frames. A MessageChannel isn't throttled in
// background tabs the way setTimeout is (≥1 s), so exports keep going there.
const channel = new MessageChannel();
const waiting = [];
channel.port1.onmessage = () => waiting.shift()?.();
const tick = () => new Promise((r) => { waiting.push(r); channel.port2.postMessage(0); });

class Cancelled extends Error {}
export const isCancelled = (e) => e instanceof Cancelled;

async function firstSupported(codecs, base) {
  for (const codec of codecs) {
    const config = { ...base, codec };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {}
  }
  return null;
}

// renderFrame(t) → a canvas (width × height) showing the scene at time t seconds.
export async function exportClip({ format, width, height, fps, duration, transparent, renderFrame, onProgress, signal }) {
  const frames = Math.max(1, Math.round(duration * fps));
  const check = () => { if (signal?.aborted) throw new Cancelled('cancelled'); };

  if (format === 'png') {
    const canvas = await renderFrame(0);
    return new Promise((r) => canvas.toBlob(r, 'image/png'));
  }

  if (format === 'gif') {
    // Build one palette from a few frames spread across the loop (sampled pixels).
    const samples = [];
    for (let k = 0; k < 8; k++) {
      check();
      const c = await renderFrame((k / 8) * duration);
      const data = c.getContext('2d').getImageData(0, 0, width, height).data;
      for (let i = 0; i < data.length; i += 4 * 3) samples.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
      onProgress?.(0.08 * (k / 8), 'Building palette…');
      await tick();
    }
    const palette = quantize(new Uint8Array(samples), 256);
    const gif = GIFEncoder();
    const step = 1000 / fps;
    for (let i = 0; i < frames; i++) {
      check();
      const c = await renderFrame(i / fps);
      const data = c.getContext('2d').getImageData(0, 0, width, height).data;
      // GIF delays are in 10 ms steps: round each frame's end time so the average stays exact.
      const delay = Math.round(((i + 1) * step) / 10) * 10 - Math.round((i * step) / 10) * 10;
      gif.writeFrame(applyPalette(data, palette), width, height, i === 0 ? { palette, delay } : { delay });
      onProgress?.(0.08 + 0.92 * ((i + 1) / frames), `Frame ${i + 1} / ${frames}`);
      if (i % 2 === 0) await tick();
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  }

  // ---- MP4 / WebM via WebCodecs ----------------------------------------------------
  if (!videoSupported()) throw new Error('Video export needs Chrome, Edge or Safari 16.4+. Try GIF instead.');
  const bitrate = Math.round(width * height * fps * 0.16);
  const base = { width, height, bitrate, framerate: fps };
  let muxer;
  let config;
  if (format === 'mp4') {
    config = await firstSupported(['avc1.640034', 'avc1.640028', 'avc1.4d0028', 'avc1.42001f'], base);
    if (!config) throw new Error('This browser can’t encode H.264 at this size. Try a smaller size or WebM.');
    muxer = new Mp4.Muxer({ target: new Mp4.ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  } else {
    const alpha = transparent ? { alpha: 'keep' } : {};
    config = await firstSupported(['vp09.00.40.08', 'vp8'], { ...base, ...alpha });
    if (!config && transparent) config = await firstSupported(['vp09.00.40.08', 'vp8'], base);
    if (!config) throw new Error('This browser can’t encode WebM. Try MP4 or GIF.');
    muxer = new WebM.Muxer({
      target: new WebM.ArrayBufferTarget(),
      video: { codec: config.codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9', width, height, frameRate: fps, alpha: config.alpha === 'keep' },
    });
  }

  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(config);
  try {
    for (let i = 0; i < frames; i++) {
      check();
      if (failure) throw failure;
      const canvas = await renderFrame(i / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await tick();
      onProgress?.((i + 1) / frames, `Frame ${i + 1} / ${frames}`);
      if (i % 3 === 0) await tick();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: FORMATS[format].mime });
}

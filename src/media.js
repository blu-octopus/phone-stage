// Loads a dropped file into something the screen can draw at any time t.
//
//   const media = await loadMedia(file);
//   media.drawable(t)      → an image/video/bitmap to draw for the preview (fast, live)
//   await media.seek(t)    → make drawable(t) exact for export (seeks videos)
//   media.duration         → seconds of animation (0 for stills)
//   media.dispose()

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,video/mp4,video/webm,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif,.mp4,.webm,.mov,.m4v';
const MAX_GIF_FRAMES = 600;

function kindOf(file) {
  const type = file.type || '';
  const ext = file.name.split('.').pop().toLowerCase();
  if (type === 'image/gif' || ext === 'gif') return 'gif';
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  return null;
}

export async function loadMedia(file) {
  const kind = kindOf(file);
  if (kind === 'gif') return loadGif(file);
  if (kind === 'video') return loadVideo(file);
  if (kind === 'image') return loadImage(file);
  throw new Error(`Can't stage “${file.name}”. Export it as PNG, JPG, GIF, WebP, SVG, MP4, WebM or MOV first.`);
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`Couldn't read “${file.name}” as an image.`);
  }
  return {
    kind: 'image',
    name: file.name,
    width: img.naturalWidth || 1170, // SVGs without a size get phone-ish defaults
    height: img.naturalHeight || 2532,
    duration: 0,
    drawable: () => img,
    seek: async () => {},
    dispose: () => URL.revokeObjectURL(url),
  };
}

// Animated GIFs are decoded into individual frames with their own timings, so a
// GIF plays at its true speed and exports frame-exact.
async function loadGif(file) {
  if (typeof ImageDecoder === 'undefined') {
    // No ImageDecoder (e.g. Firefox): show the first frame as a still.
    const still = await loadImage(file);
    return { ...still, note: 'This browser can only show the first frame of GIFs. Use Chrome, Edge or Safari for animated GIFs.' };
  }
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
  await decoder.tracks.ready;
  const count = Math.min(decoder.tracks.selectedTrack.frameCount, MAX_GIF_FRAMES);
  const frames = [];
  const starts = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    frames.push(await createImageBitmap(image));
    starts.push(total);
    total += Math.max(0.02, (image.duration ?? 100000) / 1e6); // microseconds → seconds
    image.close();
  }
  decoder.close();

  const frameAt = (t) => {
    if (frames.length === 1) return frames[0];
    const local = ((t % total) + total) % total;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= local) lo = mid;
      else hi = mid - 1;
    }
    return frames[lo];
  };

  return {
    kind: 'gif',
    name: file.name,
    width: frames[0].width,
    height: frames[0].height,
    duration: frames.length > 1 ? total : 0,
    drawable: frameAt,
    seek: async () => {},
    dispose: () => frames.forEach((f) => f.close()),
  };
}

async function loadVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('decode'));
    });
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`This browser can't play “${file.name}”. Try exporting it as H.264 MP4 or WebM.`);
  }
  video.play().catch(() => {});

  // Seek to an exact time and wait until that frame is actually ready to draw.
  async function seek(t) {
    video.pause();
    const target = ((t % video.duration) + video.duration) % video.duration;
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) return;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        resolve();
      };
      const giveUp = setTimeout(finish, 3000);
      video.addEventListener('seeked', () => {
        // Wait for the new frame to be presented when the browser tells us; hidden
        // tabs never fire that callback, so don't wait for it longer than a moment.
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(finish);
        setTimeout(finish, video.requestVideoFrameCallback ? 120 : 0);
      }, { once: true });
      video.currentTime = target;
    });
  }

  return {
    kind: 'video',
    name: file.name,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    drawable: () => video,
    seek,
    resume: () => video.play().catch(() => {}),
    dispose: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

// Draw media into the phone's screen canvas. fit: 'cover' fills (cropping),
// 'contain' shows all of it on `fill`.
export function paintScreen(ctx, w, h, source, srcW, srcH, fit, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  if (!source || !srcW || !srcH) return;
  const scale = fit === 'contain' ? Math.min(w / srcW, h / srcH) : Math.max(w / srcW, h / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (w - dw) / 2, fit === 'top' ? 0 : (h - dh) / 2, dw, dh);
}

// What the screen shows before anything is dropped.
export function paintPlaceholder(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b1055');
  g.addColorStop(0.55, '#7597de');
  g.addColorStop(1, '#ffd6e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // soft floating orbs
  for (let i = 0; i < 3; i++) {
    const x = w * (0.3 + 0.4 * Math.sin(t * 0.6 + i * 2.1));
    const y = h * (0.35 + 0.25 * Math.cos(t * 0.5 + i * 1.7));
    const r = w * (0.35 + 0.1 * i);
    const orb = ctx.createRadialGradient(x, y, 0, x, y, r);
    orb.addColorStop(0, 'rgba(255,255,255,0.35)');
    orb.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.font = `600 ${w * 0.085}px -apple-system, "Inter", "Segoe UI", sans-serif`;
  ctx.fillText('Drop your', w / 2, h * 0.47);
  ctx.fillText('design here', w / 2, h * 0.47 + w * 0.1);
  ctx.font = `400 ${w * 0.04}px -apple-system, "Inter", "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('PNG · JPG · GIF · SVG · MP4 · MOV', w / 2, h * 0.47 + w * 0.2);
}

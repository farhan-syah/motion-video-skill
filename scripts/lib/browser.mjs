import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  console.error(`Playwright is not installed. Run: cd ${dir} && bun install`);
  process.exit(2);
}

// Replaces Math.random with a seeded PRNG so every render draws the same numbers.
function seedRandom() {
  let a = 0x9e3779b9;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Loads every declared font face and decodes every image, then freezes the timeline at 0.
async function prepare() {
  const failed = [];
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => failed.push(`${f.family} ${f.weight} ${f.style}`))));
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => failed.push(`image ${img.currentSrc || img.src}`))));
  if (window.__video?.ready) await window.__video.ready;
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = 0;
  }
  return failed;
}

async function seekTo(ms) {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = ms;
  }
  if (window.__video?.seek) await window.__video.seek(ms);
  // Two frames let large or 3D layers finish rasterizing before capture. The timeout guards a throttled page.
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 250)),
  ]);
}

// Prefers a browser already on the machine. MOTION_VIDEO_CHROME overrides the search.
export function systemBrowser() {
  const candidates = [
    process.env.MOTION_VIDEO_CHROME,
    'chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return c;
      continue;
    }
    try {
      return execFileSync('which', [c], { encoding: 'utf8' }).trim();
    } catch {}
  }
  return null;
}

const BASE_ARGS = ['--force-color-profile=srgb', '--allow-file-access-from-files', '--hide-scrollbars', '--font-render-hinting=none'];
// Hardware GL through ANGLE, on each platform's own backend. Measured on Linux with an RTX 3060 (EGL):
// -54% CPU instructions per frame versus SwiftShader.
const ANGLE = { linux: 'gl-egl', darwin: 'metal', win32: 'd3d11' }[process.platform];
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', ...(ANGLE ? [`--use-angle=${ANGLE}`] : []), '--enable-gpu-rasterization'];
let gpuVerdict = null;

export async function renderer(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return 'none';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
  } finally {
    await page.close();
  }
}

// Launches with the GPU when one works, else software rendering. MOTION_VIDEO_GPU=0 forces software.
export async function launch() {
  const executablePath = systemBrowser() ?? undefined;
  const open = (extra) => chromium.launch({ executablePath, args: [...BASE_ARGS, ...extra] });
  try {
    if (process.env.MOTION_VIDEO_GPU !== '0' && gpuVerdict !== false) {
      // A GPU launch that fails falls back to software rendering, never to an error.
      const b = await open(GPU_ARGS).catch(() => null);
      if (!b) gpuVerdict = false;
      else {
        if (gpuVerdict) return b;
        const r = await renderer(b);
        gpuVerdict = !/swiftshader|llvmpipe|software|none/i.test(r);
        if (gpuVerdict) {
          console.error(`drawing on GPU: ${r}`);
          return b;
        }
        await b.close();
      }
    }
    return await open([]);
  } catch (e) {
    const dir = fileURLToPath(new URL('..', import.meta.url));
    throw new Error(`Chromium failed to launch (${executablePath ?? 'Playwright bundled build'}): ${e.message.split('\n')[0]}. Install chromium, set MOTION_VIDEO_CHROME to a Chrome binary, or run: cd ${dir} && bunx playwright install chromium-headless-shell`);
  }
}

export async function openScene(browser, m, scene, { scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: m.width, height: m.height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console error: ${msg.text()}`));
  // A network fetch makes the render depend on a server. Every file must live in the project.
  await ctx.route(/^(https?|wss?):/, (route) => {
    errors.push(`network request blocked: ${route.request().url()}. Copy the file into the project (lib/ or assets/) and load it by a relative path.`);
    return route.abort();
  });
  page.on('requestfailed', (r) => !/^(https?|wss?):/.test(r.url()) && errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  await page.addInitScript(seedRandom);
  await page.addInitScript(([d, start]) => {
    // Where this scene sits on the video timeline, for anything timed in video seconds (a narration caption track).
    window.__sceneStart = start;
    document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--scene-dur', `${d}s`));
  }, [scene.duration, scene.start ?? 0]);
  await page.goto(pathToFileURL(scene.file).href, { waitUntil: 'networkidle' });
  const failed = await page.evaluate(prepare);
  for (const f of failed) errors.push(`asset failed to load: ${f}`);
  const cdp = await ctx.newCDPSession(page);
  return {
    page,
    errors,
    seek: (ms) => page.evaluate(seekTo, ms),
    // JPEG is the fast draft path. PNG keeps exact RGB for the final encode.
    capture: async (format = 'png') => {
      const params = format === 'jpeg' ? { format, quality: 92, optimizeForSpeed: true } : { format, optimizeForSpeed: true };
      const { data } = await cdp.send('Page.captureScreenshot', params);
      return Buffer.from(data, 'base64');
    },
    close: () => ctx.close(),
  };
}

export function frameTimes(scene, fps) {
  return Array.from({ length: scene.frames }, (_, i) => (i * 1000) / fps);
}

const tinyAtom = window.tinyAtom;

const ACCEPTED_TYPES = /^image\//;
const ACCEPTED_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadPanel = document.getElementById('upload-panel');
const resultsSection = document.getElementById('results');
const originalImg = document.getElementById('original-img');
const gradesGrid = document.getElementById('grades-grid');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clear-btn');

/** @type {string} */
let currentBaseName = 'image';

/** @type {Map<string, string>} */
const gradeDataUrls = new Map();

const DECODE_ERROR =
  'Could not decode image. Use JPEG, PNG, GIF, or WebP — iPhone HEIC photos are not supported in the browser.';

/** @typedef {(r: number, g: number, b: number, a: number) => [number, number, number, number]} GradeFn */

/** @type {{ id: string, name: string, apply: GradeFn }[]} */
const GRADES = [
  {
    id: 'noir',
    name: 'Noir',
    apply: (r, g, b, a) => {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const contrast = clamp((lum - 128) * 1.35 + 128);
      return [contrast, contrast, contrast, a];
    },
  },
  {
    id: 'warm',
    name: 'Warm',
    apply: (r, g, b, a) => [clamp(r * 1.12 + 8), clamp(g * 1.04 + 4), clamp(b * 0.82), a],
  },
  {
    id: 'cool',
    name: 'Cool',
    apply: (r, g, b, a) => [clamp(r * 0.82), clamp(g * 0.96 + 4), clamp(b * 1.14 + 10), a],
  },
  {
    id: 'sepia',
    name: 'Sepia',
    apply: (r, g, b, a) => [
      clamp(0.393 * r + 0.769 * g + 0.189 * b),
      clamp(0.349 * r + 0.686 * g + 0.168 * b),
      clamp(0.272 * r + 0.534 * g + 0.131 * b),
      a,
    ],
  },
  {
    id: 'vivid',
    name: 'Vivid',
    apply: (r, g, b, a) => {
      const [h, s, l] = rgbToHsl(r, g, b);
      return [...hslToRgb(h, Math.min(1, s * 1.45 + 0.06), l), a];
    },
  },
  {
    id: 'muted',
    name: 'Muted',
    apply: (r, g, b, a) => {
      const [h, s, l] = rgbToHsl(r, g, b);
      return [...hslToRgb(h, s * 0.55, l * 0.96 + 12), a];
    },
  },
  {
    id: 'fade',
    name: 'Faded',
    apply: (r, g, b, a) => {
      const mix = (v) => clamp(v * 0.78 + 42);
      return [mix(r), mix(g), mix(b), a];
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    apply: (r, g, b, a) => {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 128) {
        return [clamp(r * 0.82), clamp(g * 1.02 + 6), clamp(b * 1.08 + 14), a];
      }
      return [clamp(r * 1.1 + 12), clamp(g * 1.02 + 4), clamp(b * 0.78), a];
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    apply: (r, g, b, a) => {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const glow = lum / 255;
      return [
        clamp(r * 1.08 + glow * 28),
        clamp(g * 0.92 + glow * 10),
        clamp(b * 0.72 + glow * 4),
        a,
      ];
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    apply: (r, g, b, a) => [clamp(r * 0.78), clamp(g * 1.12 + 8), clamp(b * 0.92 + 6), a],
  },
];

function clamp(value) {
  return Math.min(255, Math.max(0, value));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = clamp(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hue2rgb(p, q, h + 1 / 3) * 255),
    clamp(hue2rgb(p, q, h) * 255),
    clamp(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function baseNameFromFile(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function isImageFile(file) {
  if (file.type && ACCEPTED_TYPES.test(file.type)) return true;
  return ACCEPTED_EXT.test(file.name);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error(DECODE_ERROR));
  });
}

/**
 * @param {ImageData} source
 * @param {GradeFn} gradeFn
 */
function applyGrade(source, gradeFn) {
  const out = new Uint8ClampedArray(source.data);
  for (let i = 0; i < out.length; i += 4) {
    const [r, g, b, a] = gradeFn(out[i], out[i + 1], out[i + 2], out[i + 3]);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return new ImageData(out, source.width, source.height);
}

/**
 * @param {CanvasImageSource} source
 * @param {number} width
 * @param {number} height
 */
function captureImageData(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * @param {ImageData} imageData
 */
function imageDataToDataUrl(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * @param {CanvasImageSource} source
 * @param {number} width
 * @param {number} height
 */
function generateAllGrades(source, width, height) {
  const base = captureImageData(source, width, height);
  /** @type {{ id: string, name: string, dataUrl: string }[]} */
  const results = [];

  for (const grade of GRADES) {
    const graded = applyGrade(base, grade.apply);
    results.push({
      id: grade.id,
      name: grade.name,
      dataUrl: imageDataToDataUrl(graded),
    });
  }

  return results;
}

function downloadGrade(id, name) {
  const dataUrl = gradeDataUrls.get(id);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${currentBaseName}-${id}.png`;
  link.click();
}

function renderGrades(grades, fileName) {
  gradesGrid.replaceChildren();
  gradeDataUrls.clear();

  for (const grade of grades) {
    gradeDataUrls.set(grade.id, grade.dataUrl);

    const card = document.createElement('figure');
    card.className = 'grade-card';

    const img = document.createElement('img');
    img.className = 'grade-card__img';
    img.src = grade.dataUrl;
    img.alt = `${grade.name} grade of ${fileName}`;
    img.loading = 'lazy';

    const footer = document.createElement('figcaption');
    footer.className = 'grade-card__footer';

    const label = document.createElement('span');
    label.className = 'grade-card__name';
    label.textContent = grade.name;

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'btn btn--small';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => downloadGrade(grade.id, grade.name));

    footer.append(label, downloadBtn);
    card.append(img, footer);
    gradesGrid.append(card);
  }
}

function showError(message) {
  statusEl.textContent = message;
  statusEl.classList.add('status--error');
  statusEl.hidden = false;
}

function resetView() {
  gradeDataUrls.clear();
  gradesGrid.replaceChildren();
  originalImg.removeAttribute('src');
  originalImg.alt = '';
  fileInput.value = '';
  resultsSection.hidden = true;
  uploadPanel.hidden = false;
  clearBtn.hidden = true;
  statusEl.hidden = true;
  statusEl.classList.remove('status--error');
  statusEl.textContent = 'Generating grades…';
}

async function handleFile(file) {
  if (!file || !isImageFile(file)) {
    showError('Please choose a valid image file (JPEG, PNG, GIF, or WebP).');
    return;
  }

  uploadPanel.hidden = true;
  resultsSection.hidden = false;
  clearBtn.hidden = false;
  statusEl.hidden = false;
  statusEl.classList.remove('status--error');
  statusEl.textContent = 'Generating grades…';
  gradesGrid.replaceChildren();

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  currentBaseName = baseNameFromFile(file.name);

  try {
    const dataUrl = await readFileAsDataUrl(file);
    originalImg.src = dataUrl;
    originalImg.alt = `Original: ${file.name}`;
    await waitForImage(originalImg);

    const grades = generateAllGrades(
      originalImg,
      originalImg.naturalWidth,
      originalImg.naturalHeight
    );
    renderGrades(grades, file.name);
    statusEl.hidden = true;
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Grading failed.');
  }
}

function bindUpload() {
  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dropzone--active');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone--active');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  clearBtn?.addEventListener('click', resetView);
}

async function init() {
  const meta = await tinyAtom.metadata();
  document.getElementById('meta').textContent = `${meta.name} · v${meta.version}`;
  bindUpload();
}

init().catch((error) => console.error('atom init failed', error));

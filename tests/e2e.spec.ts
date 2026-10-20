import { expect, test, type Page } from '@playwright/test';
import type { Bridge, Job, Snapshot } from '../src/types';

interface MockControl {
  state: Snapshot;
  calls: { method: string; value: unknown }[];
  emit(update: Partial<Snapshot>): void;
  emitWheelMode(mode: string, newDrag?: boolean): void;
}

declare global { interface Window { __santaraTest: MockControl } }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const incoming: Snapshot['files'] = [
      { id: 'image', path: '/fixtures/pixel.png', name: 'pixel.png', ext: 'png', size: 120, category: 'image' },
      { id: 'audio', path: '/fixtures/tone.wav', name: 'tone.wav', ext: 'wav', size: 2048, category: 'audio' },
      { id: 'subtitle', path: '/fixtures/captions.srt', name: 'captions.srt', ext: 'srt', size: 64, category: 'subtitle' },
    ];
    const state: Snapshot = {
      platform: 'linux', files: [], jobs: [],
      settings: {
        theme: 'light', outputFolder: '', collision: 'rename', concurrency: 2,
        quality: 85, stripMetadata: false, recursive: false, preserveStructure: false,
        namingPattern: '{name}-converted', shortcuts: { convert: 'Shift', tools: 'Alt', actions: 'Control' },
        backendPaths: {}, tray: false,
      },
      backends: { imagemagick: { available: true }, ffmpeg: { available: true } },
      capabilities: [
        { id: 'image:convert', label: 'Convert image', category: 'image', inputs: ['png'], outputs: ['jpg', 'webp'], backend: 'imagemagick', available: true, batch: true, preservesMetadata: false },
        { id: 'audio:convert', label: 'Convert audio', category: 'audio', inputs: ['wav'], outputs: ['mp3'], backend: 'ffmpeg', available: true, batch: true, preservesMetadata: false },
        { id: 'subtitle:convert', label: 'Convert subtitles', category: 'subtitle', inputs: ['srt'], outputs: ['vtt'], backend: 'javascript', available: true, batch: true, preservesMetadata: false },
        { id: 'image:edit-image', operation: 'edit-image', label: 'Edit photo', category: 'image', inputs: ['png'], outputs: ['png', 'jpg'], backend: 'sharp', available: true, batch: true, preservesMetadata: true },
        { id: 'image:background', operation: 'background', label: 'Add background', category: 'image', inputs: ['png'], outputs: ['png', 'jpg'], backend: 'sharp', available: true, batch: true, preservesMetadata: true },
        { id: 'image:compress', operation: 'compress', label: 'Compress', category: 'image', inputs: ['png'], outputs: ['png'], backend: 'sharp', available: true, batch: true, preservesMetadata: true },
        { id: 'image:metadata', operation: 'metadata', label: 'Edit metadata', category: 'image', inputs: ['png'], outputs: ['png'], backend: 'sharp', available: true, batch: true, preservesMetadata: true },
        { id: 'audio:visualize', operation: 'visualize', label: 'Audio wave visualizer', category: 'audio', inputs: ['wav'], outputs: ['mp4'], backend: 'ffmpeg', available: true, batch: true, preservesMetadata: true },
        { id: 'archive:create', operation: 'create-archive', label: 'Create archive', category: 'archive', inputs: ['*'], outputs: ['zip'], backend: 'javascript', available: true, batch: false, preservesMetadata: false },
        { id: 'pdf:render', operation: 'render', label: 'Render PDF pages', category: 'pdf', inputs: ['pdf'], outputs: ['png', 'jpg'], backend: 'poppler', available: true, batch: true, preservesMetadata: false, options: { page: { min: 1, max: 100000 }, dpi: { min: 36, max: 600, default: 300 } } },
        { id: 'office:convert', label: 'Unavailable office conversion', category: 'document', inputs: ['png'], outputs: ['pdf'], backend: 'libreoffice', available: false, batch: true, preservesMetadata: false },
      ],
    };
    const listeners = new Set<(update: Partial<Snapshot>) => void>();
    const wheelModeListeners = new Set<(mode: string, newDrag?: boolean) => void>();
    const calls: MockControl['calls'] = [];
    const emit = (update: Partial<Snapshot>) => {
      Object.assign(state, structuredClone(update));
      for (const listener of listeners) listener(structuredClone(update));
    };
    const record = (method: string, value: unknown) => calls.push({ method, value: structuredClone(value) });
    const api: Bridge = {
      bootstrap: async () => structuredClone(state),
      addFiles: async () => { record('addFiles', null); return structuredClone(incoming); },
      addFolder: async () => [], inspectPaths: async () => [],
      droppedFiles: async files => { record('droppedFiles', files.map(file => file.name)); return structuredClone(incoming); },
      enqueue: async request => {
        record('enqueue', request);
        const jobs: Job[] = request.files.map(file => ({ id: `job-${file.id}`, input: file.path, name: file.name, operation: request.operation, format: request.format, status: 'queued', progress: 0, createdAt: '2026-10-19T00:00:00Z' }));
        emit({ jobs });
        return jobs;
      },
      cancel: async id => { record('cancel', id); emit({ jobs: state.jobs.map(job => job.id === id ? { ...job, status: 'cancelled' } : job) }); },
      retry: async id => { record('retry', id); emit({ jobs: state.jobs.map(job => job.id === id ? { ...job, status: 'processing', error: undefined, progress: 10 } : job) }); },
      saveSettings: async patch => { record('saveSettings', patch); emit({ settings: { ...state.settings, ...patch } }); return structuredClone(state.settings); },
      pickOutput: async () => null, reveal: async () => undefined,
      openOutput: async () => undefined, fileAction: async () => undefined,
      finishGlobalWheel: async destination => { record('finishGlobalWheel', destination); },
      selectGlobalOperation: async request => { record('selectGlobalOperation', request); },
      preview: async filename => {
        record('preview', filename);
        const waveform = Array.from({ length: 160 }, (_, index) => Math.abs(Math.sin(index * 0.27)) * (0.2 + Math.abs(Math.sin(index * 0.08)) * 0.6));
        if (filename.endsWith('.wav')) {
          const bytes = new Uint8Array(44 + 32000 * 2), view = new DataView(bytes.buffer);
          const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
          text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 64000, true);
          for (let index = 0; index < 32000; index++) view.setInt16(44 + index * 2, Math.round(Math.sin(index * 440 * Math.PI * 2 / 8000) * 10000), true);
          return { url: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })), duration: 4, waveform };
        }
        const artwork = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e8e1c8"/><circle cx="520" cy="170" r="90" fill="#f29659"/><path d="M0 600L280 220L540 600Z" fill="#7d9271"/><path d="M220 600L610 300L800 600Z" fill="#465c43"/></svg>';
        return { url: `data:image/svg+xml,${encodeURIComponent(artwork)}`, width: 800, height: 600, duration: 4, waveform };
      },
      imagePreview: async () => ({ url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ee8844"/></svg>')}`, width: 800, height: 600, sourceWidth: 800, sourceHeight: 600 }),
      onWheelMode: callback => { wheelModeListeners.add(callback); return () => { wheelModeListeners.delete(callback); }; },
      onUpdate: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    };
    window.__santaraTest = { state, calls, emit, emitWheelMode: (mode, newDrag) => { for (const listener of wheelModeListeners) listener(mode, newDrag); } };
    Object.defineProperty(window, 'santara', { configurable: true, value: api });
  });
});

async function addFiles(page: Page) {
  await page.getByRole('button', { name: /add files/i }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Select pixel.png' })).toBeChecked();
}

test('empty workspace renders without exceptions', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good things come in new formats.' })).toBeVisible();
  await expect(page.getByText('Drop files or folders here to get started')).toBeVisible();
  await expect(page.locator('.file-row')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('empty-workspace.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('navigation and settings theme use the bridge', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your flow. Your way.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.__santaraTest.state.settings.theme)).toBe('dark');
  await page.screenshot({ path: testInfo.outputPath('settings-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shortcuts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Local engines', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local engines', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Converter', exact: true }).click();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Nothing in the works. Yet.')).toBeVisible();
});

test('add files populates rows and mixed selections respect per-file routes', async ({ page }, testInfo) => {
  await page.goto('/');
  await addFiles(page);
  await expect(page.locator('.file-row')).toHaveCount(3);
  await expect(page.getByText(/Some operations may apply to only part/)).toBeVisible();
  await page.getByRole('button', { name: 'Choose an operation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose what happens next' });
  await expect(dialog.getByRole('button', { name: 'Convert image · JPG' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Convert audio · MP3' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Unavailable office/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('mixed-file-picker.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^pixel\.png/ }).click();
  await expect(dialog.getByRole('button', { name: 'Convert image · WEBP' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Convert audio · MP3' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^tone\.wav/ }).click();
  await expect(dialog.getByRole('button', { name: 'Convert audio · MP3' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Convert image · JPG' })).toHaveCount(0);
});

test('Shift drag and drop opens compatible operations after the mocked file boundary', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good things come in new formats.' })).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['Santara original synthetic fixture'], 'pixel.png', { type: 'image/png' }));
    return dataTransfer;
  });
  try {
    const app = page.locator('.app');
    await app.dispatchEvent('dragenter', { dataTransfer: transfer });
    await app.dispatchEvent('dragover', { dataTransfer: transfer, shiftKey: true });
    await expect(page.getByRole('menu', { name: 'Convert', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__santaraTest.calls.filter(call => call.method === 'droppedFiles'))).toEqual([]);
    await expect(page.locator('.file-row')).toHaveCount(0);
    await app.dispatchEvent('drop', { dataTransfer: transfer, shiftKey: true });
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
    await expect(page.locator('.file-row')).toHaveCount(3);
    const dialog = page.getByRole('dialog', { name: 'Choose what happens next' });
    await expect(dialog.getByRole('tab', { name: /Convert/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('button', { name: 'Convert image · JPG' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Convert audio · MP3' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Convert subtitles · VTT' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Unavailable office/ })).toHaveCount(0);
    expect(await page.evaluate(() => window.__santaraTest.calls.filter(call => call.method === 'droppedFiles'))).toEqual([{ method: 'droppedFiles', value: ['pixel.png'] }]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^pixel\.png/ }).click();
    await expect(dialog.getByRole('button', { name: 'Convert image · WEBP' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Convert audio · MP3' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Convert subtitles · VTT' })).toHaveCount(0);
  } finally {
    await transfer.dispose();
  }
});

test('citrus wheel persists after modifier release and dropping a slice queues its format', async ({ page }, testInfo) => {
  await page.goto('/');
  const transfer = await page.evaluateHandle(() => {
    const value = new DataTransfer();
    value.items.add(new File(['Synthetic JPEG fixture; inspection boundary mocked'], 'photo.jpg', { type: 'image/png' }));
    return value;
  });
  try {
    const app = page.locator('.app');
    await app.dispatchEvent('dragenter', { dataTransfer: transfer, clientX: 700, clientY: 400 });
    await app.dispatchEvent('dragover', { dataTransfer: transfer, clientX: 700, clientY: 400, shiftKey: true });
    await app.dispatchEvent('dragover', { dataTransfer: transfer, clientX: 710, clientY: 420, shiftKey: false });
    const wheel = page.getByRole('menu', { name: 'Convert', exact: true });
    await expect(wheel).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('citrus-wheel.png') });
    const jpg = wheel.getByRole('menuitem', { name: /^JPG/ });
    await jpg.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(jpg).toHaveClass(/chosen/);
    await jpg.dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => window.__santaraTest.calls.find(call => call.method === 'enqueue')?.value)).toMatchObject({ operation: 'convert', format: 'jpg' });
  } finally { await transfer.dispose(); }
});

test('global citrus overlay accepts and queues a drop directly on a wheel slice', async ({ page }) => {
  await page.goto('/?santara-wheel=1&mode=convert');
  const transfer = await page.evaluateHandle(() => {
    const value = new DataTransfer();
    value.items.add(new File(['synthetic image fixture'], 'pixel.png', { type: 'image/png' }));
    return value;
  });
  try {
    const shell = page.locator('.global-wheel-shell');
    await shell.dispatchEvent('dragenter', { dataTransfer: transfer });
    const slice = page.locator('.citrus-segments [data-wheel-item="image:convert|jpg"]');
    const accepted = await slice.evaluate((element, dataTransfer) => {
      const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, transfer);
    expect(accepted).toBe(true);
    await expect(slice).toHaveClass(/chosen/);
    await slice.dispatchEvent('drop', { dataTransfer: transfer });
    await expect.poll(() => page.evaluate(() => window.__santaraTest.calls.find(call => call.method === 'enqueue')?.value)).toMatchObject({ operation: 'convert', format: 'jpg' });
    expect(await page.evaluate(() => window.__santaraTest.calls.find(call => call.method === 'finishGlobalWheel')?.value)).toBe('background');
    await page.evaluate(() => window.__santaraTest.emitWheelMode('convert', true));
    const nextTransfer = await page.evaluateHandle(() => {
      const value = new DataTransfer();
      value.items.add(new File(['synthetic audio fixture'], 'tone.wav', { type: 'audio/wav' }));
      return value;
    });
    try {
      await shell.dispatchEvent('dragenter', { dataTransfer: nextTransfer });
      await expect(page.getByRole('menuitem', { name: /^MP3/ })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /^JPG/ })).toHaveCount(0);
    } finally { await nextTransfer.dispose(); }
  } finally { await transfer.dispose(); }
});

test('global image tools wheel shows image tools and hides generic archive creation', async ({ page }) => {
  await page.goto('/?santara-wheel=1&mode=tools');
  const transfer = await page.evaluateHandle(() => {
    const value = new DataTransfer();
    value.items.add(new File(['synthetic image fixture'], 'pixel.png', { type: 'image/png' }));
    return value;
  });
  try {
    const shell = page.locator('.global-wheel-shell');
    await shell.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(page.getByRole('menuitem', { name: /^Edit photo/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Add background/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Create archive/ })).toHaveCount(0);
    await expect(shell.locator('.citrus-core .santara-mark')).toBeVisible();
    await expect(shell.locator('.citrus-core')).toHaveText('');
    await expect(shell.getByText('Drop on a slice')).toHaveCount(0);
    await expect(shell.locator('.wheel-description')).toHaveCount(0);
  } finally { await transfer.dispose(); }
});

test('global wheel shows provisional image routes without extra helper captions', async ({ page }) => {
  await page.goto('/?santara-wheel=1&mode=tools');
  await expect(page.getByRole('menuitem', { name: /^Edit photo/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Add background/ })).toBeVisible();
  await expect(page.locator('.wheel-description')).toHaveCount(0);
  await expect(page.getByText('Drop on a slice')).toHaveCount(0);
});

test('keyboard wheel switches groups and highlights partial selection coverage', async ({ page }) => {
  await page.goto('/');
  await addFiles(page);
  await page.getByRole('button', { name: 'Choose an operation' }).click();
  await page.keyboard.press('Alt');
  await expect(page.getByRole('tab', { name: /^Tools/ })).toHaveAttribute('aria-selected', 'true');
  const edit = page.getByRole('menuitem', { name: /^Edit photo/ });
  await expect(edit).toHaveAttribute('aria-label', /1 of 3 files/);
  await edit.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: /^Add background/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('image editor exposes a real padded background canvas and directional zoom navigation', async ({ page }) => {
  await page.goto('/');
  await addFiles(page);
  await page.getByRole('button', { name: 'Choose an operation' }).click();
  await page.keyboard.press('Alt');
  await page.getByRole('menuitem', { name: /^Add background/ }).click();
  const backgroundEditor = page.getByRole('dialog', { name: 'Add background' });
  await expect(backgroundEditor.getByLabel('Canvas width')).toHaveValue('864');
  await expect(backgroundEditor.getByLabel('Canvas height')).toHaveValue('664');
  await expect(backgroundEditor.getByLabel('Padding')).toHaveValue('32');
  const color = backgroundEditor.getByRole('button', { name: 'Choose #ef8354 background' });
  await color.click();
  await expect(color).toHaveAttribute('aria-pressed', 'true');
  await expect(backgroundEditor.locator('.image-tool-preview-wrap')).toHaveCSS('background-color', 'rgb(239, 131, 84)');
  await backgroundEditor.getByRole('button', { name: 'Close editor' }).click();

  await page.getByRole('button', { name: 'Choose an operation' }).click();
  await page.keyboard.press('Alt');
  await page.getByRole('menuitem', { name: /^Edit photo/ }).click();
  const photoEditor = page.getByRole('dialog', { name: 'Edit photo' });
  await photoEditor.getByRole('button', { name: 'Zoom in' }).click();
  await photoEditor.getByRole('button', { name: 'Move image left' }).click();
  await expect(photoEditor.locator('.image-tool-preview')).toHaveAttribute('style', /--image-pan-x: -48px/);
  await expect(photoEditor.getByRole('button', { name: 'Move image up' })).toBeEnabled();
});

test('PDF workspace labels the source preview and exports the selected page settings', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good things come in new formats.' })).toBeVisible();
  await page.evaluate(() => window.__santaraTest.emit({ files: [{ id: 'pdf', path: '/fixtures/original.pdf', name: 'original.pdf', size: 100, ext: 'pdf', category: 'pdf' }] }));
  await page.getByRole('button', { name: /^original\.pdf/ }).click();
  await page.getByRole('button', { name: 'Render PDF pages · PNG' }).click();
  const workspace = page.getByRole('dialog', { name: 'Render a page' });
  await expect(workspace.getByRole('heading', { name: 'First page preview' })).toBeVisible();
  await expect(workspace.getByRole('img')).toBeVisible();
  await workspace.getByLabel('Page to render', { exact: true }).fill('2');
  await workspace.getByLabel('Resolution (DPI)', { exact: true }).fill('144');
  await page.screenshot({ path: testInfo.outputPath('pdf-workspace.png') });
  await workspace.getByRole('button', { name: 'Render page', exact: true }).click();
  expect(await page.evaluate(() => window.__santaraTest.calls.find(call => call.method === 'enqueue')?.value)).toMatchObject({ operation: 'render', format: 'png', options: { page: '2', dpi: '144' } });
  await expect(workspace).toHaveCount(0);
});

test('keyboard picker supports arrows, Escape, and Ctrl K search', async ({ page }) => {
  await page.goto('/');
  await addFiles(page);
  await page.getByRole('button', { name: 'Choose an operation' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  const first = dialog.getByRole('button', { name: 'Convert image · JPG' });
  const second = dialog.getByRole('button', { name: 'Convert image · WEBP' });
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Find a format or tool…' });
  await expect(search).toBeFocused();
  await search.fill('subtitle');
  await expect(page.locator('.family-card')).toHaveCount(1);
});

test('submission, cancellation, failure, and retry follow mock events', async ({ page }) => {
  await page.goto('/');
  await addFiles(page);
  await page.getByRole('button', { name: /^captions\.srt/ }).click();
  await page.getByRole('button', { name: 'Convert subtitles · VTT' }).click();
  await page.getByRole('button', { name: 'Run operation' }).click();
  await expect(page.locator('.job-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.__santaraTest.calls.find(call => call.method === 'enqueue')?.value)).toMatchObject({ operation: 'convert', format: 'vtt', files: [{ id: 'subtitle' }], options: { quality: 85, collision: 'rename' } });
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.job-status')).toHaveText('cancelled');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.evaluate(() => window.__santaraTest.emit({ jobs: window.__santaraTest.state.jobs.map(job => ({ ...job, status: 'failed', error: 'Synthetic processor failure' })) }));
  await expect(page.getByRole('alert')).toHaveText('Synthetic processor failure');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
  await page.evaluate(() => window.__santaraTest.emit({ jobs: window.__santaraTest.state.jobs.map(job => ({ ...job, status: 'completed', progress: 100, output: '/fixtures/captions.vtt' })) }));
  await expect(page.getByRole('button', { name: 'Open converted file' })).toBeVisible();
  expect(await page.evaluate(() => window.__santaraTest.calls.filter(call => ['cancel', 'retry'].includes(call.method)))).toEqual([{ method: 'cancel', value: 'job-subtitle' }, { method: 'retry', value: 'job-subtitle' }]);
});

test('preview navigation makes no external network requests', async ({ page, baseURL }) => {
  await page.addInitScript(() => { delete window.santara; });
  const external: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) { external.push(url.href); await route.abort(); }
    else await route.continue();
  });
  page.on('websocket', socket => external.push(socket.url()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Format library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A world of possibilities.' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import type { Bridge, Job, Snapshot } from '../src/types';

interface MockControl {
  state: Snapshot;
  calls: { method: string; value: unknown }[];
  emit(update: Partial<Snapshot>): void;
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
        { id: 'office:convert', label: 'Unavailable office conversion', category: 'document', inputs: ['png'], outputs: ['pdf'], backend: 'libreoffice', available: false, batch: true, preservesMetadata: false },
      ],
    };
    const listeners = new Set<(update: Partial<Snapshot>) => void>();
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
      onUpdate: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    };
    window.__santaraTest = { state, calls, emit };
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
    await expect(page.getByRole('heading', { name: 'A new format awaits.' })).toBeVisible();
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

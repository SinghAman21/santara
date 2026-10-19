import { writeFile } from 'node:fs/promises';
import { detectBackends, getCapabilities } from '../electron/registry.mjs';

const backends = await detectBackends();
const capabilities = getCapabilities(backends);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  scope: 'Local detection snapshot; availability is not proof of tested input/output fidelity.',
  backends: Object.fromEntries(Object.entries(backends).map(([id, backend]) => [id, {
    available: backend.available,
    version: backend.version || null,
    error: backend.error || null,
  }])),
  capabilities,
  routes: capabilities.flatMap(capability => capability.inputs.flatMap(input => capability.outputs.map(output => ({
    capabilityId: capability.id,
    input,
    output,
    backend: capability.backend,
    available: capability.available,
    warning: capability.warning || null,
  })))),
};
const destination = new URL('../docs/capabilities.generated.json', import.meta.url);
await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Exported ${capabilities.length} capability records and ${manifest.routes.length} declared routes to ${destination.pathname}`);

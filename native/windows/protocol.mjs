const eventTypes = new Set(['show', 'move', 'hide']);
const modes = new Set(['convert', 'tools', 'actions']);

export function parseProtocolLine(line) {
  const value = JSON.parse(line);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Watcher event must be a JSON object');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'mode,type,x,y') {
    throw new TypeError('Watcher event must contain exactly type, mode, x, and y');
  }
  if (!eventTypes.has(value.type)) throw new TypeError('Unknown watcher event type');
  if (!modes.has(value.mode)) throw new TypeError('Unknown watcher mode');
  if (!Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) {
    throw new TypeError('Watcher coordinates must be safe integers');
  }
  return value;
}

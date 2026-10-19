const stamp = value => {
  const match = String(value).trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match || +match[2] > 59 || +match[3] > 59) throw new Error('Invalid subtitle timestamp');
  const result = ((+(match[1] || 0) * 60 + +match[2]) * 60 + +match[3]) * 1000 + +match[4];
  if (!Number.isSafeInteger(result)) throw new Error('Subtitle timestamp exceeds safe range');
  return result;
};

export function parseSubtitles(source, format = 'srt') {
  format = format.toLowerCase();
  if (!['srt', 'vtt'].includes(format.toLowerCase())) throw new Error('Unsupported subtitle format');
  let text = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (format === 'vtt') {
    if (!/^WEBVTT(?:\s|$)/.test(text)) throw new Error('Missing WEBVTT header');
    text = text.replace(/^WEBVTT[^\n]*(?:\n|$)/, '').trim();
  }
  if (!text) return [];
  return text.split(/\n[ \t]*\n/).flatMap(block => {
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block) && format === 'vtt') return [];
    const lines = block.split('\n');
    const index = lines.findIndex(line => line.includes('-->'));
    if (index < 0 || index > 1) throw new Error('Invalid subtitle cue');
    const match = lines[index].match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    if (!match) throw new Error('Invalid subtitle timing');
    const start = stamp(match[1]);
    const end = stamp(match[2]);
    if (end < start) throw new Error('Subtitle ends before it starts');
    return [{ start, end, text: lines.slice(index + 1).join('\n') }];
  });
}

export function serializeSubtitles(cues, format = 'srt') {
  if (format === 'txt') return cues.map(cue => String(cue.text).replace(/<[^>]*>/g, '')).join('\n\n') + '\n';
  if (!['srt', 'vtt'].includes(format)) throw new Error('Unsupported subtitle format');
  const time = value => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid subtitle time');
    const hours = Math.floor(value / 3600000);
    const minutes = Math.floor(value / 60000) % 60;
    const seconds = Math.floor(value / 1000) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${format === 'srt' ? ',' : '.'}${String(value % 1000).padStart(3, '0')}`;
  };
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((cue, index) => {
    if (cue.end < cue.start) throw new Error('Subtitle ends before it starts');
    return `${format === 'srt' ? `${index + 1}\n` : ''}${time(cue.start)} --> ${time(cue.end)}\n${cue.text}`;
  }).join('\n\n') + '\n';
}

export function convertSubtitles(source, from, to) {
  return serializeSubtitles(parseSubtitles(source, from), to);
}

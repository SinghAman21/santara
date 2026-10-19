import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, serializeSubtitles, convertSubtitles } from '../electron/subtitles.mjs';

test('SRT and VTT retain timing, multiline text and Unicode', () => {
  const source = '\uFEFF1\r\n00:00:01,250 --> 00:00:03,000\r\nHello\r\n世界\r\n';
  const vtt = convertSubtitles(source, 'srt', 'vtt');
  assert.match(vtt, /^WEBVTT/);
  assert.deepEqual(parseSubtitles(vtt, 'vtt'), [{ start: 1250, end: 3000, text: 'Hello\n世界' }]);
  assert.match(convertSubtitles(vtt, 'vtt', 'srt'), /00:00:01,250/);
});
test('VTT identifiers, notes and cue settings', () => {
  const cues = parseSubtitles('WEBVTT\n\nNOTE test\nignore\n\nid\n00:01.000 --> 00:02.000 align:start\nHello', 'vtt');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].start, 1000);
});
test('reject invalid or reversed timing and unsupported formats', () => {
  assert.throws(() => parseSubtitles('1\n00:00:70,000 --> 00:00:71,000\nx'));
  assert.throws(() => parseSubtitles('1\n00:00:02,000 --> 00:00:01,000\nx'));
  assert.throws(() => serializeSubtitles([{ start: -1, end: 1, text: 'x' }]));
  assert.throws(() => convertSubtitles('', 'ass', 'srt'));
});

test('TXT output contains cue text without numbering, timing or markup', () => {
  assert.equal(convertSubtitles('1\n00:00:00,000 --> 00:00:01,000\n<i>Hello</i>\n世界\n', 'srt', 'txt'), 'Hello\n世界\n');
  assert.throws(() => parseSubtitles('plain text', 'txt'), /Unsupported/);
});

use std::{io::Read, path::{Path, PathBuf}, process::{Command, Stdio}, thread, time::{Duration, Instant}};

use serde_json::{json, Value};

#[derive(Clone, Default)]
pub struct MediaBackend {
    ffmpeg: Option<PathBuf>,
    ffprobe: Option<PathBuf>,
    encoders: String,
    muxers: String,
    demuxers: String,
    filters: String,
}

const VIDEO_INPUTS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "wmv"];
const AUDIO_INPUTS: &[&str] = &["mp3", "wav", "flac", "ogg", "opus", "m4a", "aiff", "wma"];
const VIDEO_OUTPUTS: &[(&str, &str, &str)] = &[
    ("mp4", "libx264", "mp4"), ("mkv", "libx264", "matroska"), ("webm", "libvpx-vp9", "webm"),
    ("mov", "libx264", "mov"), ("avi", "mpeg4", "avi"), ("wmv", "wmv2", "asf")
];
const AUDIO_OUTPUTS: &[(&str, &str, &str)] = &[
    ("mp3", "libmp3lame", "mp3"), ("wav", "pcm_s16le", "wav"), ("flac", "flac", "flac"),
    ("ogg", "libvorbis", "ogg"), ("opus", "libopus", "ogg"), ("m4a", "aac", "ipod"),
    ("aiff", "pcm_s16be", "aiff"), ("wma", "wmav2", "asf")
];

fn has(text: &str, token: &str) -> bool { text.split(|part: char| part.is_whitespace() || part == ',').any(|part| part == token) }

pub(crate) fn captured(mut command: Command, timeout: Duration, cancelled: impl Fn() -> bool) -> Result<String, String> {
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|_| "Local media backend could not start".to_string())?;
    let stdout = child.stdout.take().ok_or("Media output unavailable")?;
    let stderr = child.stderr.take().ok_or("Media diagnostics unavailable")?;
    let reader = |mut stream: Box<dyn Read + Send>| thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 8192];
        loop {
            let Ok(count) = stream.read(&mut buffer) else { break };
            if count == 0 { break }
            if output.len() < 4_000_000 { output.extend_from_slice(&buffer[..count.min(4_000_000 - output.len())]); }
        }
        output
    });
    let out = reader(Box::new(stdout));
    let err = reader(Box::new(stderr));
    let start = Instant::now();
    let status = loop {
        if cancelled() || start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = out.join();
            let _ = err.join();
            return Err(if cancelled() { "Cancelled" } else { "Local media backend timed out" }.into());
        }
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => break status,
            None => thread::sleep(Duration::from_millis(25)),
        }
    };
    let stdout = out.join().map_err(|_| "Media output reader failed")?;
    let stderr = err.join().map_err(|_| "Media diagnostic reader failed")?;
    let output = format!("{}\n{}", String::from_utf8_lossy(&stdout), String::from_utf8_lossy(&stderr));
    if !status.success() { return Err(output.chars().take(2000).collect()); }
    Ok(output)
}

fn probe(path: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(path);
    command.args(args);
    captured(command, Duration::from_secs(5), || false).ok()
}

pub fn detect(overrides: &std::collections::HashMap<String, String>) -> MediaBackend {
    let ffmpeg = overrides.get("ffmpeg").filter(|value| !value.is_empty()).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("ffmpeg"));
    let ffprobe = overrides.get("ffprobe").filter(|value| !value.is_empty()).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("ffprobe"));
    if !probe(&ffmpeg, &["-version"]).is_some_and(|output| output.contains("ffmpeg version")) { return MediaBackend::default(); }
    if !probe(&ffprobe, &["-version"]).is_some_and(|output| output.contains("ffprobe version")) { return MediaBackend::default(); }
    MediaBackend {
        ffmpeg: Some(ffmpeg), ffprobe: Some(ffprobe),
        encoders: probe(Path::new(overrides.get("ffmpeg").filter(|value| !value.is_empty()).map(String::as_str).unwrap_or("ffmpeg")), &["-hide_banner", "-encoders"]).unwrap_or_default(),
        muxers: probe(Path::new(overrides.get("ffmpeg").filter(|value| !value.is_empty()).map(String::as_str).unwrap_or("ffmpeg")), &["-hide_banner", "-muxers"]).unwrap_or_default(),
        demuxers: probe(Path::new(overrides.get("ffmpeg").filter(|value| !value.is_empty()).map(String::as_str).unwrap_or("ffmpeg")), &["-hide_banner", "-demuxers"]).unwrap_or_default(),
        filters: probe(Path::new(overrides.get("ffmpeg").filter(|value| !value.is_empty()).map(String::as_str).unwrap_or("ffmpeg")), &["-hide_banner", "-filters"]).unwrap_or_default(),
    }
}

impl MediaBackend {
    pub fn available(&self) -> bool { self.ffmpeg.is_some() && self.ffprobe.is_some() }

    pub fn info(&self) -> Value { json!({ "available": self.available(), "path": self.ffmpeg.as_ref().map(|path| path.to_string_lossy().to_string()) }) }

    pub fn supports(&self, category: &str, operation: &str, input: &str, output: &str) -> bool {
        if !self.available() { return false }
        let inputs = if category == "video" { VIDEO_INPUTS } else if category == "audio" { AUDIO_INPUTS } else { return false };
        if !inputs.contains(&input) || !has(&self.demuxers, demuxer(input)) { return false }
        let output_spec = if operation == "snapshot" && category == "video" && output == "png" { Some(("png", "image2pipe")) }
            else if operation == "extract-audio" && category == "video" { AUDIO_OUTPUTS.iter().find(|entry| entry.0 == output).map(|entry| (entry.1, entry.2)) }
            else if category == "video" { VIDEO_OUTPUTS.iter().find(|entry| entry.0 == output).map(|entry| (entry.1, entry.2)) }
            else { AUDIO_OUTPUTS.iter().find(|entry| entry.0 == output).map(|entry| (entry.1, entry.2)) };
        let Some((encoder, muxer)) = output_spec else { return false };
        if !has(&self.encoders, encoder) || !has(&self.muxers, muxer) { return false }
        if category == "video" && !["snapshot", "extract-audio", "mute"].contains(&operation) {
            let audio_encoder = video_audio_encoder(output);
            if !has(&self.encoders, audio_encoder) { return false }
        }
        let filters = match operation {
            "convert" | "compress" | "trim" | "strip-metadata" | "extract-audio" | "mute" | "snapshot" => &[][..],
            "resize" => &["scale"][..], "crop" => &["crop"][..],
            "flip" => &["hflip", "vflip"][..], "rotate" => &["hflip", "vflip", "transpose"][..],
            "speed" => &["setpts", "atempo"][..],
            "normalize" => &["loudnorm", "aresample"][..], "channels" => &["aresample"][..],
            _ => return false,
        };
        filters.iter().all(|filter| has(&self.filters, filter))
    }

    pub fn capabilities(&self) -> Vec<Value> {
        let mut result = Vec::new();
        for category in ["video", "audio"] {
            let inputs = if category == "video" { VIDEO_INPUTS } else { AUDIO_INPUTS };
            let mut operations = vec!["convert", "compress", "trim", "strip-metadata"];
            if category == "video" { operations.extend(["resize", "crop", "rotate", "flip", "mute", "speed", "snapshot", "extract-audio"]); }
            else { operations.extend(["normalize", "channels"]); }
            for operation in operations {
                let outputs = if operation == "snapshot" { vec!["png"] }
                    else if operation == "extract-audio" || category == "audio" { AUDIO_OUTPUTS.iter().map(|entry| entry.0).collect() }
                    else { VIDEO_OUTPUTS.iter().map(|entry| entry.0).collect() };
                let available_inputs = inputs.iter().filter(|input| outputs.iter().any(|output| self.supports(category, operation, input, output))).copied().collect::<Vec<_>>();
                let available_outputs = outputs.iter().filter(|output| available_inputs.iter().any(|input| self.supports(category, operation, input, output))).copied().collect::<Vec<_>>();
                result.push(json!({ "id": format!("{category}:{operation}"), "operation": operation,
                    "label": format!("{} {category}", operation.replace('-', " ")), "category": category,
                    "inputs": available_inputs, "outputs": available_outputs, "backend": "ffmpeg",
                    "available": !available_outputs.is_empty(), "batch": true, "preservesMetadata": operation != "strip-metadata" && operation != "snapshot",
                    "options": {}, "warning": "Uses the first media streams. Codec and container metadata support varies; compression can increase size." }));
            }
        }
        result
    }

    pub fn run(&self, input: &Path, output: &Path, category: &str, operation: &str, format: &str, options: &Value, cancelled: impl Fn() -> bool) -> Result<(), String> {
        let extension = input.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
        if !self.supports(category, operation, &extension, format) { return Err("Media route is unavailable".into()); }
        let ffprobe = self.ffprobe.as_ref().ok_or("FFprobe is unavailable")?;
        let mut inspect = Command::new(ffprobe);
        inspect.args(["-v", "error", "-show_entries", "format=format_name", "-of", "default=noprint_wrappers=1:nokey=1", "-i"]).arg(input);
        let probe_output = captured(inspect, Duration::from_secs(10), &cancelled).map_err(safe_media_error)?;
        if !probe_output.split([',', '\n']).any(|part| part.trim() == demuxer(&extension)) {
            return Err("Media signature does not match its supported container".into());
        }
        let ffmpeg = self.ffmpeg.as_ref().ok_or("FFmpeg is unavailable")?;
        let mut command = Command::new(ffmpeg);
        command.args(["-hide_banner", "-nostdin", "-v", "error", "-n", "-protocol_whitelist", "file", "-f", demuxer(&extension), "-i"]).arg(input);
        let numeric = |key: &str, default: f64, min: f64, max: f64| -> Result<f64, String> {
            let value = match options.get(key) {
                None => default, Some(Value::Number(number)) => number.as_f64().ok_or_else(|| format!("Invalid {key}"))?,
                Some(Value::String(value)) => value.parse::<f64>().map_err(|_| format!("Invalid {key}"))?,
                _ => return Err(format!("Invalid {key}")),
            };
            if !value.is_finite() || value < min || value > max { return Err(format!("Invalid {key}")); }
            Ok(value)
        };
        if operation == "trim" {
            command.args(["-ss", &numeric("start", 0.0, 0.0, 604_800.0)?.to_string(), "-t", &numeric("duration", 10.0, 0.01, 604_800.0)?.to_string()]);
        }
        if operation == "snapshot" {
            command.args(["-map", "0:v:0", "-frames:v", "1", "-an", "-sn", "-dn", "-c:v", "png"]);
        } else if category == "audio" || operation == "extract-audio" {
            let encoder = AUDIO_OUTPUTS.iter().find(|entry| entry.0 == format).ok_or("Invalid audio format")?.1;
            command.args(["-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", encoder]);
            if operation == "normalize" {
                let loudness = numeric("loudness", -16.0, -70.0, -5.0)?;
                let peak = numeric("truePeak", -1.5, -9.0, 0.0)?;
                let range = numeric("loudnessRange", 11.0, 1.0, 50.0)?;
                command.args(["-af", &format!("loudnorm=I={loudness}:TP={peak}:LRA={range},aresample=48000")]);
            } else if operation == "channels" {
                let channels = numeric("channels", 1.0, 1.0, 2.0)?;
                if channels.fract() != 0.0 { return Err("Invalid channel count".into()); }
                command.args(["-ac", &channels.to_string()]);
            }
        } else {
            let encoder = VIDEO_OUTPUTS.iter().find(|entry| entry.0 == format).ok_or("Invalid video format")?.1;
            command.args(["-map", "0:v:0", "-c:v", encoder, "-sn", "-dn"]);
            if operation == "mute" { command.arg("-an"); }
            else { command.args(["-map", "0:a:0?", "-c:a", video_audio_encoder(format)]); }
            let filter = match operation {
                "resize" => Some(format!("scale={}:{}", numeric("width", 1280.0, 2.0, 16_384.0)? as u32, numeric("height", 720.0, 2.0, 16_384.0)? as u32)),
                "crop" => Some(format!("crop={}:{}:{}:{}", numeric("width", 1280.0, 2.0, 16_384.0)? as u32, numeric("height", 720.0, 2.0, 16_384.0)? as u32, numeric("x", 0.0, 0.0, 16_384.0)? as u32, numeric("y", 0.0, 0.0, 16_384.0)? as u32)),
                "rotate" => Some(match numeric("angle", 90.0, 90.0, 270.0)? as u32 { 90 => "transpose=1".into(), 180 => "hflip,vflip".into(), 270 => "transpose=2".into(), _ => return Err("Invalid rotation angle".into()) }),
                "flip" => Some(match options.get("direction").and_then(Value::as_str).unwrap_or("horizontal") { "horizontal" => "hflip".into(), "vertical" => "vflip".into(), _ => return Err("Invalid flip direction".into()) }),
                "speed" => {
                    let factor = numeric("factor", 1.0, 0.25, 4.0)?;
                    let audio = if factor < 0.5 { format!("atempo=0.5,atempo={}", factor / 0.5) }
                        else if factor > 2.0 { format!("atempo=2,atempo={}", factor / 2.0) }
                        else { format!("atempo={factor}") };
                    command.args(["-af", &audio]);
                    Some(format!("setpts=(PTS-STARTPTS)/{factor}"))
                },
                _ => None,
            };
            if let Some(filter) = filter { command.args(["-vf", &filter]); }
            let quality = numeric("quality", 75.0, 1.0, 100.0)?;
            if encoder == "libx264" { command.args(["-pix_fmt", "yuv420p", "-crf", &((51.0 - quality * 0.5).round() as u32).to_string()]); }
        }
        let strip = operation == "strip-metadata" || options.get("stripMetadata").and_then(Value::as_bool).unwrap_or(false);
        if strip { command.args(["-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1"]); }
        else { command.args(["-map_metadata", "0", "-map_chapters", "0"]); }
        let muxer = if operation == "snapshot" { "image2pipe" } else if category == "audio" || operation == "extract-audio" { AUDIO_OUTPUTS.iter().find(|entry| entry.0 == format).ok_or("Invalid output")?.2 } else { VIDEO_OUTPUTS.iter().find(|entry| entry.0 == format).ok_or("Invalid output")?.2 };
        command.args(["-f", muxer]).arg(output);
        captured(command, Duration::from_secs(3600), cancelled).map_err(safe_media_error)?;
        Ok(())
    }
}

fn video_audio_encoder(format: &str) -> &'static str {
    match format { "webm" => "libopus", "avi" => "libmp3lame", "wmv" => "wmav2", _ => "aac" }
}

fn safe_media_error(error: String) -> String {
    if error == "Cancelled" || error == "Local media backend timed out" { error }
    else { "Local media backend failed; check the input, format, and installed codecs".into() }
}

fn demuxer(extension: &str) -> &'static str {
    match extension {
        "mp4" | "mov" | "m4a" => "mov", "mkv" | "webm" => "matroska", "avi" => "avi", "wmv" | "wma" => "asf",
        "mp3" => "mp3", "wav" => "wav", "flac" => "flac", "ogg" | "opus" => "ogg", "aiff" => "aiff", _ => "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_local_wav_when_ffmpeg_codec_is_available() {
        let backend = detect(&Default::default());
        if !backend.supports("audio", "convert", "wav", "mp3") { return; }
        let directory = std::env::temp_dir().join(format!("santara-media-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let input = directory.join("tone.wav");
        let output = directory.join("out.tmp");
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36_u32 + 16_000).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&16_000_u32.to_le_bytes());
        bytes.extend_from_slice(&32_000_u32.to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&16_000_u32.to_le_bytes());
        bytes.resize(bytes.len() + 16_000, 0);
        std::fs::write(&input, bytes).unwrap();
        backend.run(&input, &output, "audio", "convert", "mp3", &json!({}), || false).unwrap();
        assert!(std::fs::metadata(&output).unwrap().len() > 100);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

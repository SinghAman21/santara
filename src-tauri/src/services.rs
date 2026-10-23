use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;
use tokio::sync::Semaphore;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFile {
    pub id: String,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub ext: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_directory: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shortcuts {
    pub convert: String,
    pub tools: String,
    pub actions: String,
}

impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            convert: "Shift".into(),
            tools: "Alt".into(),
            actions: "Control".into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub output_folder: String,
    pub collision: String,
    pub concurrency: u8,
    pub quality: u8,
    pub strip_metadata: bool,
    pub recursive: bool,
    pub preserve_structure: bool,
    pub naming_pattern: String,
    pub shortcuts: Shortcuts,
    pub backend_paths: HashMap<String, String>,
    pub tray: bool,
    pub minimize_to_tray: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            output_folder: String::new(),
            collision: "rename".into(),
            concurrency: 2,
            quality: 85,
            strip_metadata: false,
            recursive: false,
            preserve_structure: false,
            naming_pattern: "{name}-converted".into(),
            shortcuts: Shortcuts::default(),
            backend_paths: HashMap::new(),
            tray: false,
            minimize_to_tray: false,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub files: Vec<LocalFile>,
    pub jobs: Vec<Job>,
    pub settings: Settings,
    pub backends: HashMap<String, Value>,
    pub capabilities: Vec<Value>,
    pub platform: &'static str,
    pub persistence_errors: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub input: String,
    pub name: String,
    pub operation: String,
    pub format: String,
    pub status: String,
    pub progress: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub created_at: String,
    pub options: Value,
}

#[derive(Default)]
struct Data {
    files: Vec<LocalFile>,
    jobs: Vec<Job>,
    outputs: HashSet<PathBuf>,
    pending_drops: HashMap<String, Vec<String>>,
    previews: HashMap<String, PreviewEntry>,
    image_context: Option<EditorContext>,
    video_context: Option<EditorContext>,
    preview_windows: HashMap<String, LocalFile>,
    settings: Settings,
    persistence_errors: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorContext {
    capability: Value,
    files: Vec<LocalFile>,
    format: String,
    options: Value,
}

#[derive(Clone)]
struct PreviewEntry {
    path: PathBuf,
    mime: &'static str,
    size: u64,
    modified: Option<SystemTime>,
    window: String,
    expires: Instant,
    cached: bool,
}

pub struct AppState {
    data: Mutex<Data>,
    semaphore: Mutex<Arc<Semaphore>>,
    media: Mutex<crate::media::MediaBackend>,
    pdf: Mutex<crate::pdf::PdfBackend>,
    documents: Mutex<crate::documents::DocumentBackend>,
    settings_file: PathBuf,
    jobs_file: PathBuf,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        #[cfg(unix)]
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())?;
        let settings_file = directory.join("settings.json");
        let jobs_file = directory.join("jobs.json");
        let mut data = Data::default();
        match fs::read_to_string(&settings_file) {
            Ok(contents) if contents.len() <= 1_000_000 => match serde_json::from_str::<Value>(&contents)
                .map_err(|_| "Invalid settings".to_string())
                .and_then(|value| validate_settings(Settings::default(), value)) {
                Ok(settings) => data.settings = settings,
                Err(_) => data.persistence_errors.push("Saved settings could not be read".into()),
            },
            Ok(_) => data.persistence_errors.push("Saved settings exceed the size limit".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => data.persistence_errors.push("Saved settings are unavailable".into()),
        }
        match fs::read_to_string(&jobs_file) {
            Ok(contents) if contents.len() <= 20_000_000 => match serde_json::from_str::<Vec<Job>>(&contents) {
                Ok(mut jobs) if jobs.len() <= 10_000 => {
                    for job in &mut jobs {
                        if ["queued", "preparing", "processing"].contains(&job.status.as_str()) {
                            job.status = "failed".into();
                            job.error = Some("Interrupted when Santara closed".into());
                        }
                    }
                    for job in &jobs {
                        if job.status == "completed" {
                            if let Some(output) = &job.output { data.outputs.insert(PathBuf::from(output)); }
                        }
                    }
                    data.jobs = jobs;
                }
                _ => data.persistence_errors.push("Saved jobs could not be read".into()),
            },
            Ok(_) => data.persistence_errors.push("Saved jobs exceed the size limit".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => data.persistence_errors.push("Saved jobs are unavailable".into()),
        }
        let concurrency = data.settings.concurrency;
        let media = crate::media::detect(&data.settings.backend_paths);
        let pdf = crate::pdf::detect(&data.settings.backend_paths);
        let documents = crate::documents::detect(&data.settings.backend_paths);
        Ok(Self {
            data: Mutex::new(data),
            semaphore: Mutex::new(Arc::new(Semaphore::new(usize::from(concurrency)))),
            media: Mutex::new(media),
            pdf: Mutex::new(pdf),
            documents: Mutex::new(documents),
            settings_file,
            jobs_file,
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Data>, String> {
        self.data.lock().map_err(|_| "Santara state is unavailable".into())
    }

    fn update_job(&self, app: &AppHandle, id: &str, status: &str, output: Option<String>, error: Option<String>) -> Result<(), String> {
        let mut data = self.lock()?;
        let job = data.jobs.iter_mut().find(|job| job.id == id).ok_or("Unknown job")?;
        if job.status == "cancelled" { return Ok(()); }
        job.status = status.into();
        job.progress = if status == "completed" { 100 } else { 0 };
        job.output = output.clone();
        job.error = error;
        if let Some(output) = output { data.outputs.insert(PathBuf::from(output)); }
        persist_json(&self.jobs_file, &data.jobs)?;
        let jobs = data.jobs.clone();
        drop(data);
        let _ = app.emit("santara:update", serde_json::json!({ "jobs": jobs }));
        Ok(())
    }

    fn snapshot(&self) -> Result<Snapshot, String> {
        let data = self.lock()?;
        let media = self.media.lock().map_err(|_| "Media backend is unavailable")?;
        let pdf = self.pdf.lock().map_err(|_| "PDF backend is unavailable")?;
        let documents = self.documents.lock().map_err(|_| "Document backend is unavailable")?;
        let mut capabilities = crate::processing::capabilities();
        capabilities.push(crate::subtitles::capabilities());
        capabilities.extend(crate::archives::capabilities());
        capabilities.extend(media.capabilities());
        capabilities.extend(pdf.capabilities());
        capabilities.extend(documents.capabilities());
        let mut backends = HashMap::from([
            ("rust-image".into(), serde_json::json!({ "available": true, "version": "0.25" })),
            ("rust-subtitles".into(), serde_json::json!({ "available": true })),
            ("rust-archive".into(), serde_json::json!({ "available": true })),
            ("ffmpeg".into(), media.info()),
            ("ffprobe".into(), serde_json::json!({ "available": media.available() }))
        ]);
        backends.extend(pdf.info());
        backends.insert("pandoc".into(), documents.info());
        Ok(Snapshot {
            files: data.files.clone(),
            jobs: data.jobs.clone(),
            settings: data.settings.clone(),
            backends,
            capabilities,
            platform: if cfg!(windows) { "win32" } else { "linux" },
            persistence_errors: data.persistence_errors.clone(),
        })
    }

    fn add_files(&self, app: &AppHandle, files: Vec<LocalFile>) -> Result<Vec<LocalFile>, String> {
        let mut data = self.lock()?;
        let mut seen: HashSet<String> = data.files.iter().map(|file| file.path.clone()).collect();
        let mut added = Vec::new();
        for file in files {
            if seen.insert(file.path.clone()) {
                if seen.len() > 10_000 {
                    return Err("At most 10,000 files may be selected".into());
                }
                added.push(file.clone());
                data.files.push(file);
            }
        }
        drop(data);
        let update = serde_json::json!({ "files": added });
        let _ = app.emit("santara:update", update);
        Ok(added)
    }

    pub fn known_path(&self, value: &str, output_only: bool) -> Result<PathBuf, String> {
        let path = checked_path(value)?;
        let data = self.lock()?;
        let known = if output_only {
            data.outputs.contains(&path)
        } else {
            data.outputs.contains(&path) || data.files.iter().any(|file| file.path == value)
        };
        if !known {
            return Err("Select a known file or job output first".into());
        }
        drop(data);
        check_no_symlink(&path)?;
        Ok(path)
    }

    pub fn record_drop(&self, window: &str, paths: &[PathBuf]) -> Result<(), String> {
        if !["workspace", "wheel"].contains(&window) || paths.len() > 1_000 {
            return Err("Unsupported drop target or too many files".into());
        }
        let mut accepted = Vec::new();
        for path in paths {
            let path = checked_path(&path.to_string_lossy())?;
            check_no_symlink(&path)?;
            accepted.push(path.to_string_lossy().to_string());
        }
        self.lock()?.pending_drops.insert(window.into(), accepted);
        Ok(())
    }

    pub fn serve_preview(&self, window: &str, request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
        let token = request.uri().path().trim_start_matches('/');
        let entry = self.lock().ok().and_then(|data| data.previews.get(token).cloned());
        let Some(entry) = entry else { return preview_error(404) };
        if entry.window != window || entry.expires < Instant::now() { return preview_error(404); }
        let Ok(metadata) = check_no_symlink(&entry.path) else { return preview_error(404) };
        if !metadata.is_file() || metadata.len() != entry.size || metadata.modified().ok() != entry.modified { return preview_error(404); }
        let range = request.headers().get(tauri::http::header::RANGE).and_then(|value| value.to_str().ok());
        let (start, end, partial) = match parse_range(range, entry.size) {
            Ok(value) => value,
            Err(_) => return preview_error(416),
        };
        let Ok(mut file) = File::open(&entry.path) else { return preview_error(404) };
        if file.seek(SeekFrom::Start(start)).is_err() { return preview_error(404); }
        let mut bytes = Vec::new();
        if file.take(end - start + 1).read_to_end(&mut bytes).is_err() || bytes.len() as u64 != end - start + 1 { return preview_error(404); }
        let mut builder = tauri::http::Response::builder()
            .status(if partial { 206 } else { 200 })
            .header("Content-Type", entry.mime)
            .header("Accept-Ranges", "bytes")
            .header("Content-Length", bytes.len().to_string())
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .header("Access-Control-Allow-Origin", "*");
        if partial { builder = builder.header("Content-Range", format!("bytes {start}-{end}/{}", entry.size)); }
        builder.body(bytes).unwrap_or_else(|_| preview_error(500))
    }

    pub fn forget_window(&self, label: &str) {
        if let Ok(mut data) = self.lock() {
            data.preview_windows.remove(label);
            let tokens = data.previews.iter().filter(|(_, entry)| entry.window == label).map(|(key, _)| key.clone()).collect::<Vec<_>>();
            for token in tokens {
                if let Some(entry) = data.previews.remove(&token) { if entry.cached { let _ = fs::remove_file(entry.path); } }
            }
        }
    }
}

fn preview_error(status: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder().status(status).header("Cache-Control", "no-store").body(Vec::new()).unwrap()
}

fn parse_range(header: Option<&str>, size: u64) -> Result<(u64, u64, bool), String> {
    if size == 0 { return Err("Empty media".into()); }
    let Some(header) = header else { return Ok((0, size - 1, false)) };
    let range = header.strip_prefix("bytes=").ok_or("Invalid range")?;
    if range.contains(',') { return Err("Multiple ranges are unsupported".into()); }
    let (start, end) = range.split_once('-').ok_or("Invalid range")?;
    let start = if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| "Invalid range")?;
        size.saturating_sub(suffix)
    } else { start.parse::<u64>().map_err(|_| "Invalid range")? };
    if start >= size { return Err("Range exceeds media".into()); }
    let end = if end.is_empty() || header.starts_with("bytes=-") { size - 1 }
        else { end.parse::<u64>().map_err(|_| "Invalid range")?.min(size - 1) };
    if end < start { return Err("Invalid range".into()); }
    Ok((start, end.min(start.saturating_add(4 * 1024 * 1024 - 1)), true))
}

fn checked_path(value: &str) -> Result<PathBuf, String> {
    if value.len() > 32_768 || value.chars().any(char::is_control) {
        return Err("Invalid local path".into());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() || value.starts_with("\\\\") || value.starts_with("//") {
        return Err("Expected an absolute local path".into());
    }
    Ok(path)
}

fn check_no_symlink(path: &Path) -> Result<fs::Metadata, String> {
    for ancestor in path.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("Paths through symbolic links are not supported".into());
        }
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("Unsupported filesystem entry".into());
    }
    Ok(metadata)
}

fn category(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "webp" | "heic" | "tiff" | "tif" | "avif" | "bmp" | "svg" | "gif" => "image",
        "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aiff" | "wma" => "audio",
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "wmv" => "video",
        "pdf" => "pdf",
        "srt" | "vtt" => "subtitle",
        "zip" | "tar" | "gz" | "rar" => "archive",
        "xlsx" | "ods" | "csv" | "tsv" | "xls" => "spreadsheet",
        "ppt" | "pptx" => "presentation",
        "docx" | "md" | "txt" | "epub" | "rtf" | "html" => "document",
        _ => "other",
    }
}

fn inspect_one(path: &Path, result: &mut Vec<LocalFile>, recursive: bool) -> Result<(), String> {
    if result.len() >= 10_000 {
        return Err("At most 10,000 files may be selected".into());
    }
    let metadata = check_no_symlink(path)?;
    let name = path.file_name().ok_or("Invalid filename")?.to_string_lossy().to_string();
    let ext = path.extension().map(|value| value.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    result.push(LocalFile {
        id: Uuid::new_v4().to_string(),
        path: path.to_string_lossy().to_string(),
        name,
        size: if metadata.is_file() { metadata.len() } else { 0 },
        ext: ext.clone(),
        category: if metadata.is_dir() { "other" } else { category(&ext) }.into(),
        is_directory: metadata.is_dir().then_some(true),
    });
    if metadata.is_dir() {
        for child in fs::read_dir(path).map_err(|error| error.to_string())? {
            let child = child.map_err(|error| error.to_string())?;
            let kind = child.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() || (!kind.is_file() && !kind.is_dir()) {
                continue;
            }
            if kind.is_dir() && !recursive {
                continue;
            }
            inspect_one(&child.path(), result, recursive)?;
        }
    }
    Ok(())
}

fn inspect_all(paths: Vec<String>, recursive: bool) -> Result<Vec<LocalFile>, String> {
    if paths.len() > 1_000 {
        return Err("At most 1,000 paths may be inspected at once".into());
    }
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for input in paths {
        let path = checked_path(&input)?;
        if seen.insert(path.clone()) {
            inspect_one(&path, &mut result, recursive)?;
        }
    }
    Ok(result)
}

async fn add_selected(app: AppHandle, paths: Vec<String>, recursive: bool) -> Result<Vec<LocalFile>, String> {
    let files = tauri::async_runtime::spawn_blocking(move || inspect_all(paths, recursive))
        .await
        .map_err(|error| error.to_string())??;
    let state = app.state::<AppState>();
    state.add_files(&app, files)
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> Result<Snapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn inspect_paths(app: AppHandle, paths: Vec<String>, recursive: bool) -> Result<Vec<LocalFile>, String> {
    let state = app.state::<AppState>();
    let known = state.lock()?.files.iter().map(|file| file.path.clone()).collect::<HashSet<_>>();
    if paths.iter().any(|path| !known.contains(path)) { return Err("Select files through a native dialog or drop first".into()); }
    add_selected(app, paths, recursive).await
}

#[tauri::command]
pub async fn consume_drop(app: AppHandle, window: tauri::WebviewWindow) -> Result<Vec<LocalFile>, String> {
    let state = app.state::<AppState>();
    let paths = state.lock()?.pending_drops.remove(window.label()).unwrap_or_default();
    if paths.is_empty() { return Ok(Vec::new()); }
    let recursive = state.lock()?.settings.recursive;
    add_selected(app, paths, recursive).await
}

#[tauri::command]
pub async fn choose_files(app: AppHandle) -> Result<Vec<LocalFile>, String> {
    let dialog_app = app.clone();
    let paths = tauri::async_runtime::spawn_blocking(move || dialog_app.dialog().file().blocking_pick_files())
        .await
        .map_err(|error| error.to_string())?
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.into_path().map(|path| path.to_string_lossy().to_string()).map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    add_selected(app, paths, false).await
}

#[tauri::command]
pub async fn choose_folder(app: AppHandle) -> Result<Vec<LocalFile>, String> {
    let dialog_app = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || dialog_app.dialog().file().blocking_pick_folder())
        .await
        .map_err(|error| error.to_string())?;
    let Some(path) = path else { return Ok(Vec::new()) };
    let path = path.into_path().map_err(|error| error.to_string())?;
    let recursive = app.state::<AppState>().lock()?.settings.recursive;
    add_selected(app, vec![path.to_string_lossy().to_string()], recursive).await
}

#[tauri::command]
pub async fn pick_output(app: AppHandle) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || dialog_app.dialog().file().blocking_pick_folder())
        .await
        .map_err(|error| error.to_string())?;
    selected.map(|value| value.into_path().map_err(|error| error.to_string())).transpose()?.map(|path| {
        check_no_symlink(&path)?;
        Ok(path.to_string_lossy().to_string())
    }).transpose()
}

fn validate_settings(mut settings: Settings, patch: Value) -> Result<Settings, String> {
    let patch = patch.as_object().ok_or("Expected settings object")?;
    for (key, value) in patch {
        match key.as_str() {
            "theme" => {
                let value = value.as_str().ok_or("Invalid theme")?;
                if !["system", "light", "dark"].contains(&value) { return Err("Invalid theme".into()) }
                settings.theme = value.into();
            }
            "outputFolder" => {
                let value = value.as_str().ok_or("Invalid output folder")?;
                if !value.is_empty() { check_no_symlink(&checked_path(value)?)?; }
                settings.output_folder = value.into();
            }
            "collision" => {
                let value = value.as_str().ok_or("Invalid collision policy")?;
                if !["rename", "autorenaming", "skip", "ask"].contains(&value) { return Err("Invalid collision policy".into()) }
                settings.collision = value.into();
            }
            "concurrency" => {
                let value = value.as_u64().ok_or("Invalid concurrency")?;
                if !(1..=8).contains(&value) { return Err("Concurrency must be 1–8".into()) }
                settings.concurrency = value as u8;
            }
            "quality" => {
                let value = value.as_u64().ok_or("Invalid quality")?;
                if !(1..=100).contains(&value) { return Err("Quality must be 1–100".into()) }
                settings.quality = value as u8;
            }
            "stripMetadata" => settings.strip_metadata = value.as_bool().ok_or("Invalid strip metadata setting")?,
            "recursive" => settings.recursive = value.as_bool().ok_or("Invalid recursive setting")?,
            "preserveStructure" => settings.preserve_structure = value.as_bool().ok_or("Invalid preserve structure setting")?,
            "tray" => settings.tray = value.as_bool().ok_or("Invalid tray setting")?,
            "minimizeToTray" => settings.minimize_to_tray = value.as_bool().ok_or("Invalid tray setting")?,
            "namingPattern" => {
                let value = value.as_str().ok_or("Invalid naming pattern")?;
                if value.len() > 200 || value.chars().any(|ch| ch.is_control() || ch == '/' || ch == '\\') {
                    return Err("Invalid naming pattern".into());
                }
                settings.naming_pattern = value.into();
            }
            "shortcuts" => {
                let shortcuts: Shortcuts = serde_json::from_value(value.clone()).map_err(|_| "Invalid shortcuts")?;
                let values = [&shortcuts.convert, &shortcuts.tools, &shortcuts.actions];
                if values.iter().any(|key| !["Shift", "Alt", "Control", "Ctrl", "Ctrl+Shift"].contains(&key.as_str())) {
                    return Err("Invalid shortcut".into());
                }
                if values[0] == values[1] || values[0] == values[2] || values[1] == values[2] {
                    return Err("Each wheel needs a different shortcut".into());
                }
                settings.shortcuts = shortcuts;
            }
            "backendPaths" => {
                let entries = value.as_object().ok_or("Invalid backend paths")?;
                let mut paths = HashMap::new();
                for (name, path) in entries {
                    if !["ffmpeg", "ffprobe", "imagemagick", "qpdf", "poppler", "pandoc", "libreoffice"].contains(&name.as_str()) {
                        return Err("Unknown backend".into());
                    }
                    let path = path.as_str().ok_or("Invalid backend path")?;
                    if !path.is_empty() { checked_path(path)?; }
                    paths.insert(name.clone(), path.into());
                }
                settings.backend_paths = paths;
            }
            _ => return Err(format!("Unknown setting: {key}")),
        }
    }
    Ok(settings)
}

fn persist_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let temporary = path.with_file_name(format!(".santara-{}.tmp", Uuid::new_v4()));
    let serialized = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut file: File = options.open(&temporary).map_err(|error| error.to_string())?;
        file.write_all(&serialized).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        fs::rename(&temporary, path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, state: State<'_, AppState>, patch: Value) -> Result<Settings, String> {
    let changing_backend = patch.get("backendPaths").is_some();
    let previous = state.lock()?.settings.clone();
    let updated = validate_settings(previous.clone(), patch)?;
    if changing_backend && updated.backend_paths != previous.backend_paths && updated.backend_paths.values().any(|path| !path.is_empty()) {
        for path in updated.backend_paths.values().filter(|path| !path.is_empty()) {
            let executable = checked_path(path)?;
            if !check_no_symlink(&executable)?.is_file() { return Err("Backend must be a regular local file".into()); }
        }
        let message_app = app.clone();
        let approved = tauri::async_runtime::spawn_blocking(move || {
            message_app.dialog().message("Allow these selected local programs to run as conversion backends? Only configure programs you trust.")
                .title("Change conversion backends")
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom("Allow programs".into(), "Cancel".into()))
                .blocking_show()
        }).await.map_err(|error| error.to_string())?;
        if !approved { return Ok(previous); }
    }
    let next_media = if changing_backend && updated.backend_paths != previous.backend_paths {
        let overrides = updated.backend_paths.clone();
        Some(tauri::async_runtime::spawn_blocking(move || crate::media::detect(&overrides)).await.map_err(|error| error.to_string())?)
    } else { None };
    let next_pdf = if changing_backend && updated.backend_paths != previous.backend_paths {
        let overrides = updated.backend_paths.clone();
        Some(tauri::async_runtime::spawn_blocking(move || crate::pdf::detect(&overrides)).await.map_err(|error| error.to_string())?)
    } else { None };
    let next_documents = if changing_backend && updated.backend_paths != previous.backend_paths {
        let overrides = updated.backend_paths.clone();
        Some(tauri::async_runtime::spawn_blocking(move || crate::documents::detect(&overrides)).await.map_err(|error| error.to_string())?)
    } else { None };
    let mut data = state.lock()?;
    if data.settings != previous { return Err("Settings changed while the dialog was open; please retry".into()); }
    persist_json(&state.settings_file, &updated)?;
    data.settings = updated.clone();
    drop(data);
    if let Some(media) = next_media { *state.media.lock().map_err(|_| "Media backend is unavailable")? = media; }
    if let Some(pdf) = next_pdf { *state.pdf.lock().map_err(|_| "PDF backend is unavailable")? = pdf; }
    if let Some(documents) = next_documents { *state.documents.lock().map_err(|_| "Document backend is unavailable")? = documents; }
    *state.semaphore.lock().map_err(|_| "Santara queue is unavailable")? = Arc::new(Semaphore::new(usize::from(updated.concurrency)));
    let snapshot = state.snapshot()?;
    let _ = app.emit("santara:update", serde_json::json!({ "settings": updated, "backends": snapshot.backends, "capabilities": snapshot.capabilities }));
    Ok(updated)
}

#[tauri::command]
pub fn reveal(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Value, String> {
    let path = state.known_path(&path, false)?;
    app.opener().reveal_item_in_dir(path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn open_output(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Value, String> {
    let path = state.known_path(&path, true)?;
    app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
pub struct EnqueueRequest {
    files: Vec<LocalFile>,
    operation: String,
    format: String,
    options: Value,
}

fn schedule_job(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let semaphore = state.semaphore.lock().map_err(|_| "Santara queue is unavailable")?.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(_permit) = semaphore.acquire_owned().await else { return };
        let job = {
            let state = app.state::<AppState>();
            let Ok(data) = state.lock() else { return };
            data.jobs.iter().find(|job| job.id == id && job.status == "queued").cloned()
        };
        let Some(job) = job else { return };
        let state = app.state::<AppState>();
        if state.update_job(&app, &id, "processing", None, None).is_err() { return }
        let settings = match state.lock() { Ok(data) => data.settings.clone(), Err(_) => return };
        let work_app = app.clone();
        let work = tauri::async_runtime::spawn_blocking(move || run_local_job(&work_app, &job, &settings)).await;
        let result = match work {
            Ok(value) => value,
            Err(error) => Err(error.to_string()),
        };
        let state = app.state::<AppState>();
        match result {
            Ok(Some(output)) => { let _ = state.update_job(&app, &id, "completed", Some(output), None); }
            Ok(None) => { let _ = state.update_job(&app, &id, "skipped", None, None); }
            Err(error) => { let _ = state.update_job(&app, &id, "failed", None, Some(error)); }
        }
    });
    Ok(())
}

fn run_local_job(app: &AppHandle, job: &Job, settings: &Settings) -> Result<Option<String>, String> {
    let source = checked_path(&job.input)?;
    let source_info = check_no_symlink(&source)?;
    if !source_info.is_file() && !(job.operation == "create-archive" && source_info.is_dir()) {
        return Err("Input must be a regular file or selected archive folder".into());
    }
    let directory = job.options.get("outputFolder").and_then(Value::as_str).filter(|value| !value.is_empty())
        .or_else(|| (!settings.output_folder.is_empty()).then_some(settings.output_folder.as_str()))
        .map(checked_path).transpose()?.unwrap_or_else(|| source.parent().unwrap_or(&source).to_path_buf());
    if !check_no_symlink(&directory)?.is_dir() { return Err("Output folder is unavailable".into()); }
    let quality = job.options.get("quality").and_then(Value::as_u64).unwrap_or(u64::from(settings.quality));
    if !(1..=100).contains(&quality) { return Err("Invalid quality".into()); }
    let input_ext = source.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    let media_category = if ["mp4", "mov", "mkv", "webm", "avi", "wmv"].contains(&input_ext.as_str()) { Some("video") }
        else if ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aiff", "wma"].contains(&input_ext.as_str()) { Some("audio") } else { None };
    let archive_create = job.operation == "create-archive";
    let archive_extract = job.operation == "extract";
    let pdf_job = input_ext == "pdf";
    let document_job = ["txt", "md", "html", "docx", "epub", "rtf"].contains(&input_ext.as_str());
    let bytes = if media_category.is_some() || archive_create || archive_extract || pdf_job || document_job { None }
        else if ["srt", "vtt"].contains(&input_ext.as_str()) { Some(crate::subtitles::convert(&source, &job.format)?) }
        else { Some(crate::processing::convert_image(&source, &job.operation, &job.format, &job.options, quality as u8)?) };
    if app.state::<AppState>().lock()?.jobs.iter().any(|entry| entry.id == job.id && entry.status == "cancelled") {
        return Err("Cancelled".into());
    }
    let stem = source.file_stem().and_then(|value| value.to_str()).ok_or("Invalid source name")?;
    let base = settings.naming_pattern.replace("{name}", stem).replace("{operation}", &job.operation).replace("{ext}", &job.format);
    if base.is_empty() || base.len() > 240 || base.chars().any(|ch| ch.is_control() || ch == '/' || ch == '\\') {
        return Err("Invalid output name".into());
    }
    let temp = directory.join(format!(".santara-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        if let Some(bytes) = bytes {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)] options.mode(0o600);
            let mut file = options.open(&temp).map_err(|error| error.to_string())?;
            file.write_all(&bytes).map_err(|error| error.to_string())?;
            file.sync_all().map_err(|error| error.to_string())?;
        } else if let Some(category) = media_category {
            let backend = app.state::<AppState>().media.lock().map_err(|_| "Media backend is unavailable")?.clone();
            backend.run(&source, &temp, category, &job.operation, &job.format, &job.options,
                || app.state::<AppState>().lock().is_ok_and(|data| data.jobs.iter().any(|entry| entry.id == job.id && entry.status == "cancelled")))?;
            File::open(&temp).map_err(|error| error.to_string())?.sync_all().map_err(|error| error.to_string())?;
        } else if archive_create {
            let inputs = job.options.get("inputs").and_then(Value::as_array).ok_or("Missing archive sources")?
                .iter().map(|value| value.as_str().ok_or_else(|| "Invalid archive source".to_string()).and_then(checked_path))
                .collect::<Result<Vec<_>, _>>()?;
            crate::archives::create(&inputs, &temp, &job.format)?;
        } else if archive_extract {
            crate::archives::extract(&source, &temp, &input_ext)?;
        } else if pdf_job {
            if job.operation == "pdf-merge" {
                for value in job.options.get("inputs").and_then(Value::as_array).ok_or("Missing PDF inputs")? {
                    let path = checked_path(value.as_str().ok_or("Invalid PDF input")?)?;
                    if !check_no_symlink(&path)?.is_file() { return Err("Merge inputs must be regular PDFs".into()); }
                }
            }
            let backend = app.state::<AppState>().pdf.lock().map_err(|_| "PDF backend is unavailable")?.clone();
            backend.run(&source, &temp, &job.operation, &job.format, &job.options,
                || app.state::<AppState>().lock().is_ok_and(|data| data.jobs.iter().any(|entry| entry.id == job.id && entry.status == "cancelled")))?;
            File::open(&temp).map_err(|error| error.to_string())?.sync_all().map_err(|error| error.to_string())?;
        } else if document_job {
            let backend = app.state::<AppState>().documents.lock().map_err(|_| "Document backend is unavailable")?.clone();
            backend.run(&source, &temp, &job.format,
                || app.state::<AppState>().lock().is_ok_and(|data| data.jobs.iter().any(|entry| entry.id == job.id && entry.status == "cancelled")))?;
            File::open(&temp).map_err(|error| error.to_string())?.sync_all().map_err(|error| error.to_string())?;
        }
        if app.state::<AppState>().lock()?.jobs.iter().any(|entry| entry.id == job.id && entry.status == "cancelled") {
            return Err("Cancelled".into());
        }
        for number in 0..10_000 {
            let suffix = if number == 0 { String::new() } else { format!(" ({number})") };
            let output = if archive_extract { directory.join(format!("{base}{suffix}")) }
                else { directory.join(format!("{base}{suffix}.{}", job.format)) };
            let publication = if archive_extract { publish_directory(&temp, &output) } else { fs::hard_link(&temp, &output) };
            match publication {
                Ok(()) => return Ok(Some(output.to_string_lossy().to_string())),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    let policy = job.options.get("collision").and_then(Value::as_str).unwrap_or(&settings.collision);
                    if policy == "skip" { return Ok(None); }
                    if policy == "ask" { return Err("Output exists; choose Keep both or Skip before retrying".into()); }
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        Err("Too many output name collisions".into())
    })();
    if archive_extract { let _ = fs::remove_dir_all(temp); } else { let _ = fs::remove_file(temp); }
    result
}

fn publish_directory(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "linux")]
    { rustix::fs::renameat_with(rustix::fs::CWD, source, rustix::fs::CWD, destination, rustix::fs::RenameFlags::NOREPLACE).map_err(std::io::Error::from) }
    #[cfg(target_os = "windows")]
    { if destination.exists() { return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "Destination exists")); } fs::rename(source, destination) }
}

#[tauri::command]
pub fn enqueue(app: AppHandle, state: State<'_, AppState>, request: EnqueueRequest) -> Result<Vec<Job>, String> {
    if request.files.is_empty() || request.files.len() > 1_000 { return Err("Select 1–1,000 files".into()); }
    if !request.options.is_object() || request.options.to_string().len() > 100_000 { return Err("Invalid conversion options".into()); }
    if !["convert", "compress", "resize", "crop", "rotate", "flip", "strip-metadata", "edit-image", "background", "trim", "mute", "speed", "snapshot", "extract-audio", "normalize", "channels", "create-archive", "extract", "pdf-extract", "pdf-merge", "pdf-rotate", "render"].contains(&request.operation.as_str()) {
        return Err("Unsupported operation".into());
    }
    if !["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif", "avif", "srt", "vtt", "txt", "md", "html", "docx", "epub", "mp4", "mkv", "mov", "avi", "wmv", "mp3", "wav", "flac", "ogg", "opus", "m4a", "aiff", "wma", "zip", "tar", "gz", "directory", "pdf"].contains(&request.format.as_str()) {
        return Err("Unsupported output format".into());
    }
    let now = OffsetDateTime::now_utc().format(&Rfc3339).map_err(|error| error.to_string())?;
    let mut jobs = Vec::new();
    if request.operation == "create-archive" || request.operation == "pdf-merge" {
        if request.operation == "create-archive" && !["zip", "tar", "gz"].contains(&request.format.as_str()) { return Err("Unsupported archive format".into()); }
        if request.operation == "pdf-merge" && (request.format != "pdf" || !state.pdf.lock().map_err(|_| "PDF backend is unavailable")?.supports("pdf-merge", "pdf")) {
            return Err("PDF merge is unavailable".into());
        }
        let mut paths = Vec::new();
        for file in &request.files {
            let path = state.known_path(&file.path, false)?;
            if request.operation == "pdf-merge" && (path.extension().and_then(|value| value.to_str()) != Some("pdf") || !check_no_symlink(&path)?.is_file()) {
                return Err("Select inspected PDFs to merge".into());
            }
            paths.push(path);
        }
        if request.operation == "create-archive" { paths.sort(); paths.dedup(); }
        else { let mut seen = HashSet::new(); paths.retain(|path| seen.insert(path.clone())); }
        let roots = paths.iter().filter(|path| !paths.iter().any(|other| *path != other && path.starts_with(other)))
            .cloned().collect::<Vec<_>>();
        if roots.is_empty() { return Err("Select archive sources".into()); }
        if request.operation == "pdf-merge" && roots.len() < 2 { return Err("Select at least two PDFs".into()); }
        let mut options = request.options.clone();
        options.as_object_mut().ok_or("Invalid archive options")?.insert("inputs".into(), serde_json::json!(roots));
        let first = roots[0].to_string_lossy().to_string();
        jobs.push(Job { id: Uuid::new_v4().to_string(), input: first.clone(), name: roots[0].file_name().unwrap_or_default().to_string_lossy().to_string(),
            operation: request.operation.clone(), format: request.format.clone(), status: "queued".into(), progress: 0,
            output: None, error: None, created_at: now.clone(), options });
    } else {
    for file in &request.files {
        let path = state.known_path(&file.path, false)?;
        let inspected = state.lock()?.files.iter().find(|entry| entry.path == file.path).cloned().ok_or("Inspect input files before enqueueing")?;
        let image = inspected.category == "image" && ["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif", "avif"].contains(&inspected.ext.as_str())
            && ["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif", "avif"].contains(&request.format.as_str())
            && ["convert", "compress", "resize", "crop", "rotate", "flip", "strip-metadata", "edit-image", "background"].contains(&request.operation.as_str());
        let subtitle = inspected.category == "subtitle" && ["srt", "vtt"].contains(&inspected.ext.as_str())
            && request.operation == "convert" && ["srt", "vtt", "txt"].contains(&request.format.as_str());
        let media = ["video", "audio"].contains(&inspected.category.as_str()) && state.media.lock().map_err(|_| "Media backend is unavailable")?
            .supports(&inspected.category, &request.operation, &inspected.ext, &request.format);
        let archive = inspected.category == "archive" && ["zip", "tar", "gz"].contains(&inspected.ext.as_str())
            && request.operation == "extract" && request.format == "directory";
        let pdf = inspected.category == "pdf" && state.pdf.lock().map_err(|_| "PDF backend is unavailable")?
            .supports(&request.operation, &request.format);
        let document = inspected.category == "document" && request.operation == "convert"
            && state.documents.lock().map_err(|_| "Document backend is unavailable")?.supports(&inspected.ext, &request.format);
        if !(image || subtitle || media || archive || pdf || document) || !check_no_symlink(&path)?.is_file() {
            return Err("Select files supported by this local route".into());
        }
        jobs.push(Job { id: Uuid::new_v4().to_string(), input: inspected.path, name: inspected.name,
            operation: request.operation.clone(), format: request.format.clone(), status: "queued".into(), progress: 0,
            output: None, error: None, created_at: now.clone(), options: request.options.clone() });
    }
    }
    {
        let mut data = state.lock()?;
        if data.jobs.len() + jobs.len() > 10_000 { return Err("Job history is full".into()); }
        data.jobs.extend(jobs.clone());
        persist_json(&state.jobs_file, &data.jobs)?;
    }
    let _ = app.emit("santara:update", serde_json::json!({ "jobs": state.lock()?.jobs }));
    for job in &jobs { schedule_job(app.clone(), job.id.clone())?; }
    Ok(jobs)
}

#[tauri::command]
pub fn cancel(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let mut data = state.lock()?;
    let job = data.jobs.iter_mut().find(|job| job.id == id).ok_or("Unknown job")?;
    if ["queued", "processing", "preparing"].contains(&job.status.as_str()) { job.status = "cancelled".into(); }
    persist_json(&state.jobs_file, &data.jobs)?;
    let _ = app.emit("santara:update", serde_json::json!({ "jobs": data.jobs }));
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn retry(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Value, String> {
    {
        let mut data = state.lock()?;
        let job = data.jobs.iter_mut().find(|job| job.id == id).ok_or("Unknown job")?;
        if !["failed", "cancelled", "skipped"].contains(&job.status.as_str()) { return Err("Only failed or stopped jobs can be retried".into()); }
        job.status = "queued".into();
        job.error = None;
        job.progress = 0;
        persist_json(&state.jobs_file, &data.jobs)?;
        let _ = app.emit("santara:update", serde_json::json!({ "jobs": data.jobs }));
    }
    schedule_job(app, id)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn image_preview(state: State<'_, AppState>, path: String, operation: String, options: Value) -> Result<Value, String> {
    let input = state.known_path(&path, false)?;
    tauri::async_runtime::spawn_blocking(move || crate::processing::image_preview(&input, &operation, &options))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn preview(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, path: String) -> Result<Value, String> {
    let source = state.known_path(&path, false)?;
    let metadata = check_no_symlink(&source)?;
    if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 { return Err("Quick Preview supports files up to 32 MiB".into()); }
    let mime = preview_mime(&source)?;
    let (prepared, mime, cached) = if mime == "application/pdf" {
        let backend = state.pdf.lock().map_err(|_| "PDF backend is unavailable")?.clone();
        if !backend.supports("render", "png") { return Err("PDF preview requires local Poppler".into()); }
        let directory = app.path().app_cache_dir().map_err(|error| error.to_string())?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let output = directory.join(format!("santara-preview-{}.png", Uuid::new_v4()));
        let source = source.clone();
        let output_copy = output.clone();
        tauri::async_runtime::spawn_blocking(move || backend.run(&source, &output_copy, "render", "png", &serde_json::json!({ "page": 1, "dpi": 144 }), || false))
            .await.map_err(|error| error.to_string())??;
        (output, "image/png", true)
    } else { (source, mime, false) };
    let prepared_info = check_no_symlink(&prepared)?;
    if !prepared_info.is_file() || prepared_info.len() > 32 * 1024 * 1024 {
        if cached { let _ = fs::remove_file(&prepared); }
        return Err("Quick Preview output exceeds 32 MiB".into());
    }
    let token = Uuid::new_v4().to_string();
    {
        let mut data = state.lock()?;
        let expired = data.previews.iter().filter(|(_, entry)| entry.expires < Instant::now()).map(|(key, _)| key.clone()).collect::<Vec<_>>();
        for key in expired { if let Some(entry) = data.previews.remove(&key) { if entry.cached { let _ = fs::remove_file(entry.path); } } }
        if data.previews.len() >= 32 { return Err("Close an older preview before opening another".into()); }
        data.previews.insert(token.clone(), PreviewEntry { path: prepared, mime, size: prepared_info.len(), modified: prepared_info.modified().ok(),
            window: window.label().into(), expires: Instant::now() + Duration::from_secs(3600), cached });
    }
    let url = if cfg!(windows) { format!("http://santara-media.localhost/{token}") } else { format!("santara-media://localhost/{token}") };
    Ok(serde_json::json!({ "url": url }))
}

#[tauri::command]
pub fn preview_context(window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<LocalFile, String> {
    if !window.label().starts_with("preview-") { return Err("Preview context is private".into()); }
    state.lock()?.preview_windows.get(window.label()).cloned().ok_or("Preview is no longer available".into())
}

#[tauri::command]
pub fn close_preview(window: tauri::WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with("preview-") { return Err("Only a preview can close itself".into()); }
    window.close().map_err(|error| error.to_string())
}

fn preview_mime(path: &Path) -> Result<&'static str, String> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut header = [0_u8; 32];
    let count = file.read(&mut header).map_err(|error| error.to_string())?;
    let data = &header[..count];
    let branded = data.len() >= 12 && &data[4..8] == b"ftyp";
    let media = match extension.as_str() {
        "png" if data.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
        "jpg" | "jpeg" if data.starts_with(b"\xff\xd8\xff") => "image/jpeg",
        "gif" if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") => "image/gif",
        "webp" if data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP") => "image/webp",
        "bmp" if data.starts_with(b"BM") => "image/bmp",
        "avif" if branded && data[8..].windows(4).any(|part| part == b"avif" || part == b"avis") => "image/avif",
        "mp3" if data.starts_with(b"ID3") || data.first() == Some(&0xff) => "audio/mpeg",
        "wav" if data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WAVE") => "audio/wav",
        "ogg" | "opus" if data.starts_with(b"OggS") => "audio/ogg",
        "flac" if data.starts_with(b"fLaC") => "audio/flac",
        "m4a" | "aac" if branded => "audio/mp4",
        "mp4" | "m4v" if branded => "video/mp4",
        "webm" if data.starts_with(b"\x1a\x45\xdf\xa3") => "video/webm",
        "pdf" if data.windows(5).any(|part| part == b"%PDF-") => "application/pdf",
        _ => return Err("Quick Preview does not support this file signature".into()),
    };
    Ok(media)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRequest {
    capability_id: String,
    files: Vec<String>,
    format: String,
    options: Value,
}

fn editor_context(state: &AppState, request: EditorRequest, category: &str) -> Result<EditorContext, String> {
    if request.files.is_empty() || request.files.len() > 100 || !request.options.is_object() || request.options.to_string().len() > 100_000 {
        return Err("Invalid editor selection or options".into());
    }
    let capability = state.snapshot()?.capabilities.into_iter().find(|capability| capability["id"] == request.capability_id && capability["category"] == category && capability["available"] == true)
        .ok_or("Editor operation is unavailable")?;
    if capability["operation"] == "convert" { return Err("Conversion does not require an editor".into()); }
    if !capability["outputs"].as_array().is_some_and(|outputs| outputs.iter().any(|output| output == &request.format)) {
        return Err("Editor output format is unsupported".into());
    }
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for path in request.files {
        state.known_path(&path, false)?;
        let file = state.lock()?.files.iter().find(|file| file.path == path).cloned().ok_or("Inspect editor files first")?;
        if file.category != category || !capability["inputs"].as_array().is_some_and(|inputs| inputs.iter().any(|input| input == &file.ext)) {
            return Err("Editor operation does not support a selected file".into());
        }
        if !seen.insert(path) { return Err("Duplicate editor file".into()); }
        files.push(file);
    }
    Ok(EditorContext { capability, files, format: request.format, options: request.options })
}

#[tauri::command]
pub fn open_image_tool(app: AppHandle, state: State<'_, AppState>, request: EditorRequest) -> Result<Value, String> {
    let context = editor_context(&state, request, "image")?;
    state.lock()?.image_context = Some(context);
    let window = app.get_webview_window("image").ok_or("Image editor window is unavailable")?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "opened": true }))
}

#[tauri::command]
pub fn open_video_tool(app: AppHandle, state: State<'_, AppState>, request: EditorRequest) -> Result<Value, String> {
    let context = editor_context(&state, request, "video")?;
    state.lock()?.video_context = Some(context);
    let window = app.get_webview_window("video").ok_or("Video editor window is unavailable")?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "opened": true }))
}

#[tauri::command]
pub fn image_tool_context(window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<Value, String> {
    if window.label() != "image" { return Err("Image editor context is private".into()); }
    let context = state.lock()?.image_context.clone().ok_or("Image editor is no longer available")?;
    serde_json::to_value(context).map_err(|error| error.to_string())
}

#[derive(Deserialize)]
pub struct ApplyImageRequest { options: Value }

#[tauri::command]
pub fn apply_image_tool(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, request: ApplyImageRequest) -> Result<Vec<Job>, String> {
    if window.label() != "image" { return Err("Only the image editor can apply this recipe".into()); }
    if !request.options.is_object() || request.options.to_string().len() > 100_000 { return Err("Invalid image recipe".into()); }
    let context = state.lock()?.image_context.clone().ok_or("Image editor is no longer available")?;
    let mut options = context.options.as_object().cloned().ok_or("Invalid image context")?;
    options.extend(request.options.as_object().ok_or("Invalid image recipe")?.clone());
    let operation = context.capability["operation"].as_str().ok_or("Invalid image operation")?.to_string();
    let jobs = enqueue(app.clone(), state, EnqueueRequest { files: context.files, operation, format: context.format, options: Value::Object(options) })?;
    app.state::<AppState>().lock()?.image_context = None;
    window.hide().map_err(|error| error.to_string())?;
    Ok(jobs)
}

#[tauri::command]
pub fn close_image_tool(window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<bool, String> {
    if window.label() != "image" { return Err("Only the image editor can close itself".into()); }
    state.lock()?.image_context = None;
    window.hide().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn video_tool_context(window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<Value, String> {
    if window.label() != "video" { return Err("Video editor context is private".into()); }
    let context = state.lock()?.video_context.clone().ok_or("Video editor is no longer available")?;
    serde_json::to_value(context).map_err(|error| error.to_string())
}

#[derive(Deserialize)]
pub struct ApplyVideoRequest {
    format: Option<String>,
    files: Option<Vec<String>>,
    options: Value,
}

#[tauri::command]
pub fn apply_video_tool(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, request: ApplyVideoRequest) -> Result<Vec<Job>, String> {
    if window.label() != "video" { return Err("Only the video editor can apply this recipe".into()); }
    if !request.options.is_object() || request.options.to_string().len() > 100_000 { return Err("Invalid video recipe".into()); }
    let context = state.lock()?.video_context.clone().ok_or("Video editor is no longer available")?;
    let format = request.format.unwrap_or_else(|| context.format.clone());
    if !context.capability["outputs"].as_array().is_some_and(|outputs| outputs.iter().any(|output| output == &format)) {
        return Err("Unsupported video output".into());
    }
    let files = if let Some(order) = request.files {
        if order.len() != context.files.len() || order.iter().collect::<HashSet<_>>().len() != order.len() {
            return Err("Invalid video clip order".into());
        }
        order.iter().map(|path| context.files.iter().find(|file| &file.path == path).cloned().ok_or("Invalid video clip order".into())).collect::<Result<Vec<_>, String>>()?
    } else { context.files.clone() };
    let mut options = context.options.as_object().cloned().ok_or("Invalid video context")?;
    options.extend(request.options.as_object().ok_or("Invalid video recipe")?.clone());
    let operation = context.capability["operation"].as_str().ok_or("Invalid video operation")?.to_string();
    let jobs = enqueue(app.clone(), state, EnqueueRequest { files, operation, format, options: Value::Object(options) })?;
    app.state::<AppState>().lock()?.video_context = None;
    window.hide().map_err(|error| error.to_string())?;
    Ok(jobs)
}

#[tauri::command]
pub fn close_video_tool(window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<bool, String> {
    if window.label() != "video" { return Err("Only the video editor can close itself".into()); }
    state.lock()?.video_context = None;
    window.hide().map_err(|error| error.to_string())?;
    Ok(true)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalOperationRequest {
    capability_id: String,
    format: String,
    files: Vec<LocalFile>,
}

#[tauri::command]
pub fn select_global_operation(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, request: GlobalOperationRequest) -> Result<Value, String> {
    if window.label() != "wheel" { return Err("Only the wheel can select a global operation".into()); }
    let capability = state.snapshot()?.capabilities.into_iter().find(|item| item["id"] == request.capability_id && item["available"] == true)
        .ok_or("Selected operation is unavailable")?;
    let category = capability["category"].as_str().ok_or("Invalid capability")?;
    let files = request.files.iter().map(|file| file.path.clone()).collect::<Vec<_>>();
    if category == "image" || category == "video" {
        let editor = EditorRequest { capability_id: request.capability_id, files, format: request.format, options: serde_json::json!({}) };
        if category == "image" { open_image_tool(app, state, editor)?; }
        else { open_video_tool(app, state, editor)?; }
    } else {
        for file in &request.files { state.known_path(&file.path, false)?; }
        let workspace = app.get_webview_window("workspace").ok_or("Workspace window is unavailable")?;
        workspace.show().map_err(|error| error.to_string())?;
        workspace.set_focus().map_err(|error| error.to_string())?;
        app.emit_to("workspace", "santara:global-operation", &request).map_err(|error| error.to_string())?;
    }
    window.hide().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "opened": true }))
}

#[tauri::command]
pub fn finish_global_wheel(app: AppHandle, window: tauri::WebviewWindow, page: Option<String>) -> Result<(), String> {
    if window.label() != "wheel" { return Err("Only the wheel can finish itself".into()); }
    let page = page.as_deref().unwrap_or("converter");
    if !["converter", "activity", "background"].contains(&page) { return Err("Invalid workspace page".into()); }
    window.hide().map_err(|error| error.to_string())?;
    if page == "activity" {
        let workspace = app.get_webview_window("workspace").ok_or("Workspace window is unavailable")?;
        workspace.show().map_err(|error| error.to_string())?;
        workspace.set_focus().map_err(|error| error.to_string())?;
        app.emit_to("workspace", "santara:global-page", "activity").map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct FileActionRequest {
    action: String,
    files: Vec<LocalFile>,
}

#[tauri::command]
pub async fn file_action(app: AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, request: FileActionRequest) -> Result<Value, String> {
    if !["workspace", "wheel"].contains(&window.label()) { return Err("File actions are unavailable in this window".into()); }
    if request.files.is_empty() || request.files.len() > 1_000 {
        return Err("Select at least one known file".into());
    }
    let paths = request.files.iter().map(|file| state.known_path(&file.path, false)).collect::<Result<Vec<_>, _>>()?;
    match request.action.as_str() {
        "copy-path" => {
            let text = paths.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>().join("\n");
            app.clipboard().write_text(text).map_err(|error| error.to_string())?;
            Ok(serde_json::json!({ "ok": true }))
        }
        "preview" => {
            if paths.len() != 1 { return Err("Select one file to preview".into()); }
            let file = state.lock()?.files.iter().find(|file| file.path == paths[0].to_string_lossy()).cloned().ok_or("Select a known file")?;
            let label = format!("preview-{}", Uuid::new_v4());
            state.lock()?.preview_windows.insert(label.clone(), file.clone());
            let result = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html?santara-preview=1".into()))
                .title(format!("Quick Preview — {}", file.name))
                .inner_size(860.0, 640.0)
                .always_on_top(true)
                .build();
            if let Err(error) = result {
                state.forget_window(&label);
                return Err(error.to_string());
            }
            Ok(serde_json::json!({ "ok": true }))
        }
        "copy" | "move" => {
            let action = request.action.clone();
            let dialog_app = app.clone();
            let selected = tauri::async_runtime::spawn_blocking(move || dialog_app.dialog().file().blocking_pick_folder())
                .await.map_err(|error| error.to_string())?;
            let Some(selected) = selected else { return Ok(serde_json::json!({ "canceled": true })) };
            let destination = selected.into_path().map_err(|error| error.to_string())?;
            if !check_no_symlink(&destination)?.is_dir() { return Err("Choose a local directory".into()); }
            for path in &paths {
                if destination.starts_with(path) { return Err("Destination cannot be inside a selected source".into()); }
                if paths.iter().any(|other| other != path && path.starts_with(other)) {
                    return Err("Select the parent folder or its children, not both".into());
                }
            }
            let mut names = HashSet::new();
            for path in &paths {
                let name = path.file_name().ok_or("Invalid source name")?;
                if !names.insert(name.to_os_string()) || destination.join(name).exists() {
                    return Err("Destination already contains a selected name".into());
                }
            }
            let confirm_app = app.clone();
            let action_label = action.clone();
            let path_count = paths.len();
            let destination_label = destination.to_string_lossy().to_string();
            let approved = tauri::async_runtime::spawn_blocking(move || {
                confirm_app.dialog().message(format!("{} {} selected entries to {}? Existing files will not be replaced.", if action_label == "move" { "Move" } else { "Copy" }, path_count, destination_label))
                    .title("Confirm file action")
                    .kind(MessageDialogKind::Warning)
                    .buttons(MessageDialogButtons::OkCancelCustom("Continue".into(), "Cancel".into()))
                    .blocking_show()
            }).await.map_err(|error| error.to_string())?;
            if !approved { return Ok(serde_json::json!({ "canceled": true })); }
            let outcomes = tauri::async_runtime::spawn_blocking(move || {
                paths.iter().map(|source| {
                    let target = destination.join(source.file_name().ok_or("Invalid source name")?);
                    let result = copy_entry(source, &target, 0, &mut 0);
                    let result = if result.is_ok() && action == "move" { remove_source_tree(source) } else { result };
                    Ok(serde_json::json!({ "ok": result.is_ok(), "input": source.to_string_lossy(), "output": target.to_string_lossy(), "error": result.err() }))
                }).collect::<Result<Vec<Value>, String>>()
            }).await.map_err(|error| error.to_string())??;
            let ok = outcomes.iter().all(|item| item["ok"] == true);
            {
                let mut data = state.lock()?;
                for item in &outcomes {
                    if item["ok"] == true {
                        if let Some(output) = item["output"].as_str() { data.outputs.insert(PathBuf::from(output)); }
                    }
                }
            }
            Ok(serde_json::json!({ "ok": ok, "results": outcomes }))
        }
        "share" => Ok(serde_json::json!({ "ok": false, "available": false, "reason": "Native sharing is unavailable here. Use Copy path or Reveal." })),
        "terminal" => {
            if paths.len() != 1 { return Err("Select one location".into()); }
            let source = &paths[0];
            let cwd = if check_no_symlink(source)?.is_dir() { source.as_path() } else { source.parent().ok_or("Invalid location")? };
            #[cfg(target_os = "linux")]
            let child = Command::new("x-terminal-emulator").current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
            #[cfg(target_os = "windows")]
            let child = Command::new("wt.exe").args(["-d", &cwd.to_string_lossy()]).current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
            Ok(match child {
                Ok(_) => serde_json::json!({ "ok": true }),
                Err(_) => serde_json::json!({ "ok": false, "available": false, "reason": "No supported terminal is installed" }),
            })
        }
        _ => Err("Unknown file action".into()),
    }
}

fn copy_entry(source: &Path, target: &Path, depth: u8, count: &mut usize) -> Result<(), String> {
    if depth > 64 || *count >= 10_000 { return Err("Folder action limit exceeded".into()); }
    *count += 1;
    let before = check_no_symlink(source)?;
    if before.is_dir() {
        fs::create_dir(target).map_err(|error| error.to_string())?;
        let mut entries = fs::read_dir(source).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries { copy_entry(&entry.path(), &target.join(entry.file_name()), depth + 1, count)?; }
    } else {
        let mut input = File::open(source).map_err(|error| error.to_string())?;
        let mut output = OpenOptions::new().write(true).create_new(true).open(target).map_err(|error| error.to_string())?;
        std::io::copy(&mut input, &mut output).map_err(|error| error.to_string())?;
        output.sync_all().map_err(|error| error.to_string())?;
        let after = check_no_symlink(source)?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err("Source changed during the file action".into());
        }
    }
    Ok(())
}

fn remove_source_tree(path: &Path) -> Result<(), String> {
    let metadata = check_no_symlink(path)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            remove_source_tree(&entry.map_err(|error| error.to_string())?.path())?;
        }
        fs::remove_dir(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_settings_and_colliding_shortcuts() {
        assert!(validate_settings(Settings::default(), serde_json::json!({ "quality": 0 })).is_err());
        assert!(validate_settings(Settings::default(), serde_json::json!({ "outputFolder": "relative" })).is_err());
        assert!(validate_settings(Settings::default(), serde_json::json!({ "shortcuts": {
            "convert": "Shift", "tools": "Shift", "actions": "Control"
        } })).is_err());
        assert!(validate_settings(Settings::default(), serde_json::json!({ "unknown": true })).is_err());
    }

    #[test]
    fn rejects_network_and_control_character_paths() {
        assert!(checked_path("relative/file.png").is_err());
        assert!(checked_path("//server/share/file.png").is_err());
        assert!(checked_path("/tmp/bad\nfile.png").is_err());
    }

    #[test]
    fn preview_ranges_are_bounded_and_invalid_ranges_fail() {
        assert_eq!(parse_range(Some("bytes=0-"), 10_000_000).unwrap(), (0, 4 * 1024 * 1024 - 1, true));
        assert_eq!(parse_range(Some("bytes=-5"), 100).unwrap(), (95, 99, true));
        assert!(parse_range(Some("bytes=100-"), 100).is_err());
        assert!(parse_range(Some("bytes=0-1,4-5"), 100).is_err());
    }
}

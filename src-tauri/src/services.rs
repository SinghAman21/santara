use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
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
    pub jobs: Vec<Value>,
    pub settings: Settings,
    pub backends: HashMap<String, Value>,
    pub capabilities: Vec<Value>,
    pub platform: &'static str,
    pub persistence_errors: Vec<String>,
}

#[derive(Default)]
struct Data {
    files: Vec<LocalFile>,
    outputs: HashSet<PathBuf>,
    pending_drops: HashMap<String, Vec<String>>,
    settings: Settings,
    persistence_errors: Vec<String>,
}

pub struct AppState {
    data: Mutex<Data>,
    settings_file: PathBuf,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        #[cfg(unix)]
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())?;
        let settings_file = directory.join("settings.json");
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
        Ok(Self {
            data: Mutex::new(data),
            settings_file,
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Data>, String> {
        self.data.lock().map_err(|_| "Santara state is unavailable".into())
    }

    fn snapshot(&self) -> Result<Snapshot, String> {
        let data = self.lock()?;
        Ok(Snapshot {
            files: data.files.clone(),
            jobs: Vec::new(),
            settings: data.settings.clone(),
            backends: HashMap::new(),
            capabilities: Vec::new(),
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
        "jpg" | "jpeg" | "png" | "webp" | "heic" | "tiff" | "tif" | "avif" | "bmp" | "svg" => "image",
        "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aiff" | "wma" => "audio",
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "wmv" | "gif" => "video",
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

fn persist_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    let temporary = path.with_file_name(format!(".settings-{}.tmp", Uuid::new_v4()));
    let serialized = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
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
    let mut data = state.lock()?;
    if data.settings != previous { return Err("Settings changed while the dialog was open; please retry".into()); }
    persist_settings(&state.settings_file, &updated)?;
    data.settings = updated.clone();
    drop(data);
    let _ = app.emit("santara:update", serde_json::json!({ "settings": updated }));
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
pub struct FileActionRequest {
    action: String,
    files: Vec<LocalFile>,
}

#[tauri::command]
pub fn file_action(app: AppHandle, state: State<'_, AppState>, request: FileActionRequest) -> Result<Value, String> {
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
        "preview" => Err("Quick preview will be available after the Tauri preview service is implemented".into()),
        "copy" | "move" | "terminal" | "share" => Err("This file action is not implemented in the Tauri runtime yet".into()),
        _ => Err("Unknown file action".into()),
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
}

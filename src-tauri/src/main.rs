#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("Santara supports only Linux and Windows desktop targets");

mod services;
mod processing;
mod subtitles;
mod media;
mod archives;
mod pdf;
mod documents;
#[cfg(windows)]
mod windows_watcher;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    DragDropEvent, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    runtime: &'static str,
    platform: &'static str,
    shell_only: bool,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        runtime: "tauri",
        platform: if cfg!(windows) { "win32" } else { "linux" },
        shell_only: true,
    }
}

#[tauri::command]
fn shell_hide_wheel(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "wheel" {
        return Err("Only the wheel can close itself".into());
    }
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn shell_wheel_mode(state: tauri::State<'_, services::AppState>) -> Result<String, String> {
    state.wheel_mode.lock().map(|mode| mode.clone()).map_err(|_| "Wheel state is unavailable".into())
}

fn place_wheel(window: &WebviewWindow, requested: Option<(i32, i32)>) -> Result<(), String> {
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let cursor = window.cursor_position().ok();
    let point = requested.or_else(|| cursor.map(|value| (value.x.round() as i32, value.y.round() as i32)));
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    let monitor = point.and_then(|(x, y)| monitors.iter().find(|monitor| {
        let area = monitor.work_area();
        x >= area.position.x && y >= area.position.y
            && i64::from(x) < i64::from(area.position.x) + i64::from(area.size.width)
            && i64::from(y) < i64::from(area.position.y) + i64::from(area.size.height)
    }).cloned())
        .or(window.current_monitor().map_err(|error| error.to_string())?)
        .or(window.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or("No monitor is available for the wheel")?;
    let area = monitor.work_area();
    let point_x = point.map(|value| value.0).unwrap_or(area.position.x + area.size.width as i32 / 2);
    let point_y = point.map(|value| value.1).unwrap_or(area.position.y + area.size.height as i32 / 2);
    let max_x = area
        .position
        .x
        .saturating_add(area.size.width as i32)
        .saturating_sub(size.width as i32)
        .max(area.position.x);
    let max_y = area
        .position
        .y
        .saturating_add(area.size.height as i32)
        .saturating_sub(size.height as i32)
        .max(area.position.y);
    let x = (point_x - size.width as i32 / 2).clamp(area.position.x, max_x);
    let y = (point_y - size.height as i32 / 2).clamp(area.position.y, max_y);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

#[derive(Debug, PartialEq)]
struct WheelRequest {
    action: &'static str,
    mode: Option<&'static str>,
    point: Option<(i32, i32)>,
}

fn wheel_request(args: &[String]) -> Option<WheelRequest> {
    let argument = |key: &str| args.iter().find_map(|value| value.strip_prefix(key));
    let action = match argument("--santara-wheel-action=")? { "show" => "show", "hide" => "hide", _ => return None };
    let mode = match argument("--santara-global-wheel=") {
        Some("convert") => Some("convert"), Some("tools") => Some("tools"), Some("actions") => Some("actions"),
        Some("") | None if action == "hide" => None,
        _ => return None,
    };
    let point = match (argument("--santara-wheel-x="), argument("--santara-wheel-y=")) {
        (Some(x), Some(y)) => {
            let x = x.parse::<i32>().ok()?;
            let y = y.parse::<i32>().ok()?;
            Some((x, y))
        }
        (None, None) => None,
        _ => return None,
    };
    Some(WheelRequest { action, mode, point })
}

fn show_wheel(app: &tauri::AppHandle, mode: &str, point: Option<(i32, i32)>) {
    let Some(window) = app.get_webview_window("wheel") else { return };
    if ["convert", "tools", "actions"].contains(&mode) {
        if let Ok(mut current) = app.state::<services::AppState>().wheel_mode.lock() { *current = mode.into(); }
        let new_drag = !window.is_visible().unwrap_or(false);
        if let Err(error) = place_wheel(&window, point) { eprintln!("Wheel placement unavailable: {error}"); }
        let _ = window.emit("santara:wheel-mode", serde_json::json!({ "mode": mode, "newDrag": new_drag }));
        let _ = window.show();
    }
}

fn hide_wheel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("wheel") { let _ = window.hide(); }
}

fn handle_wheel_request(app: &tauri::AppHandle, args: &[String]) -> bool {
    let Some(request) = wheel_request(args) else { return false };
    if request.action == "hide" { hide_wheel(app); }
    else if let Some(mode) = request.mode { show_wheel(app, mode, request.point); }
    true
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !handle_wheel_request(app, &args) {
                if let Some(window) = app.get_webview_window("workspace") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        .register_uri_scheme_protocol("santara-media", |context, request| {
            let state = context.app_handle().state::<services::AppState>();
            state.serve_preview(context.webview_label(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            shell_hide_wheel,
            shell_wheel_mode,
            services::bootstrap,
            services::inspect_paths,
            services::consume_drop,
            services::choose_files,
            services::choose_folder,
            services::pick_output,
            services::save_settings,
            services::enqueue,
            services::cancel,
            services::retry,
            services::copy_diagnostic,
            services::image_preview,
            services::preview,
            services::preview_context,
            services::close_preview,
            services::open_image_tool,
            services::open_video_tool,
            services::image_tool_context,
            services::apply_image_tool,
            services::close_image_tool,
            services::video_tool_context,
            services::apply_video_tool,
            services::close_video_tool,
            services::select_global_operation,
            services::finish_global_wheel,
            services::reveal,
            services::open_output,
            services::file_action,
        ])
        .setup(|app| {
            let state = services::AppState::load(app.handle())?;
            app.manage(state);
            #[cfg(windows)]
            windows_watcher::start(app.handle());
            let args = std::env::args().collect::<Vec<_>>();
            if handle_wheel_request(app.handle(), &args) {
                if let Some(workspace) = app.get_webview_window("workspace") { let _ = workspace.hide(); }
            }
            let workspace = MenuItem::with_id(app, "workspace", "Show Santara", true, None::<&str>)?;
            let wheel = MenuItem::with_id(app, "wheel", "Show wheel prototype", true, None::<&str>)?;
            let image = MenuItem::with_id(app, "image", "Show image editor prototype", true, None::<&str>)?;
            let video = MenuItem::with_id(app, "video", "Show video editor prototype", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&workspace, &wheel, &image, &video, &quit])?;
            if let Some(icon) = app.default_window_icon() {
                TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("Santara Tauri shell")
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        if event.id().as_ref() == "quit" {
                            app.exit(0);
                        } else if let Some(window) = app.get_webview_window(event.id().as_ref()) {
                            if window.label() == "wheel" {
                                if let Err(error) = place_wheel(&window, None) {
                                    eprintln!("Santara shell wheel placement unavailable: {error}");
                                }
                            }
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if !window.label().starts_with("preview-") {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Destroyed => {
                    window.app_handle().state::<services::AppState>().forget_window(window.label());
                }
                WindowEvent::DragDrop(DragDropEvent::Enter { paths, .. }) => {
                    eprintln!("Santara shell drag entered {} ({} entries)", window.label(), paths.len());
                }
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    let app = window.app_handle();
                    let state = app.state::<services::AppState>();
                    if let Err(error) = state.record_drop(window.label(), paths) {
                        eprintln!("Santara drop rejected: {error}");
                    } else {
                        let _ = window.emit("santara:native-drop", ());
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Leave) => {
                    eprintln!("Santara shell drag left {}", window.label());
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("Santara Tauri shell failed to build")
        .run(|_app, event| {
            #[cfg(windows)]
            if matches!(event, tauri::RunEvent::Exit) { windows_watcher::stop(_app); }
            #[cfg(not(windows))]
            let _ = event;
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_bounded_wheel_commands() {
        let args = vec!["santara".into(), "--santara-wheel-action=show".into(), "--santara-global-wheel=tools".into(), "--santara-wheel-x=-120".into(), "--santara-wheel-y=250".into()];
        assert_eq!(wheel_request(&args), Some(WheelRequest { action: "show", mode: Some("tools"), point: Some((-120, 250)) }));
        assert!(wheel_request(&["--santara-wheel-action=show".into(), "--santara-global-wheel=unknown".into()]).is_none());
        assert_eq!(wheel_request(&["--santara-wheel-action=hide".into(), "--santara-global-wheel=".into()]).unwrap().action, "hide");
    }
}

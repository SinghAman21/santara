#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("Santara supports only Linux and Windows desktop targets");

mod services;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    DragDropEvent, Manager, PhysicalPosition, WebviewWindow, WindowEvent,
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

fn place_wheel(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or("No monitor is available for the wheel")?;
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let cursor = window.cursor_position().ok();
    let point_x = cursor
        .map(|point| point.x.round() as i32)
        .unwrap_or(area.position.x + area.size.width as i32 / 2);
    let point_y = cursor
        .map(|point| point.y.round() as i32)
        .unwrap_or(area.position.y + area.size.height as i32 / 2);
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            shell_hide_wheel,
            services::bootstrap,
            services::inspect_paths,
            services::consume_drop,
            services::choose_files,
            services::choose_folder,
            services::pick_output,
            services::save_settings,
            services::reveal,
            services::open_output,
            services::file_action,
        ])
        .setup(|app| {
            let state = services::AppState::load(app.handle())?;
            app.manage(state);
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
                                if let Err(error) = place_wheel(&window) {
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
                    api.prevent_close();
                    let _ = window.hide();
                }
                WindowEvent::DragDrop(DragDropEvent::Enter { paths, .. }) => {
                    eprintln!("Santara shell drag entered {} ({} entries)", window.label(), paths.len());
                }
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    let app = window.app_handle();
                    let state = app.state::<services::AppState>();
                    if let Err(error) = state.record_drop(window.label(), paths) {
                        eprintln!("Santara drop rejected: {error}");
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Leave) => {
                    eprintln!("Santara shell drag left {}", window.label());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("Santara Tauri shell failed to start");
}

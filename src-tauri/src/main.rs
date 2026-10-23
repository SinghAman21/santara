#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("Santara supports only Linux and Windows desktop targets");

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info])
        .setup(|app| {
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
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Santara Tauri shell failed to start");
}

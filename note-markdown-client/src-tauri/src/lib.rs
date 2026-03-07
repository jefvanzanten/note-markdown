pub mod commands;

use std::sync::Mutex;

use note_core::{
    infra::fs::{session_root_for, StdFileSystem},
    services::app_service::AppService,
};
use tauri::Manager;

pub struct AppState {
    pub service: Mutex<AppService>,
}

pub fn run() {
    let root = session_root_for("note-markdown");
    let service =
        AppService::new(root, Box::<StdFileSystem>::default()).expect("app service should initialize");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            service: Mutex::new(service),
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_restore_session,
            commands::new_note,
            commands::open_file,
            commands::update_tab_content,
            commands::save_tab,
            commands::save_tab_as,
            commands::close_tab,
            commands::persist_session,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<AppState>();
                if let Ok(mut service) = state.service.lock() {
                    let _ = service.persist_session();
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

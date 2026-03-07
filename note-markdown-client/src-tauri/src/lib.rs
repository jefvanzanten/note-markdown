pub fn run() {
    note_tauri_commands::run_app(tauri::generate_context!(), "note-markdown");
}

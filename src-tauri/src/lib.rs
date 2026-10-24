#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save dialogs. Picked paths are added to the fs scope.
        .plugin(tauri_plugin_dialog::init())
        // Reads and writes the files the user picked.
        .plugin(tauri_plugin_fs::init())
        // Copies exports as text. WebKit can refuse navigator.clipboard once
        // the click that asked for the copy has gone async.
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running Domain Modeler");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save dialogs. Picked paths are added to the fs scope.
        .plugin(tauri_plugin_dialog::init())
        // Reads and writes the files the user picked.
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Domain Modeler");
}

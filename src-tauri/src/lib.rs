/// Returns the OS-level user name (e.g. "lleejr") so the frontend can use
/// it as the default value for the merge-stamp "operator" field. Reads
/// $USER on macOS/Linux, $USERNAME on Windows; returns an empty string if
/// both are missing (rare; the user can type their own).
#[tauri::command]
fn get_os_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_os_username])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

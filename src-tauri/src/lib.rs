mod auto_upload;
mod claude_wrapper;
mod commands;
mod state;
mod types;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_status,
            commands::get_usage_data,
            commands::upload_now,
            commands::get_logs,
        ])
        .setup(|app| {
            let state = app.state::<AppState>();
            auto_upload::start_auto_upload(&state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

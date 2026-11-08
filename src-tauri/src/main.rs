// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new("com.antigravity.historymanager")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            #[link(name = "shell32")]
            extern "system" {
                fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
            }
            let _ = SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
        }
    }

    app_lib::run();
}

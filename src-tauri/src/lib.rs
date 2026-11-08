use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use regex::Regex;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Windows CREATE_NO_WINDOW flag
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn default_true() -> bool {
    true
}

fn default_volume() -> u32 {
    80
}

// ============================================================================
//  DATA TYPES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvStatus {
    pub aghistory_found: bool,
    pub aghistory_path: String,
    pub aghistory_status: String,
    pub antigravity_dir: String,
    pub antigravity_found: bool,
    pub db_files_count: usize,
    pub summaries_db_path: String,
    pub summaries_db_exists: bool,
    pub is_demo: bool,
    pub status_code: String, // "connected", "db_only", "cli_missing", "antigravity_missing", "demo"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationItem {
    pub cascade_id: String,
    pub title: String,
    pub step_count: i64,
    pub last_modified: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOptions {
    pub cmd_type: String, // "list", "export", "recover", "info"
    pub chat_id: Option<String>,
    pub chat_ids: Option<Vec<String>>,
    pub output_dir: Option<String>,
    pub format: Option<String>, // "all", "md", "json"
    #[serde(default = "default_true")]
    pub organize_folders: bool,
    pub thinking: bool,
    pub full: bool,
    pub today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputPayload {
    pub text: String,
    pub tag: String, // "info", "success", "warning", "error", "normal"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinishedPayload {
    pub cmd_type: String,
    pub code: i32,
    pub success: bool,
    pub exported_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub export_dir: String,
    pub format: String,
    #[serde(default = "default_true")]
    pub organize_folders: bool,
    pub thinking: bool,
    pub full: bool,
    pub today: bool,
    pub language: String, // "ru" or "en" or "system"
    #[serde(default = "default_true")]
    pub sound_enabled: bool,
    #[serde(default = "default_volume")]
    pub sound_volume: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_export = get_userprofile_dir()
            .join("Desktop")
            .join("antigravity_export")
            .to_string_lossy()
            .to_string();

        Self {
            export_dir: default_export,
            format: "all".to_string(),
            organize_folders: true,
            thinking: true,
            full: false,
            today: false,
            language: "system".to_string(),
            sound_enabled: true,
            sound_volume: 80,
        }
    }
}

pub struct AppState {
    pub active_pid: Arc<Mutex<Option<u32>>>,
    pub is_running_flag: Arc<Mutex<bool>>,
}

// ============================================================================
//  HELPER FUNCTIONS & IPC LOGGER
// ============================================================================

fn is_demo_mode() -> bool {
    std::env::var("AGH_DEMO")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn get_data_dir(app: Option<&AppHandle>) -> PathBuf {
    if let Ok(dir_str) = std::env::var("AGH_DATA_DIR") {
        let p = PathBuf::from(dir_str);
        if !p.as_os_str().is_empty() {
            let _ = fs::create_dir_all(&p);
            return p;
        }
    }
    if let Some(h) = app {
        if let Ok(p) = h.path().app_data_dir() {
            let _ = fs::create_dir_all(&p);
            return p;
        }
    }
    PathBuf::from("data")
}

fn log_ipc(app: Option<&AppHandle>, cmd_name: &str, args_json: &str, result_desc: &str) {
    let now = chrono_now_string();
    let line = format!("[{}] [{}] args: {} -> {}\n", now, cmd_name, args_json, result_desc);
    let log_path = get_data_dir(app).join("ipc.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = f.write_all(line.as_bytes());
    }
}

fn chrono_now_string() -> String {
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    let s_day = secs % 86400;
    let h = s_day / 3600;
    let m = (s_day % 3600) / 60;
    let s = s_day % 60;
    format!("{:02}:{:02}:{:02}.{:03}Z", h, m, s, duration.subsec_millis())
}

fn get_userprofile_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile);
        if p.is_dir() {
            return p;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home);
        if p.is_dir() {
            return p;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn get_antigravity_dir() -> PathBuf {
    get_userprofile_dir().join(".gemini").join("antigravity")
}

fn find_aghistory_executable() -> (Option<String>, String) {
    // 0. Environment variable override
    if let Ok(custom) = std::env::var("AGH_CLI_PATH") {
        let p = PathBuf::from(&custom);
        if p.is_file() {
            return (Some(custom), "env:AGH_CLI_PATH".to_string());
        }
    }

    // 0.1 Check bundled sidecar beside current executable (portable or installed)
    if let Ok(cur_exe) = std::env::current_exe() {
        if let Some(parent) = cur_exe.parent() {
            let candidates = [
                parent.join("aghistory.exe"),
                parent.join("aghistory-x86_64-pc-windows-msvc.exe"),
                parent.join("binaries").join("aghistory-x86_64-pc-windows-msvc.exe"),
            ];
            for cand in &candidates {
                if cand.is_file() {
                    return (Some(cand.to_string_lossy().to_string()), "bundled sidecar".to_string());
                }
            }
        }
    }

    // 0.2 Check in current working directory / src-tauri/binaries
    if let Ok(cur_dir) = std::env::current_dir() {
        let candidates = [
            cur_dir.join("aghistory.exe"),
            cur_dir.join("binaries").join("aghistory-x86_64-pc-windows-msvc.exe"),
            cur_dir.join("src-tauri").join("binaries").join("aghistory-x86_64-pc-windows-msvc.exe"),
        ];
        for cand in &candidates {
            if cand.is_file() {
                return (Some(cand.to_string_lossy().to_string()), "bundled sidecar".to_string());
            }
        }
    }

    // 1. Check system PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let exe = dir.join("aghistory.exe");
            if exe.is_file() {
                return (Some(exe.to_string_lossy().to_string()), "PATH".to_string());
            }
            let plain = dir.join("aghistory");
            if plain.is_file() {
                return (Some(plain.to_string_lossy().to_string()), "PATH".to_string());
            }
        }
    }

    // 2. Check LOCALAPPDATA / Python Scripts folders
    let mut check_dirs = Vec::new();
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        check_dirs.push(PathBuf::from(local_app));
    }
    let userprofile = get_userprofile_dir();
    check_dirs.push(userprofile.join("AppData").join("Local"));

    for base in check_dirs {
        let p314 = base
            .join("Python")
            .join("pythoncore-3.14-64")
            .join("Scripts")
            .join("aghistory.exe");
        if p314.is_file() {
            return (Some(p314.to_string_lossy().to_string()), "Python 3.14 Scripts".to_string());
        }

        // Glob Python/*/Scripts/aghistory.exe
        let py_base = base.join("Python");
        if py_base.is_dir() {
            if let Ok(entries) = fs::read_dir(&py_base) {
                for e in entries.flatten() {
                    let cand = e.path().join("Scripts").join("aghistory.exe");
                    if cand.is_file() {
                        return (Some(cand.to_string_lossy().to_string()), format!("{}", e.file_name().to_string_lossy()));
                    }
                }
            }
        }

        // Glob Programs/Python/*/Scripts/aghistory.exe
        let prog_base = base.join("Programs").join("Python");
        if prog_base.is_dir() {
            if let Ok(entries) = fs::read_dir(&prog_base) {
                for e in entries.flatten() {
                    let cand = e.path().join("Scripts").join("aghistory.exe");
                    if cand.is_file() {
                        return (Some(cand.to_string_lossy().to_string()), format!("Programs/{}", e.file_name().to_string_lossy()));
                    }
                }
            }
        }
    }

    // 3. Fallback: python executable with antigravity_history module
    let p314_py = get_userprofile_dir()
        .join("AppData")
        .join("Local")
        .join("Python")
        .join("pythoncore-3.14-64")
        .join("python.exe");
    if p314_py.is_file() {
        return (Some(p314_py.to_string_lossy().to_string()), "python_module".to_string());
    }

    (None, "not_found".to_string())
}

fn decode_bytes_lossy(bytes: &[u8]) -> String {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    let (cow, _, had_errors) = encoding_rs::WINDOWS_1251.decode(bytes);
    if !had_errors {
        return cow.into_owned();
    }
    let (cow, _, had_errors) = encoding_rs::IBM866.decode(bytes);
    if !had_errors {
        return cow.into_owned();
    }
    String::from_utf8_lossy(bytes).into_owned()
}

fn classify_log_line(text: &str) -> &'static str {
    let lower = text.to_lowercase();
    if lower.contains("error") || lower.contains("traceback") || lower.contains("failed") || lower.contains("cannot connect") || lower.contains("ошибка") {
        "error"
    } else if lower.contains("complete") || lower.contains("connected") || lower.contains("found") || text.contains('✓') || lower.contains("успешно") || lower.contains("[ok]") {
        "success"
    } else if lower.contains("warning") || text.contains("[!]") || lower.contains("внимание") {
        "warning"
    } else if lower.contains("discovering") || lower.contains("exporting") || lower.contains("scanning") || lower.contains("экспорт") {
        "info"
    } else {
        "normal"
    }
}

// ============================================================================
//  DEMO DATA GENERATOR
// ============================================================================

fn get_demo_conversations() -> Vec<ConversationItem> {
    vec![
        ConversationItem {
            cascade_id: "00000000-0000-0000-0000-000000000001".to_string(),
            title: "Разработка CLI на Rust".to_string(),
            step_count: 342,
            last_modified: "2026-11-08 09:15:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "00000001-1111-2222-3333-444444444444".to_string(),
            title: "Без названия".to_string(),
            step_count: 55,
            last_modified: "2026-11-08 08:30:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "00000002-1111-2222-3333-444444444444".to_string(),
            title: "Дублирующийся чат".to_string(),
            step_count: 120,
            last_modified: "2026-11-07 19:45:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "00000003-1111-2222-3333-444444444444".to_string(),
            title: "Дублирующийся чат".to_string(),
            step_count: 230,
            last_modified: "2026-11-07 16:20:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "00000004-1111-2222-3333-444444444444".to_string(),
            title: "Что: как? / зачем".to_string(),
            step_count: 88,
            last_modified: "2026-11-07 14:10:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "00000005-1111-2222-3333-444444444444".to_string(),
            title: "CON".to_string(),
            step_count: 42,
            last_modified: "2026-11-06 21:05:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "a7b8c9d0-e1f2-4307-e501-23456789abcd".to_string(),
            title: "Docker Swarm Deployment Config".to_string(),
            step_count: 94,
            last_modified: "2026-11-06 17:30:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "b8c9d0e1-f2a3-4408-f612-3456789abcde".to_string(),
            title: "Оптимизация производительности бэкенда".to_string(),
            step_count: 360,
            last_modified: "2026-11-06 12:40:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "c9d0e1f2-a3b4-4509-0723-456789abcdef".to_string(),
            title: "GraphQL API Schema Design".to_string(),
            step_count: 167,
            last_modified: "2026-11-05 18:22:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "d0e1f2a3-b4c5-460a-1834-56789abcdef0".to_string(),
            title: "Настройка мониторинга Prometheus".to_string(),
            step_count: 83,
            last_modified: "2026-11-05 15:50:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "e1f2a3b4-c5d6-470b-2945-6789abcdef01".to_string(),
            title: "Security Audit & Vulnerability Fixes".to_string(),
            step_count: 220,
            last_modified: "2026-11-04 11:15:00".to_string(),
            source: "demo".to_string(),
        },
        ConversationItem {
            cascade_id: "f2a3b4c5-d6e7-480c-3a56-789abcdef012".to_string(),
            title: "Анализ логов и метрик производительности".to_string(),
            step_count: 145,
            last_modified: "2026-11-03 20:30:00".to_string(),
            source: "demo".to_string(),
        },
    ]
}

// ============================================================================
//  TAURI COMMANDS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn get_env_status(app: AppHandle) -> Result<EnvStatus, String> {
    if is_demo_mode() {
        let res = EnvStatus {
            aghistory_found: true,
            aghistory_path: "demo".to_string(),
            aghistory_status: "demo".to_string(),
            antigravity_dir: "demo".to_string(),
            antigravity_found: true,
            db_files_count: 12,
            summaries_db_path: "demo".to_string(),
            summaries_db_exists: true,
            is_demo: true,
            status_code: "demo".to_string(),
        };
        log_ipc(Some(&app), "get_env_status", "{}", "OK(demo mode)");
        return Ok(res);
    }

    let (exe_opt, status) = find_aghistory_executable();
    let base = get_antigravity_dir();
    let base_exists = base.is_dir();

    let summaries_db = base.join("conversation_summaries.db");
    let summaries_exists = summaries_db.is_file();

    let conv_dir = base.join("conversations");
    let mut db_count = 0;
    if conv_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(conv_dir) {
            db_count = entries
                .flatten()
                .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("db"))
                .count();
        }
    }

    let cli_found = exe_opt.is_some();
    let status_code = if !cli_found {
        "cli_missing".to_string()
    } else if !base_exists && db_count == 0 {
        "antigravity_missing".to_string()
    } else {
        // We consider it connected or db_only depending on server check
        "connected".to_string()
    };

    let result = EnvStatus {
        aghistory_found: cli_found,
        aghistory_path: exe_opt.unwrap_or_default(),
        aghistory_status: status,
        antigravity_dir: base.to_string_lossy().to_string(),
        antigravity_found: base_exists,
        db_files_count: db_count,
        summaries_db_path: summaries_db.to_string_lossy().to_string(),
        summaries_db_exists: summaries_exists,
        is_demo: false,
        status_code,
    };

    log_ipc(
        Some(&app),
        "get_env_status",
        "{}",
        &format!("OK(found: {}, dbs: {}, status: {})", result.aghistory_found, result.db_files_count, result.status_code),
    );
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
fn get_conversations_db(app: AppHandle) -> Result<Vec<ConversationItem>, String> {
    if is_demo_mode() {
        let items = get_demo_conversations();
        log_ipc(Some(&app), "get_conversations_db", "{}", "OK(demo 12 items)");
        return Ok(items);
    }

    let db_path = get_antigravity_dir().join("conversation_summaries.db");
    if !db_path.is_file() {
        log_ipc(Some(&app), "get_conversations_db", "{}", "OK(empty, file not found)");
        return Ok(Vec::new());
    }

    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| {
            let err = format!("ERR_DB_OPEN: {}", e);
            log_ipc(Some(&app), "get_conversations_db", "{}", &err);
            err
        })?;

    let mut stmt = conn
        .prepare(
            "SELECT conversation_id, title, step_count, last_modified_time 
             FROM conversation_summaries 
             ORDER BY last_modified_time DESC",
        )
        .map_err(|e| {
            let err = format!("ERR_SQL_PREPARE: {}", e);
            log_ipc(Some(&app), "get_conversations_db", "{}", &err);
            err
        })?;

    let rows = stmt
        .query_map([], |row| {
            let cid: String = row.get(0).unwrap_or_default();
            let title: String = row.get(1).unwrap_or_else(|_| "".to_string());
            let step_count: i64 = row.get(2).unwrap_or(0);
            let raw_date: String = row.get(3).unwrap_or_default();
            let formatted_date = raw_date.replace('T', " ").chars().take(19).collect::<String>();

            Ok(ConversationItem {
                cascade_id: cid,
                title: title.trim().to_string(),
                step_count,
                last_modified: formatted_date,
                source: "sqlite".to_string(),
            })
        })
        .map_err(|e| {
            let err = format!("ERR_SQL_QUERY: {}", e);
            log_ipc(Some(&app), "get_conversations_db", "{}", &err);
            err
        })?;

    let mut list = Vec::new();
    for r in rows.flatten() {
        list.push(r);
    }

    log_ipc(Some(&app), "get_conversations_db", "{}", &format!("OK({} items)", list.len()));
    Ok(list)
}

#[tauri::command(rename_all = "snake_case")]
fn pick_export_directory(app: AppHandle, current_dir: Option<String>) -> Result<Option<String>, String> {
    let args_str = format!("current_dir={:?}", current_dir);
    let mut dialog = rfd::FileDialog::new();
    if let Some(dir) = current_dir {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            dialog = dialog.set_directory(p);
        }
    }

    let picked = dialog.pick_folder();
    let res_str = picked.as_ref().map(|p| p.to_string_lossy().to_string());
    log_ipc(Some(&app), "pick_export_directory", &args_str, &format!("OK({:?})", res_str));
    Ok(res_str)
}

#[tauri::command(rename_all = "snake_case")]
fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    let args_str = format!("path={}", path);
    let p = PathBuf::from(&path);
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| {
                let err = format!("ERR_OPEN_FOLDER: {}", e);
                log_ipc(Some(&app), "open_folder", &args_str, &err);
                err
            })?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| {
                let err = format!("ERR_OPEN_FOLDER: {}", e);
                log_ipc(Some(&app), "open_folder", &args_str, &err);
                err
            })?;
    }
    log_ipc(Some(&app), "open_folder", &args_str, "OK");
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn reveal_db_file(app: AppHandle, chat_id: String) -> Result<(), String> {
    let args_str = format!("chat_id={}", chat_id);
    let target = get_antigravity_dir().join("conversations").join(format!("{}.db", chat_id));
    if !target.is_file() {
        let err = format!("ERR_DB_FILE_NOT_FOUND: {}.db", chat_id);
        log_ipc(Some(&app), "reveal_db_file", &args_str, &err);
        return Err(err);
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,\"{}\"", target.to_string_lossy()))
            .spawn()
            .map_err(|e| {
                let err = format!("ERR_EXPLORER: {}", e);
                log_ipc(Some(&app), "reveal_db_file", &args_str, &err);
                err
            })?;
    }
    log_ipc(Some(&app), "reveal_db_file", &args_str, "OK");
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn stop_running_command(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut lock = state.active_pid.lock().unwrap();
    let mut run_lock = state.is_running_flag.lock().unwrap();
    *run_lock = false;

    if let Some(pid) = *lock {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/T", "/F", "/PID", &pid.to_string()]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.status();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
        }
        *lock = None;
        log_ipc(Some(&app), "stop_running_command", "{}", &format!("OK(PID {} killed)", pid));
        return Ok(());
    }
    log_ipc(Some(&app), "stop_running_command", "{}", "OK(no active PID)");
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let settings_file = get_data_dir(Some(&app)).join("settings.json");
    if settings_file.is_file() {
        if let Ok(content) = fs::read_to_string(&settings_file) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                log_ipc(Some(&app), "load_settings", "{}", "OK");
                return Ok(settings);
            }
        }
    }
    let default_val = AppSettings::default();
    log_ipc(Some(&app), "load_settings", "{}", "OK(default)");
    Ok(default_val)
}

#[tauri::command(rename_all = "snake_case")]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let args_str = serde_json::to_string(&settings).unwrap_or_default();
    let data_dir = get_data_dir(Some(&app));
    let settings_file = data_dir.join("settings.json");

    let json_text = serde_json::to_string_pretty(&settings)
        .map_err(|e| {
            let err = format!("ERR_SETTINGS_SERIALIZE: {}", e);
            log_ipc(Some(&app), "save_settings", &args_str, &err);
            err
        })?;

    fs::write(settings_file, json_text)
        .map_err(|e| {
            let err = format!("ERR_SETTINGS_WRITE: {}", e);
            log_ipc(Some(&app), "save_settings", &args_str, &err);
            err
        })?;

    log_ipc(Some(&app), "save_settings", &args_str, "OK");
    Ok(())
}

// ============================================================================
//  EXPORT ORGANIZATION & WINDOWS SANITIZATION
// ============================================================================

#[cfg(target_os = "windows")]
fn get_system_date_time() -> String {
    use std::mem::MaybeUninit;
    #[repr(C)]
    #[allow(non_snake_case)]
    struct SYSTEMTIME {
        wYear: u16,
        wMonth: u16,
        wDayOfWeek: u16,
        wDay: u16,
        wHour: u16,
        wMinute: u16,
        wSecond: u16,
        wMilliseconds: u16,
    }
    extern "system" {
        fn GetLocalTime(lpSystemTime: *mut SYSTEMTIME);
    }
    unsafe {
        let mut st = MaybeUninit::<SYSTEMTIME>::uninit();
        GetLocalTime(st.as_mut_ptr());
        let st = st.assume_init();
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond
        )
    }
}

#[cfg(not(target_os = "windows"))]
fn get_system_date_time() -> String {
    chrono_now_string()
}

pub fn sanitize_windows_title(raw_title: &str, short_id: &str) -> String {
    let trimmed = raw_title.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("Без названия")
        || trimmed.eq_ignore_ascii_case("Untitled")
    {
        return format!("Без названия [{}]", short_id);
    }

    // Strip forbidden characters: \ / : * ? " < > | and ASCII control characters (0..=31)
    let sanitized: String = trimmed
        .chars()
        .filter(|&c| {
            !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') && (c as u32 >= 32)
        })
        .collect();

    // Collapse multiple whitespace
    let mut collapsed = String::with_capacity(sanitized.len());
    let mut prev_space = false;
    for c in sanitized.chars() {
        if c.is_whitespace() {
            if !prev_space {
                collapsed.push(' ');
                prev_space = true;
            }
        } else {
            collapsed.push(c);
            prev_space = false;
        }
    }

    // Trim trailing spaces and dots
    let mut clean = collapsed.trim_end_matches(|c| c == ' ' || c == '.').trim().to_string();

    if clean.is_empty()
        || clean.eq_ignore_ascii_case("Без названия")
        || clean.eq_ignore_ascii_case("Untitled")
    {
        return format!("Без названия [{}]", short_id);
    }

    // Check Windows reserved device names
    let upper = clean.to_ascii_uppercase();
    let is_reserved = matches!(
        upper.as_str(),
        "CON" | "PRN" | "AUX" | "NUL"
            | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9"
            | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9"
    );

    if is_reserved {
        clean = format!("{}_chat", clean);
    }

    // Truncate to at most 80 Unicode characters
    if clean.chars().count() > 80 {
        clean = clean.chars().take(80).collect();
        clean = clean.trim_end_matches(|c| c == ' ' || c == '.').trim().to_string();
    }

    if clean.is_empty() {
        return format!("Без названия [{}]", short_id);
    }

    clean
}

#[derive(Debug, Clone)]
struct StagedChatInfo {
    cascade_id: String,
    title: String,
    md_file: Option<PathBuf>,
    json_file: Option<PathBuf>,
}

fn organize_export_files(
    out_dir: &Path,
    staging_dir: &Path,
    organize_folders: bool,
) -> Result<usize, String> {
    let mut staged_chats: Vec<StagedChatInfo> = Vec::new();
    let mut staged_by_id: HashMap<String, usize> = HashMap::new();

    // 1. Read conversations_export.json if it exists in staging_dir
    let global_json_path = staging_dir.join("conversations_export.json");
    if global_json_path.is_file() {
        if let Ok(content) = fs::read_to_string(&global_json_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(arr) = parsed.as_array() {
                    for item in arr {
                        let id = item.get("cascade_id")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("id").and_then(|v| v.as_str()))
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        let title = item.get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_string();

                        if !id.is_empty() && !staged_by_id.contains_key(&id) {
                            let idx = staged_chats.len();
                            staged_by_id.insert(id.clone(), idx);
                            staged_chats.push(StagedChatInfo {
                                cascade_id: id,
                                title,
                                md_file: None,
                                json_file: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // 2. Scan all files in staging_dir to associate .md and .json files with conversations
    let id_in_md_re = Regex::new(r"(?i)Cascade\s+ID[^\w\n]*:\s*`?([a-f0-9\-]+)`?").unwrap();
    let title_in_md_re = Regex::new(r"(?m)^#\s+(.*?)\s*$").unwrap();

    if let Ok(entries) = fs::read_dir(staging_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == "conversations_export.json" || file_name == "export_report.txt" {
                continue;
            }

            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if ext == "md" {
                let content = fs::read_to_string(&path).unwrap_or_default();
                let file_id = id_in_md_re.captures(&content)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().trim().to_string());

                if let Some(id) = file_id {
                    if let Some(&idx) = staged_by_id.get(&id) {
                        staged_chats[idx].md_file = Some(path.clone());
                    } else {
                        let title = title_in_md_re.captures(&content)
                            .and_then(|c| c.get(1))
                            .map(|m| m.as_str().trim().to_string())
                            .unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());

                        let idx = staged_chats.len();
                        staged_by_id.insert(id.clone(), idx);
                        staged_chats.push(StagedChatInfo {
                            cascade_id: id,
                            title,
                            md_file: Some(path.clone()),
                            json_file: None,
                        });
                    }
                }
            } else if ext == "json" {
                let content = fs::read_to_string(&path).unwrap_or_default();
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let file_id = val.get("cascade_id")
                        .and_then(|v| v.as_str())
                        .or_else(|| val.get("id").and_then(|v| v.as_str()))
                        .map(|s| s.trim().to_string());

                    if let Some(id) = file_id {
                        let title = val.get("title")
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim().to_string())
                            .unwrap_or_default();

                        if let Some(&idx) = staged_by_id.get(&id) {
                            staged_chats[idx].json_file = Some(path.clone());
                            if staged_chats[idx].title.is_empty() && !title.is_empty() {
                                staged_chats[idx].title = title;
                            }
                        } else {
                            let idx = staged_chats.len();
                            staged_by_id.insert(id.clone(), idx);
                            staged_chats.push(StagedChatInfo {
                                cascade_id: id,
                                title: if title.is_empty() { path.file_stem().unwrap_or_default().to_string_lossy().to_string() } else { title },
                                md_file: None,
                                json_file: Some(path.clone()),
                            });
                        }
                    }
                }
            }
        }
    }

    // Ensure out_dir exists
    let _ = fs::create_dir_all(out_dir);

    // Rule 5: Ensure root conversations_export.json is deleted if exists
    let root_global_json = out_dir.join("conversations_export.json");
    if root_global_json.exists() {
        let _ = fs::remove_file(&root_global_json);
    }

    let mut report_entries: Vec<(String, String, Vec<String>, String)> = Vec::new();

    if organize_folders {
        // --- ORGANIZED BY FOLDERS ---
        // A. Index existing folders in out_dir by their .chat_id
        let mut existing_folder_by_id: HashMap<String, PathBuf> = HashMap::new();
        let mut reserved_names: HashSet<String> = HashSet::new();

        if let Ok(entries) = fs::read_dir(out_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if dir_name.starts_with('.') {
                        continue;
                    }
                    let chat_id_file = p.join(".chat_id");
                    if chat_id_file.is_file() {
                        if let Ok(id_content) = fs::read_to_string(&chat_id_file) {
                            let trimmed_id = id_content.trim().to_string();
                            if !trimmed_id.is_empty() {
                                existing_folder_by_id.insert(trimmed_id, p.clone());
                            }
                        }
                    }
                    reserved_names.insert(dir_name);
                }
            }
        }

        // B. Process each staged chat
        let mut allocated_this_batch: HashSet<String> = HashSet::new();

        for chat in &staged_chats {
            let short_id = if chat.cascade_id.len() >= 8 {
                &chat.cascade_id[..8]
            } else {
                &chat.cascade_id
            };

            let base_name = sanitize_windows_title(&chat.title, short_id);

            // Check if this chat already had a folder on disk
            let old_folder_path = existing_folder_by_id.get(&chat.cascade_id).cloned();
            let old_folder_name = old_folder_path.as_ref().and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()));

            // Determine target folder name
            let mut final_folder_name = base_name.clone();

            // Collision check:
            // Does another chat already use base_name?
            let collision = allocated_this_batch.contains(&final_folder_name)
                || (reserved_names.contains(&final_folder_name) && old_folder_name.as_deref() != Some(&final_folder_name));

            if collision {
                final_folder_name = format!("{} [{}]", base_name, short_id);
            }

            let target_folder_path = out_dir.join(&final_folder_name);

            // Handle rename: If old folder had a different name, rename it to target_folder_path
            if let Some(old_p) = &old_folder_path {
                if old_p != &target_folder_path {
                    if !target_folder_path.exists() {
                        let _ = fs::rename(old_p, &target_folder_path);
                    }
                }
            }

            let _ = fs::create_dir_all(&target_folder_path);
            allocated_this_batch.insert(final_folder_name.clone());
            reserved_names.insert(final_folder_name.clone());

            // Write / update .chat_id
            let _ = fs::write(target_folder_path.join(".chat_id"), &chat.cascade_id);

            let mut files_saved = Vec::new();

            // Move / overwrite Markdown file
            if let Some(src_md) = &chat.md_file {
                let dst_md = target_folder_path.join(format!("{}.md", final_folder_name));
                if dst_md.exists() {
                    let _ = fs::remove_file(&dst_md);
                }
                if fs::rename(src_md, &dst_md).is_err() {
                    let _ = fs::copy(src_md, &dst_md);
                    let _ = fs::remove_file(src_md);
                }
                // Clean up any other .md in target folder
                if let Ok(entries) = fs::read_dir(&target_folder_path) {
                    for e in entries.flatten() {
                        let ep = e.path();
                        if ep.is_file() && ep.extension().map(|x| x == "md").unwrap_or(false) && ep != dst_md {
                            let _ = fs::remove_file(ep);
                        }
                    }
                }
                files_saved.push(format!("{}/{}.md", final_folder_name, final_folder_name));
            }

            // Move / overwrite JSON file
            if let Some(src_json) = &chat.json_file {
                let dst_json = target_folder_path.join(format!("{}.json", final_folder_name));
                if dst_json.exists() {
                    let _ = fs::remove_file(&dst_json);
                }
                if fs::rename(src_json, &dst_json).is_err() {
                    let _ = fs::copy(src_json, &dst_json);
                    let _ = fs::remove_file(src_json);
                }
                // Clean up any other .json in target folder
                if let Ok(entries) = fs::read_dir(&target_folder_path) {
                    for e in entries.flatten() {
                        let ep = e.path();
                        if ep.is_file() && ep.extension().map(|x| x == "json").unwrap_or(false) && ep != dst_json {
                            let _ = fs::remove_file(ep);
                        }
                    }
                }
                files_saved.push(format!("{}/{}.json", final_folder_name, final_folder_name));
            }

            report_entries.push((
                chat.title.clone(),
                final_folder_name.clone(),
                files_saved,
                chat.cascade_id.clone(),
            ));
        }
    } else {
        // --- FLAT EXPORT (organize_folders == false) ---
        let mut allocated_names: HashSet<String> = HashSet::new();

        for chat in &staged_chats {
            let short_id = if chat.cascade_id.len() >= 8 {
                &chat.cascade_id[..8]
            } else {
                &chat.cascade_id
            };

            let base_name = sanitize_windows_title(&chat.title, short_id);
            let mut final_name = base_name.clone();

            if allocated_names.contains(&final_name) {
                final_name = format!("{} [{}]", base_name, short_id);
            }
            allocated_names.insert(final_name.clone());

            let mut files_saved = Vec::new();

            if let Some(src_md) = &chat.md_file {
                let dst_md = out_dir.join(format!("{}.md", final_name));
                if dst_md.exists() {
                    let _ = fs::remove_file(&dst_md);
                }
                if fs::rename(src_md, &dst_md).is_err() {
                    let _ = fs::copy(src_md, &dst_md);
                    let _ = fs::remove_file(src_md);
                }
                files_saved.push(format!("{}.md", final_name));
            }

            if let Some(src_json) = &chat.json_file {
                let dst_json = out_dir.join(format!("{}.json", final_name));
                if dst_json.exists() {
                    let _ = fs::remove_file(&dst_json);
                }
                if fs::rename(src_json, &dst_json).is_err() {
                    let _ = fs::copy(src_json, &dst_json);
                    let _ = fs::remove_file(src_json);
                }
                files_saved.push(format!("{}.json", final_name));
            }

            report_entries.push((
                chat.title.clone(),
                ".".to_string(),
                files_saved,
                chat.cascade_id.clone(),
            ));
        }
    }

    // Rule 6: Update export_report.txt in root of out_dir
    let mut report = String::new();
    report.push_str("============================================================\n");
    report.push_str("  EXPORT REPORT\n");
    report.push_str("============================================================\n\n");
    report.push_str(&format!("  Time:      {}\n", get_system_date_time()));
    report.push_str(&format!("  Total:     {}\n", report_entries.len()));
    report.push_str(&format!("  Exported:  {}\n", report_entries.len()));
    report.push_str("  Failed:    0\n\n");
    report.push_str("------------------------------------------------------------\n");
    report.push_str(&format!("  EXPORTED CONVERSATIONS ({})\n", report_entries.len()));
    report.push_str("------------------------------------------------------------\n");

    for (i, (title, folder, files, id)) in report_entries.iter().enumerate() {
        let display_title = if title.trim().is_empty() { "Без названия" } else { title.as_str() };
        report.push_str(&format!("    {}. {}\n", i + 1, display_title));
        if organize_folders {
            report.push_str(&format!("       Folder: {}\n", folder));
        }
        report.push_str(&format!("       Files:  {}\n", files.join(", ")));
        let short_id = if id.len() >= 8 { &id[..8] } else { id.as_str() };
        report.push_str(&format!("       ID:     {}...\n\n", short_id));
    }
    report.push_str("============================================================\n");

    let _ = fs::write(out_dir.join("export_report.txt"), report);

    // Clean up staging_dir
    let _ = fs::remove_dir_all(staging_dir);

    Ok(staged_chats.len())
}

#[tauri::command(rename_all = "snake_case")]
fn run_command(
    app: AppHandle,
    state: State<AppState>,
    options: CommandOptions,
) -> Result<u32, String> {
    let options_json = serde_json::to_string(&options).unwrap_or_default();

    // Prepare export output dir and staging dir if this is an export
    let out_dir_path = if options.cmd_type == "export" {
        let dir = options.output_dir.as_ref().map(PathBuf::from).unwrap_or_else(|| {
            get_userprofile_dir().join("Desktop").join("antigravity_export")
        });
        let _ = fs::create_dir_all(&dir);
        Some(dir)
    } else {
        None
    };

    let staging_dir_opt = if let Some(ref out_dir) = out_dir_path {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let staging = out_dir.join(format!(".agh_staging_{}", timestamp));
        let _ = fs::create_dir_all(&staging);
        Some(staging)
    } else {
        None
    };

    // Demo Mode Emulation
    if is_demo_mode() {
        let app_clone = app.clone();
        let cmd_type = options.cmd_type.clone();
        let organize_folders_flag = options.organize_folders;
        let total_to_export = if let Some(ref ids) = options.chat_ids {
            if ids.is_empty() { 6 } else { ids.len() }
        } else if options.chat_id.is_some() {
            1
        } else {
            6
        };

        let is_running_flag_clone = Arc::clone(&state.is_running_flag);
        {
            let mut flag = is_running_flag_clone.lock().unwrap();
            *flag = true;
        }

        let options_clone = options.clone();
        let out_dir_clone = out_dir_path.clone();
        let staging_clone = staging_dir_opt.clone();

        thread::spawn(move || {
            let _ = app_clone.emit(
                "cmd-output",
                OutputPayload {
                    text: format!("[Demo] Starting operation '{}' (total items: {})...", cmd_type, total_to_export),
                    tag: "info".to_string(),
                },
            );

            thread::sleep(std::time::Duration::from_millis(300));

            for i in 1..=total_to_export {
                {
                    let flag = is_running_flag_clone.lock().unwrap();
                    if !*flag {
                        let _ = app_clone.emit(
                            "cmd-output",
                            OutputPayload {
                                text: "[Demo] Operation cancelled by user.".to_string(),
                                tag: "warning".to_string(),
                            },
                        );
                        let _ = app_clone.emit(
                            "cmd-finished",
                            FinishedPayload {
                                cmd_type: cmd_type.clone(),
                                code: 1,
                                success: false,
                                exported_count: i - 1,
                            },
                        );
                        if let Some(ref stg) = staging_clone {
                            let _ = fs::remove_dir_all(stg);
                        }
                        return;
                    }
                }

                let _ = app_clone.emit(
                    "cmd-output",
                    OutputPayload {
                        text: format!("Exporting conversation {}/{}...", i, total_to_export),
                        tag: "normal".to_string(),
                    },
                );
                thread::sleep(std::time::Duration::from_millis(150));
            }

            let mut final_count = total_to_export;

            if cmd_type == "export" {
                if let (Some(out_dir), Some(staging_dir)) = (out_dir_clone, staging_clone) {
                    let all_demo = get_demo_conversations();
                    let to_export: Vec<ConversationItem> = if let Some(ref ids) = options_clone.chat_ids {
                        all_demo.into_iter().filter(|c| ids.contains(&c.cascade_id)).collect()
                    } else if let Some(ref cid) = options_clone.chat_id {
                        all_demo.into_iter().filter(|c| &c.cascade_id == cid).collect()
                    } else {
                        all_demo
                    };

                    let mut json_arr = Vec::new();
                    let mut existing_staged_names: HashSet<String> = HashSet::new();

                    for item in &to_export {
                        json_arr.push(serde_json::json!({
                            "cascade_id": item.cascade_id,
                            "title": item.title,
                            "step_count": item.step_count,
                            "last_modified_time": item.last_modified
                        }));

                        let short_id = if item.cascade_id.len() >= 8 { &item.cascade_id[..8] } else { &item.cascade_id };
                        let mut safe_name = sanitize_windows_title(&item.title, short_id);
                        if existing_staged_names.contains(&safe_name) {
                            safe_name = format!("{}_2", safe_name);
                        }
                        existing_staged_names.insert(safe_name.clone());

                        let md_content = format!(
                            "# {}\n\n- **Cascade ID**: `{}`\n- **Steps**: {}\n- **Status**: CASCADE_RUN_STATUS_IDLE\n- **Last Modified**: {}\n\n---\n\n## 🧑 User\nDemo user message in {}\n\n## 🤖 Assistant\nDemo AI answer for {}\n",
                            if item.title.is_empty() { "Без названия" } else { &item.title },
                            item.cascade_id,
                            item.step_count,
                            item.last_modified,
                            item.title,
                            item.title
                        );
                        let _ = fs::write(staging_dir.join(format!("{}.md", safe_name)), md_content);

                        let json_single = serde_json::json!({
                            "cascade_id": item.cascade_id,
                            "title": item.title,
                            "steps": item.step_count
                        });
                        let _ = fs::write(
                            staging_dir.join(format!("{}.json", safe_name)),
                            serde_json::to_string_pretty(&json_single).unwrap_or_default(),
                        );
                    }

                    let _ = fs::write(
                        staging_dir.join("conversations_export.json"),
                        serde_json::to_string_pretty(&json_arr).unwrap_or_default(),
                    );

                    if let Ok(cnt) = organize_export_files(&out_dir, &staging_dir, organize_folders_flag) {
                        final_count = cnt;
                    }
                }
            }

            let _ = app_clone.emit(
                "cmd-output",
                OutputPayload {
                    text: format!("[Demo] Operation complete! Processed {} item(s).", final_count),
                    tag: "success".to_string(),
                },
            );

            {
                let mut flag = is_running_flag_clone.lock().unwrap();
                *flag = false;
            }

            let _ = app_clone.emit(
                "cmd-finished",
                FinishedPayload {
                    cmd_type,
                    code: 0,
                    success: true,
                    exported_count: final_count,
                },
            );
        });

        log_ipc(Some(&app), "run_command", &options_json, "OK(demo PID 99999)");
        return Ok(99999);
    }

    let mut pid_lock = state.active_pid.lock().unwrap();
    if pid_lock.is_some() {
        let err = "ERR_BUSY: Another operation is already running".to_string();
        log_ipc(Some(&app), "run_command", &options_json, &err);
        return Err(err);
    }

    let (exe_opt, _) = find_aghistory_executable();
    let exe = exe_opt.ok_or_else(|| {
        let err = "ERR_CLI_NOT_FOUND: aghistory executable not found".to_string();
        log_ipc(Some(&app), "run_command", &options_json, &err);
        err
    })?;

    let is_python_module = exe.ends_with("python.exe");

    let mut args: Vec<String> = Vec::new();
    if is_python_module {
        args.push("-m".to_string());
        args.push("antigravity_history".to_string());
    }

    let mut total_expected_count = 0;

    match options.cmd_type.as_str() {
        "list" => {
            args.push("list".to_string());
            if options.today {
                args.push("--today".to_string());
            }
        }
        "export" => {
            args.push("export".to_string());

            // Handle multi-IDs or single ID
            if let Some(ref ids) = options.chat_ids {
                for id in ids {
                    if !id.trim().is_empty() {
                        args.push("--id".to_string());
                        args.push(id.trim().to_string());
                        total_expected_count += 1;
                    }
                }
            } else if let Some(ref cid) = options.chat_id {
                if !cid.trim().is_empty() {
                    args.push("--id".to_string());
                    args.push(cid.trim().to_string());
                    total_expected_count += 1;
                }
            }

            // Always output to clean staging directory!
            if let Some(ref staging) = staging_dir_opt {
                args.push("--output".to_string());
                args.push(staging.to_string_lossy().to_string());
            }

            if let Some(ref fmt) = options.format {
                let fmt_val = fmt.split_whitespace().next().unwrap_or("all");
                args.push("--format".to_string());
                args.push(fmt_val.to_string());
            }
            if options.thinking {
                args.push("--thinking".to_string());
            }
            if options.full {
                args.push("--full".to_string());
            }
            if options.today {
                args.push("--today".to_string());
            }
        }
        "recover" => {
            args.push("recover".to_string());
        }
        "info" | "server-status" => {
            args.push("info".to_string());
        }
        unknown => {
            let err = format!("ERR_UNKNOWN_CMD: {}", unknown);
            log_ipc(Some(&app), "run_command", &options_json, &err);
            return Err(err);
        }
    }

    let mut cmd = Command::new(&exe);
    cmd.args(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| {
        let err = format!("ERR_SPAWN: {}", e);
        log_ipc(Some(&app), "run_command", &options_json, &err);
        err
    })?;

    let pid = child.id();
    *pid_lock = Some(pid);
    drop(pid_lock);

    log_ipc(Some(&app), "run_command", &options_json, &format!("OK(PID: {})", pid));

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_handle_out = app.clone();
    let app_handle_err = app.clone();
    let app_handle_finish = app.clone();
    let active_pid_ref = Arc::clone(&state.active_pid);
    let cmd_type_clone = options.cmd_type.clone();
    let organize_folders_flag = options.organize_folders;
    let out_dir_final = out_dir_path.clone();
    let staging_dir_final = staging_dir_opt.clone();

    // Reader thread for stdout
    if let Some(out) = stdout {
        thread::spawn(move || {
            let ansi_re = Regex::new(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])").unwrap();
            let mut reader = BufReader::new(out);
            let mut buf = Vec::new();
            while let Ok(n) = reader.read_until(b'\n', &mut buf) {
                if n == 0 {
                    break;
                }
                let decoded = decode_bytes_lossy(&buf);
                let cleaned = ansi_re.replace_all(&decoded, "").to_string();
                let tag = classify_log_line(&cleaned);
                let _ = app_handle_out.emit(
                    "cmd-output",
                    OutputPayload {
                        text: cleaned,
                        tag: tag.to_string(),
                    },
                );
                buf.clear();
            }
        });
    }

    // Reader thread for stderr
    if let Some(err) = stderr {
        thread::spawn(move || {
            let ansi_re = Regex::new(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])").unwrap();
            let mut reader = BufReader::new(err);
            let mut buf = Vec::new();
            while let Ok(n) = reader.read_until(b'\n', &mut buf) {
                if n == 0 {
                    break;
                }
                let decoded = decode_bytes_lossy(&buf);
                let cleaned = ansi_re.replace_all(&decoded, "").to_string();
                let _ = app_handle_err.emit(
                    "cmd-output",
                    OutputPayload {
                        text: cleaned,
                        tag: "error".to_string(),
                    },
                );
                buf.clear();
            }
        });
    }

    // Waiter thread
    thread::spawn(move || {
        let status = child.wait();
        let (code, success) = match status {
            Ok(s) => (s.code().unwrap_or(0), s.success()),
            Err(_) => (-1, false),
        };

        let mut actual_exported_count = total_expected_count;

        if cmd_type_clone == "export" {
            if let (Some(out_dir), Some(staging_dir)) = (out_dir_final, staging_dir_final) {
                if success {
                    match organize_export_files(&out_dir, &staging_dir, organize_folders_flag) {
                        Ok(cnt) => {
                            actual_exported_count = cnt;
                            let msg = if organize_folders_flag {
                                format!("[AGH] Successfully organized {} conversation(s) into subfolders.", cnt)
                            } else {
                                format!("[AGH] Successfully exported {} conversation(s).", cnt)
                            };
                            let _ = app_handle_finish.emit(
                                "cmd-output",
                                OutputPayload {
                                    text: msg,
                                    tag: "success".to_string(),
                                },
                            );
                        }
                        Err(e) => {
                            let _ = app_handle_finish.emit(
                                "cmd-output",
                                OutputPayload {
                                    text: format!("[AGH] Error organizing files: {}", e),
                                    tag: "error".to_string(),
                                },
                            );
                        }
                    }
                } else {
                    let _ = fs::remove_dir_all(&staging_dir);
                }
            }
        }

        let mut lock = active_pid_ref.lock().unwrap();
        *lock = None;
        drop(lock);

        let _ = app_handle_finish.emit(
            "cmd-finished",
            FinishedPayload {
                cmd_type: cmd_type_clone,
                code,
                success,
                exported_count: actual_exported_count,
            },
        );
    });

    Ok(pid)
}

#[tauri::command(rename_all = "snake_case")]
fn request_window_attention(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
    Ok(())
}

// ============================================================================
//  APPLICATION ENTRY
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder
        .manage(AppState {
            active_pid: Arc::new(Mutex::new(None)),
            is_running_flag: Arc::new(Mutex::new(false)),
        })
        .setup(|app| {
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

            if let Some(win) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = win.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_env_status,
            get_conversations_db,
            pick_export_directory,
            open_folder,
            reveal_db_file,
            run_command,
            stop_running_command,
            load_settings,
            save_settings,
            request_window_attention
        ]);

    if let Err(e) = builder.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {}", e);
        #[cfg(target_os = "windows")]
        {
            let err_str = e.to_string();
            if err_str.contains("WebView2") || err_str.contains("failed to create webview") {
                let _ = std::process::Command::new("powershell")
                    .args([
                        "-Command",
                        "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Для запуска Antigravity History Manager требуется компонент Microsoft Edge WebView2.\n\nПожалуйста, установите официальный рантайм: https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'Antigravity History Manager — Требуется WebView2', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)"
                    ])
                    .status();
            }
        }
    }
}

// ============================================================================
//  UNIT TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_windows_title_illegal_chars() {
        let title = "Что: как? / зачем";
        let sanitized = sanitize_windows_title(title, "12345678");
        assert_eq!(sanitized, "Что как зачем");
    }

    #[test]
    fn test_sanitize_windows_title_untitled() {
        assert_eq!(sanitize_windows_title("", "abcdef12"), "Без названия [abcdef12]");
        assert_eq!(sanitize_windows_title("   ", "abcdef12"), "Без названия [abcdef12]");
        assert_eq!(sanitize_windows_title("Без названия", "abcdef12"), "Без названия [abcdef12]");
        assert_eq!(sanitize_windows_title("Untitled", "abcdef12"), "Без названия [abcdef12]");
    }

    #[test]
    fn test_sanitize_windows_title_reserved() {
        assert_eq!(sanitize_windows_title("CON", "abcdef12"), "CON_chat");
        assert_eq!(sanitize_windows_title("nul", "abcdef12"), "nul_chat");
        assert_eq!(sanitize_windows_title("COM1", "abcdef12"), "COM1_chat");
    }

    #[test]
    fn test_sanitize_windows_title_trailing_dots_and_length() {
        let sanitized = sanitize_windows_title("Hello World....   ", "abcdef12");
        assert_eq!(sanitized, "Hello World");

        let long_title = "a".repeat(120);
        let sanitized_long = sanitize_windows_title(&long_title, "abcdef12");
        assert_eq!(sanitized_long.chars().count(), 80);
    }

    #[test]
    fn test_organize_export_files_flow() {
        let test_base = std::env::temp_dir().join("agh_test_unit_export");
        let _ = fs::remove_dir_all(&test_base);
        let out_dir = test_base.join("out");
        let staging_1 = test_base.join("staging_1");
        fs::create_dir_all(&out_dir).unwrap();
        fs::create_dir_all(&staging_1).unwrap();

        let chats = vec![
            ("00000001-1111-2222-3333-444444444444", "Без названия"),
            ("00000002-1111-2222-3333-444444444444", "Дублирующийся чат"),
            ("00000003-1111-2222-3333-444444444444", "Дублирующийся чат"),
            ("00000004-1111-2222-3333-444444444444", "Что: как? / зачем"),
        ];

        let mut json_arr = Vec::new();
        for (i, (id, title)) in chats.iter().enumerate() {
            json_arr.push(serde_json::json!({
                "cascade_id": id,
                "title": title
            }));
            let md_file = staging_1.join(format!("chat_{}.md", i));
            let md_content = format!("# {}\n\n- **Cascade ID**: `{}`\n", title, id);
            fs::write(&md_file, md_content).unwrap();

            let json_file = staging_1.join(format!("chat_{}.json", i));
            let json_content = serde_json::json!({
                "cascade_id": id,
                "title": title
            });
            fs::write(&json_file, json_content.to_string()).unwrap();
        }
        fs::write(staging_1.join("conversations_export.json"), serde_json::to_string(&json_arr).unwrap()).unwrap();

        // 1. First Pass: organize into folders
        let count = organize_export_files(&out_dir, &staging_1, true).unwrap();
        assert_eq!(count, 4);

        // Verify out_dir contents:
        assert!(!out_dir.join("conversations_export.json").exists());
        assert!(out_dir.join("export_report.txt").exists());

        assert!(out_dir.join("Без названия [00000001]").is_dir());
        assert!(out_dir.join("Без названия [00000001]").join("Без названия [00000001].md").exists());
        assert!(out_dir.join("Без названия [00000001]").join("Без названия [00000001].json").exists());
        assert!(out_dir.join("Без названия [00000001]").join(".chat_id").exists());

        assert!(out_dir.join("Дублирующийся чат").is_dir());
        assert!(out_dir.join("Дублирующийся чат").join("Дублирующийся чат.md").exists());
        assert!(out_dir.join("Дублирующийся чат").join(".chat_id").exists());

        assert!(out_dir.join("Дублирующийся чат [00000003]").is_dir());
        assert!(out_dir.join("Дублирующийся чат [00000003]").join("Дублирующийся чат [00000003].md").exists());
        assert!(out_dir.join("Дублирующийся чат [00000003]").join(".chat_id").exists());

        assert!(out_dir.join("Что как зачем").is_dir());
        assert!(out_dir.join("Что как зачем").join("Что как зачем.md").exists());
        assert!(out_dir.join("Что как зачем").join(".chat_id").exists());

        // 2. Second Pass: Re-export exact same chats -> ZERO duplicates
        let staging_2 = test_base.join("staging_2");
        fs::create_dir_all(&staging_2).unwrap();
        for (i, (id, title)) in chats.iter().enumerate() {
            let md_file = staging_2.join(format!("chat_{}.md", i));
            let md_content = format!("# {}\n\n- **Cascade ID**: `{}`\nContent updated!\n", title, id);
            fs::write(&md_file, md_content).unwrap();
            let json_file = staging_2.join(format!("chat_{}.json", i));
            fs::write(&json_file, serde_json::json!({ "cascade_id": id, "title": title }).to_string()).unwrap();
        }
        fs::write(staging_2.join("conversations_export.json"), serde_json::to_string(&json_arr).unwrap()).unwrap();

        let count2 = organize_export_files(&out_dir, &staging_2, true).unwrap();
        assert_eq!(count2, 4);

        let mut subdirs = Vec::new();
        for entry in fs::read_dir(&out_dir).unwrap().flatten() {
            if entry.path().is_dir() {
                subdirs.push(entry.file_name().to_string_lossy().to_string());
                for subentry in fs::read_dir(entry.path()).unwrap().flatten() {
                    let fname = subentry.file_name().to_string_lossy().to_string();
                    assert!(!fname.contains("_2"), "Found unwanted _2 file: {}", fname);
                }
            }
        }
        assert_eq!(subdirs.len(), 4);

        // 3. Third Pass: Rename Chat 00000002 -> "Новое название чата"
        let staging_3 = test_base.join("staging_3");
        fs::create_dir_all(&staging_3).unwrap();
        let md_file = staging_3.join("renamed.md");
        fs::write(&md_file, "# Новое название чата\n\n- **Cascade ID**: `00000002-1111-2222-3333-444444444444`\n").unwrap();
        let json_file = staging_3.join("renamed.json");
        fs::write(&json_file, serde_json::json!({ "cascade_id": "00000002-1111-2222-3333-444444444444", "title": "Новое название чата" }).to_string()).unwrap();

        let count3 = organize_export_files(&out_dir, &staging_3, true).unwrap();
        assert_eq!(count3, 1);

        assert!(!out_dir.join("Дублирующийся чат").exists(), "Old folder should be renamed!");
        assert!(out_dir.join("Новое название чата").is_dir(), "New folder should exist!");
        assert!(out_dir.join("Новое название чата").join("Новое название чата.md").exists());

        // 4. Fourth Pass: Flat export (organize_folders == false)
        let flat_out = test_base.join("flat_out");
        let staging_4 = test_base.join("staging_4");
        fs::create_dir_all(&flat_out).unwrap();
        fs::create_dir_all(&staging_4).unwrap();
        for (i, (id, title)) in chats.iter().enumerate() {
            let md_file = staging_4.join(format!("chat_{}.md", i));
            fs::write(&md_file, format!("# {}\n\n- **Cascade ID**: `{}`\n", title, id)).unwrap();
        }
        fs::write(staging_4.join("conversations_export.json"), serde_json::to_string(&json_arr).unwrap()).unwrap();

        let count4 = organize_export_files(&flat_out, &staging_4, false).unwrap();
        assert_eq!(count4, 4);
        assert!(!flat_out.join("conversations_export.json").exists());
        assert!(flat_out.join("export_report.txt").exists());
        assert!(flat_out.join("Без названия [00000001].md").exists());
        assert!(flat_out.join("Дублирующийся чат.md").exists());
        assert!(flat_out.join("Дублирующийся чат [00000003].md").exists());
        assert!(flat_out.join("Что как зачем.md").exists());

        // Clean up test directory
        let _ = fs::remove_dir_all(&test_base);
    }
}

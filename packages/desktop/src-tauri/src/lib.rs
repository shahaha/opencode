mod cli;
mod constants;
#[cfg(windows)]
mod job_object;
#[cfg(target_os = "linux")]
pub mod linux_display;
mod markdown;
mod server;
mod window_customizer;
mod windows;

use futures::{
    FutureExt, TryFutureExt,
    future::{self, Shared},
};
#[cfg(windows)]
use job_object::*;
use std::{
    collections::VecDeque,
    env,
    net::TcpListener,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
    process::Command,
};
use tauri::{AppHandle, Manager, RunEvent, State, ipc::Channel};
#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::process::CommandChild;
use tokio::{
    sync::{oneshot, watch},
    time::{sleep, timeout},
};

use crate::cli::sync_cli;
use crate::constants::*;
use crate::server::get_saved_server_url;
use crate::windows::{LoadingWindow, MainWindow};

const WEB_MIRROR_KEY: &str = "webMirror";

#[derive(Clone, serde::Serialize, specta::Type, Debug)]
struct ServerReadyData {
    url: String,
    password: Option<String>,
}

#[derive(Clone, Copy, serde::Serialize, specta::Type, Debug)]
#[serde(tag = "phase", rename_all = "snake_case")]
enum InitStep {
    ServerWaiting,
    SqliteWaiting,
    Done,
}

struct InitState {
    current: watch::Receiver<InitStep>,
}

#[derive(Clone)]
struct ServerState {
    child: Arc<Mutex<Option<CommandChild>>>,
    status: future::Shared<oneshot::Receiver<Result<ServerReadyData, String>>>,
}

impl ServerState {
    pub fn new(
        child: Option<CommandChild>,
        status: Shared<oneshot::Receiver<Result<ServerReadyData, String>>>,
    ) -> Self {
        Self {
            child: Arc::new(Mutex::new(child)),
            status,
        }
    }

    pub fn set_child(&self, child: Option<CommandChild>) {
        *self.child.lock().unwrap() = child;
    }
}

#[derive(Clone)]
struct LogState(Arc<Mutex<VecDeque<String>>>);

#[derive(Clone, Default, serde::Serialize, serde::Deserialize, specta::Type)]
struct WebMirrorConfig {
    enabled: bool,
    port: Option<u32>,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Clone, serde::Serialize, specta::Type)]
struct WebMirrorStatus {
    running: bool,
    /// Local URL (http://localhost:<port>)
    local_url: Option<String>,
    /// Network URL (http://<lan-ip>:<port>) for remote access
    network_url: Option<String>,
    /// The resolved username used for authentication
    username: String,
    /// The resolved password used for authentication
    password: String,
    config: WebMirrorConfig,
}

struct WebMirrorState {
    handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    local_url: Arc<Mutex<Option<String>>>,
    network_url: Arc<Mutex<Option<String>>>,
}
#[tauri::command]
#[specta::specta]
fn kill_sidecar(app: AppHandle) {
    let Some(server_state) = app.try_state::<ServerState>() else {
        println!("Server not running");
        return;
    };

    let Some(server_state) = server_state
        .child
        .lock()
        .expect("Failed to acquire mutex lock")
        .take()
    else {
        println!("Server state missing");
        return;
    };

    let _ = server_state.kill();

    println!("Killed server");
}

async fn get_logs(app: AppHandle) -> Result<String, String> {
    let log_state = app.try_state::<LogState>().ok_or("Log state not found")?;

    let logs = log_state
        .0
        .lock()
        .map_err(|_| "Failed to acquire log lock")?;

    Ok(logs.iter().cloned().collect::<Vec<_>>().join(""))
}

#[tauri::command]
#[specta::specta]
async fn await_initialization(
    state: State<'_, ServerState>,
    init_state: State<'_, InitState>,
    events: Channel<InitStep>,
) -> Result<ServerReadyData, String> {
    let mut rx = init_state.current.clone();

    let events = async {
        let e = (*rx.borrow()).clone();
        let _ = events.send(e).unwrap();

        while rx.changed().await.is_ok() {
            let step = *rx.borrow_and_update();

            let _ = events.send(step);

            if matches!(step, InitStep::Done) {
                break;
            }
        }
    };

    future::join(state.status.clone(), events)
        .await
        .0
        .map_err(|_| "Failed to get server status".to_string())?
}

#[tauri::command]
#[specta::specta]
fn check_app_exists(app_name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        check_windows_app(app_name)
    }
    
    #[cfg(target_os = "macos")]
    {
        check_macos_app(app_name)
    }
    
    #[cfg(target_os = "linux")]
    {
        check_linux_app(app_name)
    }
}

#[cfg(target_os = "windows")]
fn check_windows_app(app_name: &str) -> bool {
    // Check if command exists in PATH, including .exe
    return true;
}

#[cfg(target_os = "macos")]
fn check_macos_app(app_name: &str) -> bool {
    // Check common installation locations
    let mut app_locations = vec![
        format!("/Applications/{}.app", app_name),
        format!("/System/Applications/{}.app", app_name),
    ];

    if let Ok(home) = std::env::var("HOME") {
        app_locations.push(format!("{}/Applications/{}.app", home, app_name));
    }
    
    for location in app_locations {
        if std::path::Path::new(&location).exists() {
            return true;
        }
    }
    // Also check if command exists in PATH
    Command::new("which")
        .arg(app_name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LinuxDisplayBackend {
    Wayland,
    Auto,
}

#[tauri::command]
#[specta::specta]
fn get_display_backend() -> Option<LinuxDisplayBackend> {
    #[cfg(target_os = "linux")]
    {
        let prefer = linux_display::read_wayland().unwrap_or(false);
        return Some(if prefer {
            LinuxDisplayBackend::Wayland
        } else {
            LinuxDisplayBackend::Auto
        });
    }

    #[cfg(not(target_os = "linux"))]
    None
}

#[tauri::command]
#[specta::specta]
fn set_display_backend(_app: AppHandle, _backend: LinuxDisplayBackend) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let prefer = matches!(_backend, LinuxDisplayBackend::Wayland);
        return linux_display::write_wayland(&_app, prefer);
    }

    #[cfg(not(target_os = "linux"))]
    Ok(())
}

#[cfg(target_os = "linux")]
fn check_linux_app(app_name: &str) -> bool {
    return true;
}

fn get_web_mirror_config(app: &AppHandle) -> WebMirrorConfig {
    let Ok(store) = app.store(SETTINGS_STORE) else {
        return WebMirrorConfig::default();
    };
    store
        .get(WEB_MIRROR_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// Returns the first non-internal IPv4 address, skipping Docker bridges (172.x).
fn get_network_ip() -> Option<String> {
    let Ok(addrs) = std::net::UdpSocket::bind("0.0.0.0:0").and_then(|s| {
        s.connect("8.8.8.8:80")?;
        s.local_addr()
    }) else {
        return None;
    };
    let ip = addrs.ip().to_string();
    if ip.starts_with("172.") {
        return None;
    }
    Some(ip)
}

/// Try to kill any process listening on the given port.
fn try_kill_port_holder(port: u32) -> bool {
    #[cfg(unix)]
    {
        let output = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{port}")])
            .output();
        if let Ok(out) = output {
            let pids = String::from_utf8_lossy(&out.stdout);
            for pid_str in pids.split_whitespace() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    if pid == std::process::id() {
                        continue;
                    }
                    println!("[web-mirror] Killing orphan process {pid} on port {port}");
                    let _ = std::process::Command::new("kill")
                        .args(["-TERM", &pid.to_string()])
                        .output();
                    std::thread::sleep(Duration::from_millis(500));
                    return true;
                }
            }
        }
    }
    false
}

/// TCP reverse proxy: forwards all traffic from `0.0.0.0:<port>` to the local desktop server.
fn spawn_web_mirror_proxy(
    target: &str,
    config: &WebMirrorConfig,
) -> Result<(tokio::task::JoinHandle<()>, String, Option<String>), String> {
    let port = config.port.unwrap_or(4096);
    let target_addr = target
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string();

    let listener = match std::net::TcpListener::bind(format!("0.0.0.0:{port}")) {
        Ok(l) => l,
        Err(_) => {
            if try_kill_port_holder(port) {
                std::net::TcpListener::bind(format!("0.0.0.0:{port}"))
                    .map_err(|e| format!("Port {port} is still in use after cleanup: {e}"))?
            } else {
                return Err(format!(
                    "Port {port} is already in use by another application. Choose a different port in settings."
                ));
            }
        }
    };
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking: {e}"))?;
    let listener = tokio::net::TcpListener::from_std(listener)
        .map_err(|e| format!("Failed to create tokio listener: {e}"))?;

    let network_ip = get_network_ip();
    let network_url = network_ip.as_ref().map(|ip| format!("http://{ip}:{port}"));

    println!("[web-mirror] TCP proxy listening on 0.0.0.0:{port} -> {target_addr}");
    if let Some(ref url) = network_url {
        println!("[web-mirror] Network access: {url}");
    }

    let handle = tokio::spawn(async move {
        loop {
            let Ok((inbound, peer)) = listener.accept().await else {
                continue;
            };
            let target = target_addr.clone();
            tokio::spawn(async move {
                let Ok(outbound) = tokio::net::TcpStream::connect(&target).await else {
                    eprintln!("[web-mirror] failed to connect to {target} for {peer}");
                    return;
                };
                let (mut ri, mut wi) = inbound.into_split();
                let (mut ro, mut wo) = outbound.into_split();
                let a = tokio::io::copy(&mut ri, &mut wo);
                let b = tokio::io::copy(&mut ro, &mut wi);
                let _ = tokio::try_join!(a, b);
            });
        }
    });

    let local_url = format!("http://localhost:{port}");
    Ok((handle, local_url, network_url))
}

#[tauri::command]
#[specta::specta]
async fn start_web_mirror(app: AppHandle, config: WebMirrorConfig) -> Result<WebMirrorStatus, String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;
    store.set(
        WEB_MIRROR_KEY,
        serde_json::to_value(&config).map_err(|e| format!("Failed to serialize config: {}", e))?,
    );
    store.save().map_err(|e| format!("Failed to save settings: {}", e))?;

    let state = app.state::<WebMirrorState>();

    if let Some(handle) = state.handle.lock().unwrap().take() {
        handle.abort();
    }

    let (username, password) = resolve_credentials(&config, &app);

    if !config.enabled {
        *state.local_url.lock().unwrap() = None;
        *state.network_url.lock().unwrap() = None;
        return Ok(WebMirrorStatus {
            running: false,
            local_url: None,
            network_url: None,
            username,
            password,
            config,
        });
    }

    let server_state = app.state::<ServerState>();
    let server_data = server_state
        .status
        .clone()
        .await
        .map_err(|_| "Server not ready yet".to_string())?
        .map_err(|e| format!("Server failed: {e}"))?;

    let (handle, local_url, network_url) = spawn_web_mirror_proxy(&server_data.url, &config)?;
    *state.handle.lock().unwrap() = Some(handle);
    *state.local_url.lock().unwrap() = Some(local_url.clone());
    *state.network_url.lock().unwrap() = network_url.clone();
    Ok(WebMirrorStatus {
        running: true,
        local_url: Some(local_url),
        network_url,
        username,
        password,
        config,
    })
}

#[tauri::command]
#[specta::specta]
async fn stop_web_mirror(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WebMirrorState>();
    if let Some(handle) = state.handle.lock().unwrap().take() {
        handle.abort();
    }
    *state.local_url.lock().unwrap() = None;
    *state.network_url.lock().unwrap() = None;

    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;
    let mut config = get_web_mirror_config(&app);
    config.enabled = false;
    store.set(
        WEB_MIRROR_KEY,
        serde_json::to_value(&config).map_err(|e| format!("Failed to serialize config: {}", e))?,
    );
    store.save().map_err(|e| format!("Failed to save settings: {}", e))?;
    Ok(())
}

/// Resolves the server credentials using this priority:
/// 1. Config values (user set in Settings UI)
/// 2. Shell env vars (from .zshrc etc.)
/// 3. Defaults (username="opencode", password=random UUID)
fn resolve_credentials(config: &WebMirrorConfig, app: &AppHandle) -> (String, String) {
    let username = config
        .username
        .clone()
        .filter(|v| !v.is_empty())
        .or_else(|| cli::probe_shell_env(app, "OPENCODE_SERVER_USERNAME"))
        .unwrap_or_else(|| "opencode".to_string());

    let password = config
        .password
        .clone()
        .filter(|v| !v.is_empty())
        .or_else(|| cli::probe_shell_env(app, "OPENCODE_SERVER_PASSWORD"))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    (username, password)
}

#[tauri::command]
#[specta::specta]
fn get_web_mirror_status(app: AppHandle) -> WebMirrorStatus {
    let state = app.state::<WebMirrorState>();
    let running = state
        .handle
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|h| !h.is_finished());
    let (local_url, network_url) = if running {
        (
            state.local_url.lock().unwrap().clone(),
            state.network_url.lock().unwrap().clone(),
        )
    } else {
        (None, None)
    };
    let config = get_web_mirror_config(&app);
    let (username, password) = resolve_credentials(&config, &app);
    WebMirrorStatus {
        running,
        local_url,
        network_url,
        username,
        password,
        config,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        // Then register them (separated by a comma)
        .commands(tauri_specta::collect_commands![
            kill_sidecar,
            cli::install_cli,
            await_initialization,
            server::get_default_server_url,
            server::set_default_server_url,
            get_display_backend,
            set_display_backend,
            markdown::parse_markdown_command,
            check_app_exists,
            start_web_mirror,
            stop_web_mirror,
            get_web_mirror_status
        ])
        .events(tauri_specta::collect_events![LoadingWindowComplete])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    let _ = std::process::Command::new("killall")
        .arg("opencode-cli")
        .output();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window when another instance is launched
            if let Some(window) = app.get_webview_window(MainWindow::LABEL) {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .with_denylist(&[LoadingWindow::LABEL])
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(crate::window_customizer::PinchZoomDisablePlugin)
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            let app = app.handle().clone();

            builder.mount_events(&app);
            tauri::async_runtime::spawn(initialize(app));

            Ok(())
        });

    if UPDATER_ENABLED {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                println!("Received Exit");

                // Stop web mirror proxy if running
                if let Some(state) = app.try_state::<WebMirrorState>() {
                    if let Some(handle) = state.handle.lock().unwrap().take() {
                        handle.abort();
                        println!("Stopped web mirror proxy");
                    }
                }

                kill_sidecar(app.clone());
            }
        });
}

#[derive(tauri_specta::Event, serde::Deserialize, specta::Type)]
struct LoadingWindowComplete;

// #[tracing::instrument(skip_all)]
async fn initialize(app: AppHandle) {
    println!("Initializing app");

    let (init_tx, init_rx) = watch::channel(InitStep::ServerWaiting);

    setup_app(&app, init_rx);
    spawn_cli_sync_task(app.clone());

    let (server_ready_tx, server_ready_rx) = oneshot::channel();
    let server_ready_rx = server_ready_rx.shared();
    app.manage(ServerState::new(None, server_ready_rx.clone()));

    let loading_window_complete = event_once_fut::<LoadingWindowComplete>(&app);

    println!("Main and loading windows created");

    let sqlite_enabled = option_env!("OPENCODE_SQLITE").is_some();

    let loading_task = tokio::spawn({
        let init_tx = init_tx.clone();
        let app = app.clone();

        async move {
            let mut sqlite_exists = sqlite_file_exists();

            println!("Setting up server connection");
            let server_connection = setup_server_connection(app.clone()).await;

            // we delay spawning this future so that the timeout is created lazily
            let cli_health_check = match server_connection {
                ServerConnection::CLI {
                    child,
                    health_check,
                    url,
                    password,
                } => {
                    let app = app.clone();
                    Some(
                        async move {
                            let Ok(Ok(_)) = timeout(Duration::from_secs(30), health_check.0).await
                            else {
                                let _ = child.kill();
                                return Err(format!(
                                    "Failed to spawn OpenCode Server. Logs:\n{}",
                                    get_logs(app.clone()).await.unwrap()
                                ));
                            };

                            println!("CLI health check OK");

                            #[cfg(windows)]
                            {
                                let job_state = app.state::<JobObjectState>();
                                job_state.assign_pid(child.pid());
                            }

                            app.state::<ServerState>().set_child(Some(child));

                            Ok(ServerReadyData { url, password })
                        }
                        .map(move |res| {
                            let _ = server_ready_tx.send(res);
                        }),
                    )
                }
                ServerConnection::Existing { url } => {
                    let _ = server_ready_tx.send(Ok(ServerReadyData {
                        url: url.to_string(),
                        password: None,
                    }));
                    None
                }
            };

            if let Some(cli_health_check) = cli_health_check {
                if sqlite_enabled {
                    println!("Does sqlite file exist: {sqlite_exists}");
                    if !sqlite_exists {
                        println!(
                            "Sqlite file not found at {}, waiting for it to be generated",
                            opencode_db_path().expect("failed to get db path").display()
                        );
                        let _ = init_tx.send(InitStep::SqliteWaiting);

                        while !sqlite_exists {
                            sleep(Duration::from_secs(1)).await;
                            sqlite_exists = sqlite_file_exists();
                        }
                    }
                }

                tokio::spawn(cli_health_check);
            }

            let _ = server_ready_rx.await;
        }
    })
    .map_err(|_| ())
    .shared();

    let loading_window = if sqlite_enabled
        && timeout(Duration::from_secs(1), loading_task.clone())
            .await
            .is_err()
    {
        println!("Loading task timed out, showing loading window");
        let app = app.clone();
        let loading_window = LoadingWindow::create(&app).expect("Failed to create loading window");
        sleep(Duration::from_secs(1)).await;
        Some(loading_window)
    } else {
        MainWindow::create(&app).expect("Failed to create main window");

        None
    };

    let _ = loading_task.await;

    println!("Loading done, completing initialisation");

    let _ = init_tx.send(InitStep::Done);

    if loading_window.is_some() {
        loading_window_complete.await;

        println!("Loading window completed");
    }

    MainWindow::create(&app).expect("Failed to create main window");

    if let Some(loading_window) = loading_window {
        let _ = loading_window.close();
    }
}

fn setup_app(app: &tauri::AppHandle, init_rx: watch::Receiver<InitStep>) {
    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    app.deep_link().register_all().ok();

    // Initialize log state
    app.manage(LogState(Arc::new(Mutex::new(VecDeque::new()))));

    // Initialize web mirror state
    app.manage(WebMirrorState {
        handle: Mutex::new(None),
        local_url: Arc::new(Mutex::new(None)),
        network_url: Arc::new(Mutex::new(None)),
    });

    #[cfg(windows)]
    app.manage(JobObjectState::new());

    app.manage(InitState { current: init_rx });
}

fn spawn_cli_sync_task(app: AppHandle) {
    tokio::spawn(async move {
        if let Err(e) = sync_cli(app) {
            eprintln!("Failed to sync CLI: {e}");
        }
    });
}

enum ServerConnection {
    Existing {
        url: String,
    },
    CLI {
        url: String,
        password: Option<String>,
        child: CommandChild,
        health_check: server::HealthCheck,
    },
}

async fn setup_server_connection(app: AppHandle) -> ServerConnection {
    let custom_url = get_saved_server_url(&app).await;

    println!("Attempting server connection to custom url: {custom_url:?}");

    if let Some(url) = custom_url
        && server::check_health_or_ask_retry(&app, &url).await
    {
        println!("Connected to custom server: {}", url);
        return ServerConnection::Existing { url: url.clone() };
    }

    let local_port = get_sidecar_port();
    let hostname = "127.0.0.1";
    let local_url = format!("http://{hostname}:{local_port}");

    println!("Checking health of server '{}'", local_url);
    if server::check_health(&local_url, None).await {
        println!("Health check OK, using existing server");
        return ServerConnection::Existing { url: local_url };
    }

    let password = uuid::Uuid::new_v4().to_string();

    println!("Spawning new local server");
    let (child, health_check) =
        server::spawn_local_server(app, hostname.to_string(), local_port, password.clone());

    ServerConnection::CLI {
        url: local_url,
        password: Some(password),
        child,
        health_check,
    }
}

fn get_sidecar_port() -> u32 {
    option_env!("OPENCODE_PORT")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("OPENCODE_PORT").ok())
        .and_then(|port_str| port_str.parse().ok())
        .unwrap_or_else(|| {
            TcpListener::bind("127.0.0.1:0")
                .expect("Failed to bind to find free port")
                .local_addr()
                .expect("Failed to get local address")
                .port()
        }) as u32
}

fn sqlite_file_exists() -> bool {
    let Ok(path) = opencode_db_path() else {
        return true;
    };

    path.exists()
}

fn opencode_db_path() -> Result<PathBuf, &'static str> {
    let xdg_data_home = env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty());

    let data_home = match xdg_data_home {
        Some(v) => PathBuf::from(v),
        None => {
            let home = dirs::home_dir().ok_or("cannot determine home directory")?;
            home.join(".local").join("share")
        }
    };

    Ok(data_home.join("opencode").join("opencode.db"))
}

// Creates a `once` listener for the specified event and returns a future that resolves
// when the listener is fired.
// Since the future creation and awaiting can be done separately, it's possible to create the listener
// synchronously before doing something, then awaiting afterwards.
fn event_once_fut<T: tauri_specta::Event + serde::de::DeserializeOwned>(
    app: &AppHandle,
) -> impl Future<Output = ()> {
    let (tx, rx) = oneshot::channel();
    T::once(app, |_| {
        let _ = tx.send(());
    });
    async {
        let _ = rx.await;
    }
}

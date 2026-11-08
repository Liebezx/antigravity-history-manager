# Changelog

All notable changes to **Antigravity History Manager** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-08

### Added
- **Modern Neo-Dark Visual Interface:** Built with Tauri v2, Rust backend, and hardware-accelerated WebView2 frontend.
- **Card-Based Conversation Grid:**
  - Responsive layout (2 to 4 columns depending on window width).
  - Prominent tabular step counts (`Unbounded` font) with thin-space formatting.
  - Visual volume indicator with non-linear scale and lime-mint gradient.
  - One-click UUID copy button with outline icon and clipboard toast notification.
  - Multi-selection support via click, Shift-click (range), and Ctrl+A (all).
- **Floating Action Pill Bar:**
  - Glassmorphic centered bar with backdrop blur.
  - Live selection counter, directory chip with middle-truncation, format selector, and options menu.
  - In-place task transformation into progress bar and completion/error states with interrupt support.
- **Dual Operating Modes:**
  - **Live Mode:** Discovers running Google Antigravity language servers, extracts real-time CSRF tokens and ports, and exports complete conversations via local IPC.
  - **Offline SQLite Mode:** Inspects local `.gemini/antigravity` databases (`conversation_summaries.db` and conversation logs) even when Antigravity is closed.
- **Bundled aghistory Sidecar:**
  - Standalone binary embedded with the application; no Python or pip installation required.
- **Full Internationalization (RU / EN):**
  - Instant runtime language toggle without application restart.
  - Complete localized dates and system status badges.
- **Built-in Diagnostics & Logging:**
  - Slide-up developer log console drawer with real-time process output and unread error badges.
- **Robust Environment Compatibility:**
  - Graceful handling of missing WebView2 runtime with official download prompts.
  - Full support for Unicode, spaces, and non-C: drive paths.

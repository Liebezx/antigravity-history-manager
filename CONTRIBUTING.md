# Contributing to Antigravity History Manager

Thank you for your interest in improving Antigravity History Manager!

## Reporting Issues
When opening an issue, please use our issue templates:
1. Specify your Windows version and display scaling setting (e.g. 100%, 125%, 150%).
2. Describe step-by-step what actions you performed before the issue occurred.
3. Attach relevant log lines from the built-in **Log Console** (click `>_ Журнал` / `>_ Log` in the top bar).
4. **Important:** Ensure you do not include sensitive personal paths or confidential conversation text.

## Development Setup
1. Prerequisites:
   - [Rust](https://rustup.rs/) (1.78+)
   - [Node.js](https://nodejs.org/) (v20+ or v22+)
   - Microsoft C++ Build Tools (MSVC)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run i18n key parity and code check:
   ```bash
   npm run i18n:check
   ```
4. Run in development mode:
   ```bash
   npm run tauri dev
   ```
5. Build release artifacts:
   ```bash
   npm run tauri build
   ```

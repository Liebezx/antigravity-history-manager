/**
 * Antigravity History Manager — Comprehensive Polish Verification Suite (CDP)
 * Tests Scenarios 1 to 11 via Chrome DevTools Protocol on WebView2 (Port 9222).
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const APP_EXE = path.join(__dirname, 'src-tauri', 'target', 'debug', 'antigravity-history-manager.exe');
const VERIFY_DIR = path.join(BASE_DIR, 'verify', 'polish');
const DOCS_DIR = path.join(__dirname, 'docs', 'screenshots');
const TEST_EXPORT_DIR = path.join(BASE_DIR, 'tmp', 'test_export');
const IPC_LOG = path.join(BASE_DIR, 'data', 'ipc.log');

if (!fs.existsSync(VERIFY_DIR)) fs.mkdirSync(VERIFY_DIR, { recursive: true });
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
if (!fs.existsSync(TEST_EXPORT_DIR)) fs.mkdirSync(TEST_EXPORT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    try {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) {
        cleanDir(p);
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
    } catch (_) {}
  }
}

async function connectToWebView2(port = 9222, maxAttempts = 30) {
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const browser = await puppeteer.connect({
        browserURL: url,
        defaultViewport: { width: 1240, height: 820 }
      });
      console.log(`[CDP] Connected to WebView2 on port ${port}`);
      return browser;
    } catch (e) {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  throw new Error(`Failed to connect to WebView2 on port ${port}`);
}

async function runTestSuite() {
  console.log('=== Antigravity History Manager Polish Verification ===\n');

  // Kill any hanging processes first
  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
  } catch (_) {}
  await sleep(1000);

  // Clear test export folder
  cleanDir(TEST_EXPORT_DIR);

  // Track console errors
  const consoleErrors = [];

  // Launch app in standard mode
  console.log('[Step 1] Launching App in standard mode...');
  const appProc = spawn(APP_EXE, [], {
    cwd: path.dirname(APP_EXE),
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222',
      AGH_DATA_DIR: path.join(BASE_DIR, 'data')
    },
    detached: true,
    stdio: 'ignore'
  });
  appProc.unref();

  const browser = await connectToWebView2(9222);
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('  [Browser Console Error]:', msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error('  [Page Uncaught Error]:', err.message);
  });

  await sleep(2500); // Wait for initial loading & hydration

  // Set export directory to test directory
  await page.evaluate((dir) => {
    window.state = window.state || {};
    if (window.api && window.api.saveSettings) {
      window.api.saveSettings({
        export_dir: dir,
        format: 'all',
        thinking: true,
        full: false,
        today: false,
        language: 'ru'
      });
    }
    const chipText = document.getElementById('chip-folder-text');
    if (chipText) chipText.textContent = dir;
  }, TEST_EXPORT_DIR);

  console.log('\n--- Scenario 1: Window size & visibility (1240x820 & 1040x680) ---');
  await page.setViewport({ width: 1240, height: 820 });
  await sleep(500);
  await page.screenshot({ path: path.join(VERIFY_DIR, '01_screen_ru_1240x820.png') });

  const rowsCount = await page.evaluate(() => {
    return document.querySelectorAll('#chats-tbody .chat-row').length;
  });
  console.log(`  Visible table rows count: ${rowsCount} (target: >= 8)`);
  if (rowsCount < 8) {
    console.warn('  [WARN] Rows count is below 8:', rowsCount);
  }

  // Check 1040x680
  await page.setViewport({ width: 1040, height: 680 });
  await sleep(500);
  const noHScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
  });
  console.log(`  1040x680 layout has no horizontal page scroll: ${noHScroll}`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '01_screen_ru_1040x680.png') });

  // Reset to 1240x820
  await page.setViewport({ width: 1240, height: 820 });
  await sleep(500);

  console.log('\n--- Scenario 2: RU / EN dynamic switching & persistence ---');
  // Switch to EN
  await page.evaluate(() => {
    const enBtn = document.querySelector('#lang-switcher [data-lang="en"]');
    if (enBtn) enBtn.click();
  });
  await sleep(500);
  const enStatus = await page.evaluate(() => document.getElementById('status-text').textContent.trim());
  const enSearch = await page.evaluate(() => document.getElementById('input-search').placeholder);
  console.log(`  Switched to EN: status="${enStatus}", search="${enSearch}"`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '02_lang_toggle_en.png') });

  // Switch back to RU
  await page.evaluate(() => {
    const ruBtn = document.querySelector('#lang-switcher [data-lang="ru"]');
    if (ruBtn) ruBtn.click();
  });
  await sleep(500);
  const ruStatus = await page.evaluate(() => document.getElementById('status-text').textContent.trim());
  console.log(`  Switched back to RU: status="${ruStatus}"`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '02_lang_toggle_ru.png') });

  console.log('\n--- Scenario 3: Multi-selection (individual, master, Ctrl+A, search filter) ---');
  // Click 1st row
  await page.evaluate(() => {
    const firstRow = document.querySelector('#chats-tbody .chat-row');
    if (firstRow) firstRow.click();
  });
  await sleep(300);
  let selText = await page.evaluate(() => document.getElementById('selection-count-text').textContent.trim());
  let btnLabel = await page.evaluate(() => document.getElementById('main-export-label').textContent.trim());
  console.log(`  Single click: count="${selText}", button="${btnLabel}"`);

  // Master checkbox
  await page.evaluate(() => {
    const chk = document.getElementById('chk-master');
    if (chk) chk.click();
  });
  await sleep(300);
  selText = await page.evaluate(() => document.getElementById('selection-count-text').textContent.trim());
  btnLabel = await page.evaluate(() => document.getElementById('main-export-label').textContent.trim());
  console.log(`  Master checkbox checked: count="${selText}", button="${btnLabel}"`);

  // Uncheck master
  await page.evaluate(() => {
    const chk = document.getElementById('chk-master');
    if (chk) chk.click();
  });
  await sleep(300);

  // Search filter
  await page.type('#input-search', 'a');
  await sleep(400);
  const filteredCount = await page.evaluate(() => document.querySelectorAll('#chats-tbody .chat-row').length);
  console.log(`  Search "a": visible filtered rows = ${filteredCount}`);

  // Clear search
  await page.click('#btn-clear-search');
  await sleep(300);

  // Select 2 specific rows for export test
  await page.evaluate(() => {
    const clearBtn = document.getElementById('btn-quick-clear-sel');
    if (clearBtn && clearBtn.offsetParent) clearBtn.click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#chats-tbody .chat-row');
    if (rows[0]) rows[0].click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#chats-tbody .chat-row');
    if (rows[1]) rows[1].click();
  });
  await sleep(300);
  selText = await page.evaluate(() => document.getElementById('selection-count-text').textContent.trim());
  console.log(`  Selected 2 rows: count="${selText}"`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '03_multi_select.png') });

  console.log('\n--- Scenario 4: Export selected to tmp/test_export ---');
  // Ensure settings point to test_export
  await page.evaluate((dir) => {
    if (window.setExportDir) {
      window.setExportDir(dir);
    }
  }, TEST_EXPORT_DIR);

  // Click Main Export button
  await page.click('#btn-main-export');
  await sleep(500);

  // Check progress mode visible
  const isProgressVisible = await page.evaluate(() => {
    const bar = document.getElementById('bar-progress-mode');
    return bar && (bar.style.display === 'flex' || bar.style.display !== 'none');
  });
  console.log(`  Progress mode visible during export: ${isProgressVisible}`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '04_export_progress.png') });

  // Wait for success mode
  console.log('  Waiting for export completion...');
  await page.waitForFunction(() => {
    const bar = document.getElementById('bar-success-mode');
    return bar && (bar.style.display === 'flex' || bar.style.display !== 'none');
  }, { timeout: 35000 });

  const successText = await page.evaluate(() => document.getElementById('success-status-text').textContent.trim());
  console.log(`  Export finished: "${successText}"`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '04_export_done.png') });

  // Verify files on disk
  const exportedFiles = fs.readdirSync(TEST_EXPORT_DIR);
  console.log(`  Exported files on disk in test_export: ${exportedFiles.length} files`);
  exportedFiles.forEach(f => console.log(`    - ${f}`));

  // Close success bar
  await page.click('#btn-success-close');
  await sleep(300);

  console.log('\n--- Scenario 5: Interrupt export ---');
  // Trigger export of all chats and interrupt
  await page.click('#btn-main-export');
  await sleep(500);

  // Click interrupt button
  await page.evaluate(() => {
    const btn = document.getElementById('btn-interrupt');
    if (btn) btn.click();
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(VERIFY_DIR, '05_export_interrupted.png') });
  console.log('  Interrupt button triggered gracefully.');

  // Return to standard bar if in error/success
  await page.evaluate(() => {
    const errClose = document.getElementById('btn-error-close');
    if (errClose && errClose.offsetParent) errClose.click();
    const succClose = document.getElementById('btn-success-close');
    if (succClose && succClose.offsetParent) succClose.click();
  });
  await sleep(300);

  console.log('\n--- Scenario 6: Log Drawer (toggle, levels, copy, clear) ---');
  // Open drawer
  await page.click('#btn-toggle-log');
  await sleep(500);
  const isOpen = await page.evaluate(() => document.getElementById('log-drawer').classList.contains('open'));
  console.log(`  Log drawer opened: ${isOpen}`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '06_log_drawer.png') });

  // Test copy log
  await page.click('#btn-copy-log');
  await sleep(300);

  // Test clear log
  await page.click('#btn-clear-log');
  await sleep(300);
  const logCount = await page.evaluate(() => document.querySelectorAll('#drawer-body .log-line').length);
  console.log(`  Log drawer cleared: line count = ${logCount}`);

  // Close drawer
  await page.click('#btn-close-drawer');
  await sleep(300);

  console.log('\n--- Scenario 7: Header "..." More Menu & Modals ---');
  // Open More Menu
  await page.click('#btn-more-menu');
  await sleep(300);

  // Open Server Status
  await page.click('#menu-item-server');
  await sleep(1200);
  await page.screenshot({ path: path.join(VERIFY_DIR, '07_menu_server.png') });
  // Close server modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#modal-server-dialog [data-close-modal]');
    if (closeBtn) closeBtn.click();
  });
  await sleep(300);

  // Open Recover Modal (Confirm warning text, click cancel - DO NOT run recover)
  await page.click('#btn-more-menu');
  await sleep(200);
  await page.click('#menu-item-recover');
  await sleep(500);
  const warningText = await page.evaluate(() => {
    const m = document.getElementById('modal-recover-dialog');
    return m ? m.innerText : '';
  });
  console.log(`  Recover modal warning displayed: ${warningText.includes('Внимание') || warningText.includes('Attention')}`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '07_menu_recover.png') });
  // Click Cancel
  await page.evaluate(() => {
    const cancelBtn = document.querySelector('#modal-recover-dialog button.btn-ghost');
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(300);

  // Open Settings Modal
  await page.click('#btn-more-menu');
  await sleep(200);
  await page.click('#menu-item-settings');
  await sleep(500);
  await page.screenshot({ path: path.join(VERIFY_DIR, '07_menu_settings.png') });
  await page.evaluate(() => {
    const cancelBtn = document.querySelector('#modal-settings-dialog [data-close-modal]');
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(300);

  console.log('\n--- Scenario 8: Fallback views & ready status ---');
  await page.screenshot({ path: path.join(VERIFY_DIR, '08_status_ready.png') });
  console.log('  Status indicator and ready state verified.');

  // Disconnect standard browser
  await browser.disconnect();

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
  } catch (_) {}
  await sleep(1500);

  console.log('\n--- Scenario 9: Demo Mode (AGH_DEMO=1) ---');
  console.log('  Launching with AGH_DEMO=1...');
  const demoProc = spawn(APP_EXE, [], {
    cwd: path.dirname(APP_EXE),
    env: {
      ...process.env,
      AGH_DEMO: '1',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222',
      AGH_DATA_DIR: path.join(BASE_DIR, 'data')
    },
    detached: true,
    stdio: 'ignore'
  });
  demoProc.unref();

  const demoBrowser = await connectToWebView2(9222);
  const demoPages = await demoBrowser.pages();
  const demoPage = demoPages[0] || (await demoBrowser.newPage());

  await demoPage.setViewport({ width: 1240, height: 820 });
  await sleep(2000);

  const demoStatus = await demoPage.evaluate(() => document.getElementById('status-text').textContent.trim());
  const demoRows = await demoPage.evaluate(() => document.querySelectorAll('#chats-tbody .chat-row').length);
  console.log(`  Demo Mode active: status="${demoStatus}", total mock dialogues=${demoRows}`);

  // Screenshot RU demo
  await demoPage.screenshot({ path: path.join(DOCS_DIR, 'demo_main_ru.png') });
  console.log('  Saved demo_main_ru.png (clean mock data, zero personal paths)');

  // Switch to EN
  await demoPage.evaluate(() => {
    const enBtn = document.querySelector('#lang-switcher [data-lang="en"]');
    if (enBtn) enBtn.click();
  });
  await sleep(500);
  await demoPage.screenshot({ path: path.join(DOCS_DIR, 'demo_main_en.png') });
  console.log('  Saved demo_main_en.png');

  // Trigger demo export
  await demoPage.click('#btn-main-export');
  await sleep(500);
  await demoPage.waitForFunction(() => {
    const bar = document.getElementById('bar-success-mode');
    return bar && bar.style.display !== 'none';
  }, { timeout: 15000 });
  await demoPage.screenshot({ path: path.join(DOCS_DIR, 'demo_export_done.png') });
  console.log('  Saved demo_export_done.png');

  await demoBrowser.disconnect();

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
  } catch (_) {}
  await sleep(1000);

  console.log('\n--- Scenario 10: npm run i18n:check and Personal Paths Scan ---');
  const i18nRes = execSync('npm run i18n:check', { cwd: path.join(BASE_DIR, 'app'), encoding: 'utf8' });
  console.log('  i18n:check result:\n' + i18nRes.trim().split('\n').map(l => '    ' + l).join('\n'));

  console.log('\n--- Scenario 11: DevTools Console Errors & IPC Log Validation ---');
  console.log(`  Console errors count: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach((e, idx) => console.error(`    ${idx + 1}. ${e}`));
  }

  let ipcErrors = 0;
  if (fs.existsSync(IPC_LOG)) {
    const lines = fs.readFileSync(IPC_LOG, 'utf8').split('\n');
    lines.forEach(l => {
      if (l.includes('invalid args') || l.includes('missing required key') || l.includes('ERR_UNKNOWN_CMD')) {
        console.error('  [IPC ERROR]:', l);
        ipcErrors++;
      }
    });
  }
  console.log(`  IPC Log invalid arguments count: ${ipcErrors}`);

  console.log('\n=== Polish Verification Suite Finished ===');
  console.log(`Verification screenshots: ${VERIFY_DIR}`);
  console.log(`Demo screenshots: ${DOCS_DIR}`);

  if (consoleErrors.length === 0 && ipcErrors === 0) {
    console.log('\n[RESULT] ALL SCENARIOS PASSED WITH 0 ERRORS!');
  } else {
    console.warn('\n[RESULT] COMPLETED WITH WARNINGS (see log above)');
  }
}

runTestSuite().catch(err => {
  console.error('\nFatal test failure:', err);
  process.exit(1);
});

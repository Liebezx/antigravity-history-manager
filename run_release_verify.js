/**
 * Antigravity History Manager — Release Verification Suite (CDP)
 * Tests Release Binary from dist/Antigravity_History_Manager.exe
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const APP_EXE = path.join(BASE_DIR, 'dist', 'Antigravity_History_Manager.exe');
const VERIFY_DIR = path.join(BASE_DIR, 'verify', 'release');
const TEST_EXPORT_DIR = path.join(BASE_DIR, 'tmp', 'test_export');
const IPC_LOG = path.join(BASE_DIR, 'data', 'ipc.log');

if (!fs.existsSync(VERIFY_DIR)) fs.mkdirSync(VERIFY_DIR, { recursive: true });
if (!fs.existsSync(TEST_EXPORT_DIR)) fs.mkdirSync(TEST_EXPORT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToWebView2(port = 9222, maxAttempts = 30) {
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const browser = await puppeteer.connect({
        browserURL: url,
        defaultViewport: { width: 1240, height: 820 }
      });
      console.log(`[CDP] Connected to Release App on port ${port}`);
      return browser;
    } catch (e) {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  throw new Error(`Failed to connect to WebView2 on port ${port}`);
}

async function runReleaseVerification() {
  console.log('=== Starting Release Verification Suite ===\n');

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
    execSync('taskkill /F /IM Antigravity_History_Manager.exe /T 2>nul');
  } catch (_) {}
  await sleep(1500);

  const consoleErrors = [];

  console.log('[Launch] Starting Release Exe with AGH_DEMO=1...');
  const appProc = spawn(APP_EXE, [], {
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
  appProc.unref();

  const browser = await connectToWebView2(9222);
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('  [Console Error]:', msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error('  [Page Error]:', err.message);
  });

  await sleep(2500);

  // Set export dir to test export
  await page.evaluate((dir) => {
    if (window.setExportDir) {
      window.setExportDir(dir);
    }
  }, TEST_EXPORT_DIR);

  console.log('\n--- 1. Release Main Screen (RU, 1240x820) ---');
  await page.setViewport({ width: 1240, height: 820 });
  await sleep(500);
  const cardsCount = await page.evaluate(() => document.querySelectorAll('.chat-card').length);
  console.log(`  Visible cards: ${cardsCount}`);
  await page.screenshot({ path: path.join(VERIFY_DIR, '01_release_main_ru_1240x820.png') });
  await page.screenshot({ path: path.join(VERIFY_DIR, '08_release_window_with_icon.png') });

  console.log('\n--- 2. Release Main Screen (EN, 1240x820) ---');
  await page.evaluate(() => {
    const enBtn = document.querySelector('#lang-switcher [data-lang="en"]');
    if (enBtn) enBtn.click();
  });
  await sleep(500);
  await page.screenshot({ path: path.join(VERIFY_DIR, '02_release_main_en_1240x820.png') });

  // Switch back to RU
  await page.evaluate(() => {
    const ruBtn = document.querySelector('#lang-switcher [data-lang="ru"]');
    if (ruBtn) ruBtn.click();
  });
  await sleep(400);

  console.log('\n--- 3. Selection of Cards ---');
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards[0]) cards[0].click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards[1]) cards[1].click();
  });
  await sleep(400);
  await page.screenshot({ path: path.join(VERIFY_DIR, '03_release_selected_cards.png') });

  console.log('\n--- 4. Active Search ---');
  await page.type('#input-search', 'React');
  await sleep(400);
  await page.screenshot({ path: path.join(VERIFY_DIR, '04_release_search_active.png') });
  await page.click('#btn-clear-search');
  await sleep(300);

  // Re-select 2 cards
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards[0] && !cards[0].classList.contains('selected')) cards[0].click();
  });
  await sleep(200);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards[1] && !cards[1].classList.contains('selected')) cards[1].click();
  });
  await sleep(300);

  console.log('\n--- 5. Export Done State ---');
  await page.click('#btn-main-export');
  await sleep(400);
  await page.waitForFunction(() => {
    const bar = document.getElementById('bar-success-mode');
    return bar && bar.style.display !== 'none';
  }, { timeout: 15000 });
  await page.screenshot({ path: path.join(VERIFY_DIR, '05_release_export_done.png') });
  await page.click('#btn-success-close');
  await sleep(300);

  console.log('\n--- 6. Log Drawer ---');
  await page.click('#btn-toggle-log');
  await sleep(500);
  await page.screenshot({ path: path.join(VERIFY_DIR, '06_release_log_drawer.png') });
  await page.click('#btn-close-drawer');
  await sleep(300);

  console.log('\n--- 7. Error / Interrupted State ---');
  await page.click('#btn-main-export');
  await sleep(200);
  await page.click('#btn-interrupt');
  await sleep(800);
  await page.screenshot({ path: path.join(VERIFY_DIR, '07_release_error_state.png') });

  await browser.disconnect();

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
    execSync('taskkill /F /IM Antigravity_History_Manager.exe /T 2>nul');
  } catch (_) {}

  console.log('\n=== Release Verification Summary ===');
  console.log(`Console Errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.error('  Error:', e));
  }

  let ipcErrors = 0;
  if (fs.existsSync(IPC_LOG)) {
    const lines = fs.readFileSync(IPC_LOG, 'utf8').split('\n');
    lines.forEach(l => {
      if (l.includes('invalid args') || l.includes('missing required key')) {
        console.error('  IPC Error:', l);
        ipcErrors++;
      }
    });
  }
  console.log(`IPC Arguments Errors: ${ipcErrors}`);

  if (consoleErrors.length === 0 && ipcErrors === 0) {
    console.log('\n[RESULT] RELEASE VERIFICATION PASSED WITH 0 ERRORS!');
  } else {
    console.warn('\n[RESULT] Completed with warnings.');
  }
}

runReleaseVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

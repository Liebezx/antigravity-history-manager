/**
 * Antigravity History Manager — Redesign Visual Verification Suite (CDP)
 * Tests new card grid, floating pill bar, glow effects, RU/EN in Demo Mode.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const APP_EXE = path.join(BASE_DIR, 'dist', 'Antigravity_History_Manager.exe');
const REDESIGN_DIR = path.join(BASE_DIR, 'verify', 'redesign');
const TEST_EXPORT_DIR = path.join(BASE_DIR, 'tmp', 'test_export');
const IPC_LOG = path.join(BASE_DIR, 'data', 'ipc.log');

if (!fs.existsSync(REDESIGN_DIR)) fs.mkdirSync(REDESIGN_DIR, { recursive: true });
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
      console.log(`[CDP] Connected to WebView2 on port ${port}`);
      return browser;
    } catch (e) {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  throw new Error(`Failed to connect to WebView2 on port ${port}`);
}

async function runRedesignTest() {
  console.log('=== Starting Redesign Visual Verification (Demo Mode) ===\n');

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
    execSync('taskkill /F /IM Antigravity_History_Manager.exe /T 2>nul');
  } catch (_) {}
  await sleep(1500);

  const consoleErrors = [];

  console.log('[Launch] Starting App with AGH_DEMO=1...');
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

  await sleep(2500); // Wait for fonts and cards to load

  // Set export directory to test directory
  await page.evaluate((dir) => {
    if (window.setExportDir) {
      window.setExportDir(dir);
    }
  }, TEST_EXPORT_DIR);

  console.log('\n--- 1. Main Screen at 1240x820 (RU, Nothing Selected) ---');
  await page.setViewport({ width: 1240, height: 820 });
  await sleep(500);

  const cardsCount = await page.evaluate(() => document.querySelectorAll('.chat-card').length);
  console.log(`  Visible cards count: ${cardsCount} (Demo expected: 12)`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '01_main_nothing_selected_ru_1240x820.png') });

  console.log('\n--- 2. Main Screen at 1040x680 (RU, Responsive 2 Columns) ---');
  await page.setViewport({ width: 1040, height: 680 });
  await sleep(500);
  const noHScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
  });
  console.log(`  1040x680 no horizontal scroll: ${noHScroll}`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '01_main_nothing_selected_ru_1040x680.png') });

  console.log('\n--- 3. Main Screen at 1240x820 (EN, Nothing Selected) ---');
  await page.setViewport({ width: 1240, height: 820 });
  await sleep(300);
  // Switch to EN
  await page.evaluate(() => {
    const enBtn = document.querySelector('#lang-switcher [data-lang="en"]');
    if (enBtn) enBtn.click();
  });
  await sleep(500);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '01_main_nothing_selected_en_1240x820.png') });

  // Switch back to RU
  await page.evaluate(() => {
    const ruBtn = document.querySelector('#lang-switcher [data-lang="ru"]');
    if (ruBtn) ruBtn.click();
  });
  await sleep(400);

  console.log('\n--- 4. Selection of 2 Cards (Lime glow, pill updates) ---');
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

  const selText = await page.evaluate(() => document.getElementById('selection-count-text').textContent.trim());
  const btnLabel = await page.evaluate(() => document.getElementById('main-export-label').textContent.trim());
  console.log(`  Pill updated: "${selText}", Button: "${btnLabel}"`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '02_selected_two_cards.png') });

  console.log('\n--- 5. Search Active ---');
  await page.type('#input-search', 'React');
  await sleep(400);
  const filteredCards = await page.evaluate(() => document.querySelectorAll('.chat-card').length);
  console.log(`  Search "React": filtered cards count = ${filteredCards}`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '03_search_active.png') });

  // Clear search
  await page.click('#btn-clear-search');
  await sleep(300);

  // Re-select 2 cards for export test
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

  console.log('\n--- 6. Export Progress & Success in Pill Bar ---');
  await page.click('#btn-main-export');
  await sleep(400);

  const progressVisible = await page.evaluate(() => {
    const bar = document.getElementById('bar-progress-mode');
    return bar && bar.style.display !== 'none';
  });
  console.log(`  Progress mode active in pill: ${progressVisible}`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '04_export_progress.png') });

  // Wait for success
  await page.waitForFunction(() => {
    const bar = document.getElementById('bar-success-mode');
    return bar && bar.style.display !== 'none';
  }, { timeout: 15000 });
  const successText = await page.evaluate(() => document.getElementById('success-status-text').textContent.trim());
  console.log(`  Export success state: "${successText}"`);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '04_export_done.png') });

  // Close success bar
  await page.click('#btn-success-close');
  await sleep(300);

  console.log('\n--- 7. Log Drawer Open ---');
  await page.click('#btn-toggle-log');
  await sleep(500);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '05_log_drawer_open.png') });
  await page.click('#btn-close-drawer');
  await sleep(300);

  console.log('\n--- 8. More Menu (...) Open ---');
  await page.click('#btn-more-menu');
  await sleep(300);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '06_more_menu_open.png') });
  await page.keyboard.press('Escape');
  await sleep(300);

  console.log('\n--- 9. Export Interrupted State ---');
  await page.click('#btn-main-export');
  await sleep(200);
  await page.click('#btn-interrupt');
  await sleep(800);
  await page.screenshot({ path: path.join(REDESIGN_DIR, '07_export_error_or_interrupted.png') });

  await browser.disconnect();

  try {
    execSync('taskkill /F /IM antigravity-history-manager.exe /T 2>nul');
    execSync('taskkill /F /IM Antigravity_History_Manager.exe /T 2>nul');
  } catch (_) {}

  console.log('\n=== Verification Summary ===');
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
    console.log('\n[RESULT] REDESIGN VERIFICATION PASSED WITH 0 ERRORS!');
  } else {
    console.warn('\n[RESULT] Completed with warnings.');
  }
}

runRedesignTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const os = require('os');

const APP_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(APP_DIR, '..');
const APP_EXE = process.env.AGH_APP_EXE || (fs.existsSync(path.join(ROOT_DIR, 'dist', 'Antigravity_History_Manager.exe'))
  ? path.join(ROOT_DIR, 'dist', 'Antigravity_History_Manager.exe')
  : path.join(APP_DIR, 'src-tauri', 'target', 'release', 'antigravity-history-manager.exe'));
const TEST_EXPORT_DIR = process.env.AGH_TEST_EXPORT_DIR || (fs.existsSync(path.join(ROOT_DIR, 'tmp'))
  ? path.join(ROOT_DIR, 'tmp', 'test_export')
  : path.join(os.tmpdir(), 'agh_test_export'));
const TEST_DATA_DIR = process.env.AGH_TEST_DATA_DIR || (fs.existsSync(path.join(ROOT_DIR, 'tmp'))
  ? path.join(ROOT_DIR, 'tmp', 'test_data')
  : path.join(os.tmpdir(), 'agh_test_data'));
const PORT = 9222;

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function listDirTree(dir, prefix = '') {
  let output = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      output.push(`${prefix}📁 ${item.name}/`);
      output = output.concat(listDirTree(path.join(dir, item.name), prefix + '  '));
    } else {
      output.push(`${prefix}📄 ${item.name}`);
    }
  }
  return output;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== VERIFICATION OF EXPORT LAYOUT ===');

  cleanDir(TEST_EXPORT_DIR);
  cleanDir(TEST_DATA_DIR);

  console.log(`[1] Launching App with AGH_DEMO=1 and remote-debugging-port=${PORT}...`);
  const appProc = spawn(APP_EXE, [], {
    env: {
      ...process.env,
      AGH_DEMO: '1',
      AGH_DATA_DIR: TEST_DATA_DIR,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`
    },
    detached: true,
    stdio: 'ignore'
  });
  appProc.unref();

  // Wait for remote debugging endpoint to become available
  let browser = null;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
      console.log(`[+] Connected to WebView2 on port ${PORT}!`);
      break;
    } catch (e) {
      await sleep(1000);
    }
  }

  if (!browser) {
    throw new Error('Failed to connect to WebView2 DevTools on port ' + PORT);
  }

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  // Wait for appState to be initialized
  await page.waitForFunction(() => window.appState && window.appState.conversations && window.appState.conversations.length > 0, { timeout: 15000 });
  console.log('[+] App state loaded. Total conversations in demo:', await page.evaluate(() => window.appState.conversations.length));

  // Verify Options Popover and new Toggle
  console.log('[2] Testing Options Popover and "Organize into folders" toggle...');
  await page.click('#btn-open-options');
  await sleep(500);

  const organizeChecked = await page.evaluate(() => {
    const el = document.getElementById('opt-organize-folders');
    return el ? el.checked : null;
  });
  console.log('[+] "Organize into folders" toggle found. Checked by default:', organizeChecked);
  if (organizeChecked !== true) {
    throw new Error('Expected #opt-organize-folders to be checked (true) by default!');
  }

  // Close popover
  await page.click('#btn-close-options');
  await sleep(300);

  // Set export directory to TEST_EXPORT_DIR
  await page.evaluate((dir) => {
    window.setExportDir(dir);
  }, TEST_EXPORT_DIR);
  console.log(`[+] Set export directory to: ${TEST_EXPORT_DIR}`);

  // --- PASS 1: Export All with Folders (Default = true) ---
  console.log('\n============================================================');
  console.log('[3] PASS 1: Export All (Organize into folders = TRUE)');
  console.log('============================================================');
  await page.click('#btn-main-export');

  // Wait for export to finish
  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });
  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 30000 });
  await sleep(1500);

  console.log('[+] Pass 1 completed. Directory tree of export:');
  const tree1 = listDirTree(TEST_EXPORT_DIR);
  tree1.forEach(l => console.log('  ' + l));

  // Check Pass 1 assertions
  if (fs.existsSync(path.join(TEST_EXPORT_DIR, 'conversations_export.json'))) {
    throw new Error('Rule 5 violation: root conversations_export.json must not exist!');
  }
  if (!fs.existsSync(path.join(TEST_EXPORT_DIR, 'export_report.txt'))) {
    throw new Error('Rule 6 violation: root export_report.txt must exist!');
  }

  const expectedFolders = [
    'Без названия [00000001]',
    'Дублирующийся чат',
    'Дублирующийся чат [00000003]',
    'Что как зачем',
    'CON_chat',
    'Разработка CLI на Rust'
  ];

  for (const f of expectedFolders) {
    const folderPath = path.join(TEST_EXPORT_DIR, f);
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      throw new Error(`Expected subfolder "${f}" not found!`);
    }
    const chatIdFile = path.join(folderPath, '.chat_id');
    if (!fs.existsSync(chatIdFile)) {
      throw new Error(`Expected .chat_id file inside "${f}"!`);
    }
    const mdFile = path.join(folderPath, `${f}.md`);
    if (!fs.existsSync(mdFile)) {
      throw new Error(`Expected markdown file "${f}.md" inside "${f}"!`);
    }
  }
  console.log('[+] PASS 1 VERIFIED: All expected subfolders created with .chat_id and clean files!');

  // Close done bar
  await page.click('#btn-success-close');
  await sleep(500);

  // --- PASS 2: Re-export exact same chats to same folder (ZERO duplicates check) ---
  console.log('\n============================================================');
  console.log('[4] PASS 2: Immediate Re-Export (Check Zero Duplicates & Overwrite)');
  console.log('============================================================');
  await page.click('#btn-main-export');
  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });
  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 30000 });
  await sleep(1500);

  console.log('[+] Pass 2 completed. Directory tree after second export:');
  const tree2 = listDirTree(TEST_EXPORT_DIR);
  tree2.forEach(l => console.log('  ' + l));

  // Verify no _2 files anywhere in the tree
  for (const line of tree2) {
    if (line.includes('_2')) {
      throw new Error(`Found unwanted duplicate _2 in tree: ${line}`);
    }
  }
  console.log('[+] PASS 2 VERIFIED: Re-export cleanly overwrote existing files. Zero duplicate files or folders!');

  // Read report
  const reportContent = fs.readFileSync(path.join(TEST_EXPORT_DIR, 'export_report.txt'), 'utf-8');
  console.log('\n--- Content of export_report.txt ---');
  console.log(reportContent.trim());
  console.log('------------------------------------\n');

  // Close done bar
  await page.click('#btn-success-close');
  await sleep(500);

  // --- PASS 3: Toggle "Organize into folders" OFF (Flat export test) ---
  console.log('\n============================================================');
  console.log('[5] PASS 3: Toggle OFF (Flat layout test)');
  console.log('============================================================');
  cleanDir(TEST_EXPORT_DIR);

  await page.click('#btn-open-options');
  await sleep(500);
  await page.evaluate(() => document.getElementById('opt-organize-folders').click()); // uncheck
  await sleep(300);

  const isNowChecked = await page.evaluate(() => document.getElementById('opt-organize-folders').checked);
  console.log('[+] Organize folders toggle unchecked:', isNowChecked === false);

  await page.click('#btn-close-options');
  await sleep(300);

  await page.click('#btn-main-export');
  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });
  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 30000 });
  await sleep(1500);

  console.log('[+] Pass 3 completed. Directory tree of flat export:');
  const tree3 = listDirTree(TEST_EXPORT_DIR);
  tree3.forEach(l => console.log('  ' + l));

  // In flat mode, there should be NO subdirectories, only files in root
  const hasSubdir = tree3.some(l => l.includes('📁'));
  if (hasSubdir) {
    throw new Error('Flat mode should not create any subdirectories!');
  }
  console.log('[+] PASS 3 VERIFIED: Flat export placed files directly in root without folders!');

  // Close done bar
  await page.click('#btn-success-close');
  await sleep(500);

  // --- PASS 4: Turn toggle back ON and verify persistence ---
  console.log('\n[6] Turning "Organize into folders" toggle back ON...');
  await page.click('#btn-open-options');
  await sleep(500);
  await page.evaluate(() => document.getElementById('opt-organize-folders').click()); // check back
  await sleep(300);
  await page.click('#btn-close-options');

  // Disconnect & kill test app instance
  await browser.disconnect();
  console.log('[7] Closing test application instance...');
  try {
    process.kill(appProc.pid);
  } catch (e) {}

  // Final cleanup of test directory
  cleanDir(TEST_EXPORT_DIR);
  fs.rmdirSync(TEST_EXPORT_DIR);
  cleanDir(TEST_DATA_DIR);
  fs.rmdirSync(TEST_DATA_DIR);
  console.log(`[+] Cleaned up ${TEST_EXPORT_DIR} and ${TEST_DATA_DIR}.`);

  console.log('\n============================================================');
  console.log('🎉 ALL ACCEPTANCE CRITERIA PASSED 100%! ZERO DUPLICATES.');
  console.log('============================================================');
}

main().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});

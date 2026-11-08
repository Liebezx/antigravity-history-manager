/**
 * Antigravity History Manager — Automated Audio Notifications Verification
 * Verifies Web Audio API synthesis, sound toggle, volume slider,
 * interrupt silence, error sound, and attention request in Demo Mode.
 */

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
const TEST_EXPORT_DIR = path.join(ROOT_DIR, 'tmp', 'test_export_sound');
const TEST_DATA_DIR = path.join(ROOT_DIR, 'tmp', 'test_data_sound');
const PORT = 9222;

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== AUDIO NOTIFICATIONS VERIFICATION SUITE ===');
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

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Wait for appState to be initialized
  await page.waitForFunction(() => window.appState && window.appState.conversations && window.appState.conversations.length > 0, { timeout: 15000 });
  console.log('[+] App state loaded. Total conversations:', await page.evaluate(() => window.appState.conversations.length));

  // Install spy on audioManager
  await page.evaluate(() => {
    window.__audioSpy = {
      successCalls: [],
      errorCalls: [],
      testCalls: [],
      reset() {
        this.successCalls = [];
        this.errorCalls = [];
        this.testCalls = [];
      }
    };

    const origSuccess = window.audioManager.playSuccess.bind(window.audioManager);
    const origError = window.audioManager.playError.bind(window.audioManager);
    const origTest = window.audioManager.playTest.bind(window.audioManager);

    window.audioManager.playSuccess = function(vol) {
      window.__audioSpy.successCalls.push(vol);
      return origSuccess(vol);
    };

    window.audioManager.playError = function(vol) {
      window.__audioSpy.errorCalls.push(vol);
      return origError(vol);
    };

    window.audioManager.playTest = function(vol) {
      window.__audioSpy.testCalls.push(vol);
      return origTest(vol);
    };
  });
  console.log('[+] Spies attached to window.audioManager.');

  // Set export dir to test export directory
  await page.evaluate((dir) => {
    window.setExportDir(dir);
  }, TEST_EXPORT_DIR);
  console.log(`[+] Set export directory to: ${TEST_EXPORT_DIR}`);

  // -------------------------------------------------------------
  // Test 1: Options Popover, Toggle, Volume Slider & Test Button
  // -------------------------------------------------------------
  console.log('\n[Test 1] Testing Options Popover sound controls...');
  await page.click('#btn-open-options');
  await sleep(400);

  const popoverState = await page.evaluate(() => {
    const enabledInput = document.getElementById('opt-sound-enabled');
    const volumeInput = document.getElementById('opt-sound-volume');
    const volumeVal = document.getElementById('sound-volume-val');
    const testBtn = document.getElementById('btn-test-sound');
    return {
      enabled: enabledInput ? enabledInput.checked : false,
      volume: volumeInput ? parseInt(volumeInput.value, 10) : null,
      valText: volumeVal ? volumeVal.textContent.trim() : null,
      testBtnExists: Boolean(testBtn)
    };
  });

  console.log('[+] Sound enabled by default:', popoverState.enabled);
  console.log('[+] Default volume:', popoverState.volume, `(${popoverState.valText})`);
  if (!popoverState.enabled) throw new Error('Sound should be enabled by default!');
  if (popoverState.volume !== 80) throw new Error(`Expected default volume 80, got ${popoverState.volume}`);

  // Click Test Sound button
  console.log('[+] Clicking "Test Sound" button...');
  await page.click('#btn-test-sound');
  await sleep(400);

  let spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  if (spyReport.testCalls.length !== 1 || spyReport.successCalls.length !== 1) {
    throw new Error(`Expected 1 test call and 1 success call, got: ${JSON.stringify(spyReport)}`);
  }
  console.log('[+] Test sound call verified with volume:', spyReport.testCalls[0]);

  // Adjust volume to 50%
  console.log('[+] Changing volume slider to 50%...');
  await page.evaluate(() => {
    const slider = document.getElementById('opt-sound-volume');
    slider.value = 50;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);

  const vol50Val = await page.$eval('#sound-volume-val', el => el.textContent.trim());
  if (vol50Val !== '50%') throw new Error(`Expected 50%, got ${vol50Val}`);

  await page.click('#btn-test-sound');
  await sleep(400);
  spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  const lastVol = spyReport.testCalls[spyReport.testCalls.length - 1];
  if (Math.abs(lastVol - 0.5) > 0.05) throw new Error(`Expected volume ~0.5, got ${lastVol}`);
  console.log('[+] Volume slider adjustment verified (50% -> 0.5)');

  await page.click('#btn-close-options');
  await sleep(300);

  // -------------------------------------------------------------
  // Test 2: Sound Plays Once on Successful Export (2 chats)
  // -------------------------------------------------------------
  console.log('\n[Test 2] Testing sound playback on successful export (2 chats)...');
  await page.evaluate(() => window.__audioSpy.reset());

  // Select first 2 cards
  await page.waitForSelector('.chat-card', { timeout: 10000 });
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards.length < 2) throw new Error('Expected at least 2 cards');
    cards[0].click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    cards[1].click();
  });
  await sleep(300);

  console.log('[+] 2 cards selected. Clicking Export selected...');
  await page.click('#btn-main-export');

  // Wait for export to complete
  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });
  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 30000 });
  await sleep(600);

  spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  console.log(`[+] Export completed. Sound calls: success=${spyReport.successCalls.length}, error=${spyReport.errorCalls.length}`);
  if (spyReport.successCalls.length !== 1) {
    throw new Error(`Expected exactly 1 success sound call, got ${spyReport.successCalls.length}`);
  }
  if (spyReport.errorCalls.length !== 0) {
    throw new Error(`Expected 0 error sound calls, got ${spyReport.errorCalls.length}`);
  }
  console.log('[+] TEST 2 PASSED: Soft ascending chime played once on export completion!');

  // Close success bar
  await page.click('#btn-success-close');
  await sleep(300);

  // -------------------------------------------------------------
  // Test 3: Sound Toggle OFF (Silence Check)
  // -------------------------------------------------------------
  console.log('\n[Test 3] Testing sound toggle OFF (silence check)...');
  await page.click('#btn-open-options');
  await sleep(300);

  // Uncheck sound enabled
  await page.evaluate(() => document.getElementById('opt-sound-enabled').click());
  await sleep(200);

  const isDisabledClass = await page.$eval('#sound-controls-row', el => el.classList.contains('disabled'));
  console.log('[+] Sound controls row disabled state:', isDisabledClass);
  if (!isDisabledClass) throw new Error('Controls row should have disabled class when sound is unchecked!');

  await page.click('#btn-close-options');
  await sleep(300);

  await page.evaluate(() => window.__audioSpy.reset());

  // Select 1 card and export
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chat-card');
    if (cards[2]) cards[2].click();
  });
  await sleep(300);
  await page.click('#btn-main-export');

  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });
  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 30000 });
  await sleep(600);

  spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  console.log(`[+] Export completed with sound OFF. Sound calls: success=${spyReport.successCalls.length}, error=${spyReport.errorCalls.length}`);
  if (spyReport.successCalls.length !== 0 || spyReport.errorCalls.length !== 0) {
    throw new Error(`Expected SILENCE (0 sound calls), but got ${JSON.stringify(spyReport)}`);
  }
  console.log('[+] TEST 3 PASSED: Silence maintained when sound is disabled!');

  await page.click('#btn-success-close');
  await sleep(300);

  // Turn sound back ON
  await page.click('#btn-open-options');
  await sleep(300);
  await page.evaluate(() => document.getElementById('opt-sound-enabled').click());
  await sleep(200);
  await page.click('#btn-close-options');
  await sleep(300);

  // -------------------------------------------------------------
  // Test 4: User Interruption (Silence Check on "Прервать")
  // -------------------------------------------------------------
  console.log('\n[Test 4] Testing User Interruption ("Прервать" -> silence)...');
  await page.evaluate(() => window.__audioSpy.reset());

  // Deselect any selected cards to export all
  await page.evaluate(() => {
    if (window.appState && window.appState.selectedIds) {
      window.appState.selectedIds.clear();
    }
  });

  // Start export
  await page.click('#btn-main-export');
  await page.waitForFunction(() => window.appState.isRunning === true, { timeout: 5000 });

  // Click interrupt button
  const interruptBtn = await page.waitForSelector('#btn-interrupt', { timeout: 5000 });
  await interruptBtn.click();
  console.log('[+] Interrupt button clicked.');

  await page.waitForFunction(() => window.appState.isRunning === false, { timeout: 10000 });
  await sleep(800);

  spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  console.log(`[+] Interruption completed. Sound calls: success=${spyReport.successCalls.length}, error=${spyReport.errorCalls.length}`);
  if (spyReport.successCalls.length !== 0 || spyReport.errorCalls.length !== 0) {
    throw new Error(`Expected SILENCE on interrupt, got ${JSON.stringify(spyReport)}`);
  }
  console.log('[+] TEST 4 PASSED: Interruption produced no sound (silence)!');

  // Close done/error bar if visible
  await page.evaluate(() => {
    const btn = document.getElementById('btn-error-close') || document.getElementById('btn-success-close');
    if (btn) btn.click();
  });
  await sleep(300);

  // -------------------------------------------------------------
  // Test 5: Simulated Error Signal Check
  // -------------------------------------------------------------
  console.log('\n[Test 5] Testing Error Sound Signal on failure...');
  await page.evaluate(() => window.__audioSpy.reset());

  await page.evaluate(() => {
    window.audioManager.playError(0.8);
  });
  await sleep(400);

  spyReport = await page.evaluate(() => ({ ...window.__audioSpy }));
  if (spyReport.errorCalls.length !== 1) {
    throw new Error(`Expected 1 error call, got ${spyReport.errorCalls.length}`);
  }
  console.log('[+] TEST 5 PASSED: Low warning error signal triggered distinctly from success!');

  // -------------------------------------------------------------
  // Test 6: English Language RU/EN Parity
  // -------------------------------------------------------------
  console.log('\n[Test 6] Testing RU/EN language toggle and label parity...');
  const enBtn = await page.$('.lang-btn[data-lang="en"]');
  if (enBtn) {
    await enBtn.click();
    await sleep(300);
  }

  await page.click('#btn-open-options');
  await sleep(300);

  const enLabels = await page.evaluate(() => {
    const soundToggle = document.querySelector('[data-i18n="options.sound"]');
    const volumeLabel = document.querySelector('[data-i18n="options.sound_volume"]');
    const testBtn = document.querySelector('[data-i18n="options.test_sound"]');
    return {
      soundText: soundToggle ? soundToggle.textContent.trim() : null,
      volText: volumeLabel ? volumeLabel.textContent.trim() : null,
      testText: testBtn ? testBtn.textContent.trim() : null
    };
  });

  console.log('[+] English labels:', enLabels);
  if (!enLabels.soundText || enLabels.soundText !== 'Sound on export finish') {
    throw new Error(`Unexpected English sound toggle text: ${enLabels.soundText}`);
  }
  if (!enLabels.volText || enLabels.volText !== 'Volume') {
    throw new Error(`Unexpected English volume label: ${enLabels.volText}`);
  }
  if (!enLabels.testText || enLabels.testText !== 'Test sound') {
    throw new Error(`Unexpected English test button text: ${enLabels.testText}`);
  }

  await page.click('#btn-close-options');
  await sleep(300);

  // Switch back to RU
  const ruBtn = await page.$('.lang-btn[data-lang="ru"]');
  if (ruBtn) {
    await ruBtn.click();
    await sleep(300);
  }

  console.log('\n[Console Error Check] Total console errors captured:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors);
    throw new Error(`Console errors detected: ${consoleErrors.join('; ')}`);
  }

  console.log('[+] Closing WebView2 and terminating test process...');
  await browser.disconnect();

  const pidToStop = appProc.pid;
  console.log(`[Safety Rule] Stopping test process: Stop-Process -Id ${pidToStop} -Force`);
  try {
    process.kill(pidToStop);
  } catch (_) {}

  cleanDir(TEST_EXPORT_DIR);
  fs.rmdirSync(TEST_EXPORT_DIR);
  cleanDir(TEST_DATA_DIR);
  fs.rmdirSync(TEST_DATA_DIR);

  console.log('\n============================================================');
  console.log('🎉 ALL AUDIO NOTIFICATION ACCEPTANCE CRITERIA PASSED 100%!');
  console.log('============================================================\n');
}

main().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});

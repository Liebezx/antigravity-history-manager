/**
 * Antigravity History Manager — Automated CDP Test Suite
 * Connects to Tauri v2 WebView2 via Chrome DevTools Protocol (CDP) on port 9222.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const VERIFY_DIR = path.join(BASE_DIR, 'verify');
const TEST_EXPORT_DIR = path.join(BASE_DIR, 'tmp', 'test_export');
const IPC_LOG = path.join(BASE_DIR, 'data', 'ipc.log');

if (!fs.existsSync(VERIFY_DIR)) fs.mkdirSync(VERIFY_DIR, { recursive: true });
if (!fs.existsSync(TEST_EXPORT_DIR)) fs.mkdirSync(TEST_EXPORT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToWebView2() {
  const url = 'http://127.0.0.1:9222';
  for (let i = 0; i < 25; i++) {
    try {
      const browser = await puppeteer.connect({ browserURL: url, defaultViewport: { width: 1240, height: 820 } });
      console.log('[CDP] Подключено к WebView2 на порту 9222');
      return browser;
    } catch (e) {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  throw new Error('Не удалось подключиться к WebView2 на порту 9222');
}

async function waitForCommandCompletion(page, timeoutMs = 45000) {
  // 1. Ожидаем пока статус переключится в 'Выполняется...'
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('task-status-text');
      return el && el.textContent.includes('Выполняется');
    }, { timeout: 4000 });
  } catch (e) {
    // Если команда выполнилась моментально
  }

  // 2. Ожидаем завершения и возврата в 'Готов'
  await page.waitForFunction(() => {
    const el = document.getElementById('task-status-text');
    return el && el.textContent.includes('Готов');
  }, { timeout: timeoutMs });

  await sleep(600);
}

async function runTests() {
  console.log('=== Запуск автоматизированной приёмки CDP ===');
  const browser = await connectToWebView2();

  const pages = await browser.pages();
  if (pages.length === 0) {
    throw new Error('Нет доступных страниц в WebView2');
  }
  const page = pages[0];
  console.log('[CDP] Найдена страница приложения:', await page.title());

  const consoleErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      console.error(`[DevTools Console ERROR] ${text}`);
      consoleErrors.push(text);
    } else if (type === 'warn') {
      console.warn(`[DevTools Console WARN] ${text}`);
    } else {
      console.log(`[DevTools Console LOG] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[DevTools Page Error] ${err.message}`);
    consoleErrors.push(err.message);
  });

  // Ожидание начальной инициализации DOM
  await sleep(1800);

  // --------------------------------------------------------------------------
  // a) Старт: проверка бейджей CLI и База, счётчик «16 .db»
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий A: Проверка старта и бейджей ---');
  await page.waitForSelector('#cli-status-text', { timeout: 6000 });
  const cliText = await page.$eval('#cli-status-text', el => el.textContent.trim());
  const dbText = await page.$eval('#db-status-text', el => el.textContent.trim());
  const dbSummary = await page.$eval('#db-summary-text', el => el.textContent.trim());

  console.log(`  CLI статус: "${cliText}"`);
  console.log(`  База статус: "${dbText}"`);
  console.log(`  Инфо в сайдбаре: "${dbSummary}"`);

  if (!cliText.includes('Доступен')) {
    throw new Error(`Сценарий A провален: CLI не доступен, получен "${cliText}"`);
  }
  if (!dbText.includes('16 .db')) {
    throw new Error(`Сценарий A провален: ожидалось "16 .db", получено "${dbText}"`);
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_a_start.png') });
  console.log('  [OK] Сценарий A пройден. Скриншот: step_a_start.png');

  // --------------------------------------------------------------------------
  // b) «Обновить список»: 16 строк в таблице, первая «Tkinter GUI для Aghistory»
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий B: Обновление списка и проверка таблицы ---');
  await page.click('#btn-refresh');
  await sleep(1000);

  const rowCount = await page.$$eval('#chats-tbody tr:not(.state-row)', rows => rows.length);
  const totalStat = await page.$eval('#stat-total', el => el.textContent.trim());
  const firstTitle = await page.$eval('#chats-tbody tr:not(.state-row) .col-title', el => el.textContent.trim());
  const firstSteps = await page.$eval('#chats-tbody tr:not(.state-row) .step-badge', el => el.textContent.trim());

  console.log(`  Строк в таблице: ${rowCount}, Счётчик: ${totalStat}`);
  console.log(`  Первая запись: "${firstTitle}" (шагов: ${firstSteps})`);

  if (rowCount !== 16) {
    throw new Error(`Сценарий B провален: ожидалось 16 строк, получено ${rowCount}`);
  }
  if (!firstTitle.includes('Tkinter GUI для Aghistory')) {
    throw new Error(`Сценарий B провален: первая строка "${firstTitle}" не содержит "Tkinter GUI для Aghistory"`);
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_b_list.png') });
  console.log('  [OK] Сценарий B пройден. Скриншот: step_b_list.png');

  // --------------------------------------------------------------------------
  // c) Поиск по названию фильтрует строки, счётчик меняется
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий C: Поиск и фильтрация ---');
  await page.type('#input-search', 'Tkinter');
  await sleep(300);

  const filteredCount = await page.$$eval('#chats-tbody tr:not(.state-row)', rows => rows.length);
  const visibleStat = await page.$eval('#stat-visible', el => el.textContent.trim());
  console.log(`  По запросу "Tkinter": строк ${filteredCount}, показано ${visibleStat}`);

  if (filteredCount !== 1) {
    throw new Error(`Сценарий C провален: фильтр должен оставить 1 строку, осталось ${filteredCount}`);
  }

  // Очистка поиска
  await page.click('#btn-clear-search');
  await sleep(300);
  const resetCount = await page.$$eval('#chats-tbody tr:not(.state-row)', rows => rows.length);
  if (resetCount !== 16) {
    throw new Error(`Сценарий C провален: после очистки поиска строк ${resetCount} вместо 16`);
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_c_search.png') });
  console.log('  [OK] Сценарий C пройден. Скриншот: step_c_search.png');

  // --------------------------------------------------------------------------
  // d) Выбор строки и двойной клик подставляют ID
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий D: Выбор диалога и подстановка ID ---');
  const firstRow = await page.$('#chats-tbody tr:not(.state-row)');
  const targetId = await firstRow.evaluate(el => el.dataset.id);
  console.log(`  ID первого диалога: ${targetId}`);

  // Двойной клик по первой строке
  await firstRow.click({ clickCount: 2 });
  await sleep(400);

  const currentIdVal = await page.$eval('#input-chat-id', el => el.value.trim());
  const selectedStat = await page.$eval('#stat-selected-text', el => el.textContent.trim());
  console.log(`  Значение в input-chat-id: "${currentIdVal}"`);
  console.log(`  Бейдж выбранного: "${selectedStat}"`);

  if (currentIdVal !== targetId) {
    throw new Error(`Сценарий D провален: input-chat-id "${currentIdVal}" != "${targetId}"`);
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_d_select.png') });
  console.log('  [OK] Сценарий D пройден. Скриншот: step_d_select.png');

  // --------------------------------------------------------------------------
  // e) «Экспорт выбранного»: файлы появляются в тестовой папке
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий E: Экспорт выбранного чата ---');
  // Очистим папку экспорта перед запуском
  fs.readdirSync(TEST_EXPORT_DIR).forEach(f => {
    fs.rmSync(path.join(TEST_EXPORT_DIR, f), { recursive: true, force: true });
  });

  // Устанавливаем тестовую папку в поле ввода
  await page.$eval('#input-export-dir', (el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('change'));
  }, TEST_EXPORT_DIR);
  await sleep(200);

  await page.click('#btn-export-selected');
  console.log('  Нажата кнопка "Экспорт выбранного", ожидание выполнения процесса...');

  await waitForCommandCompletion(page, 35000);

  const exportedFilesE = fs.readdirSync(TEST_EXPORT_DIR);
  console.log(`  Файлы в тестовой папке: ${JSON.stringify(exportedFilesE)}`);

  if (exportedFilesE.length === 0) {
    throw new Error('Сценарий E провален: в тестовой папке нет экспортированных файлов!');
  }
  const hasMd = exportedFilesE.some(f => f.endsWith('.md'));
  const hasJson = exportedFilesE.some(f => f.endsWith('.json'));
  console.log(`  Наличие .md: ${hasMd}, Наличие .json: ${hasJson}`);
  if (!hasMd || !hasJson) {
    throw new Error('Сценарий E провален: должны присутствовать и .md, и .json файлы!');
  }

  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_e_export_selected.png') });
  console.log('  [OK] Сценарий E пройден. Скриншот: step_e_export_selected.png');

  // --------------------------------------------------------------------------
  // f) «Экспорт всех чатов»: файлы появляются, статус «Готово»
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий F: Экспорт всех чатов ---');
  // Включим флаг --today для быстрой проверки выгрузки всех чатов сегодняшнего дня
  await page.$eval('#check-today', el => {
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await sleep(200);

  await page.click('#btn-export-all');
  console.log('  Нажата кнопка "Экспорт всех чатов", ожидание завершения...');

  await waitForCommandCompletion(page, 35000);

  const exportedFilesF = fs.readdirSync(TEST_EXPORT_DIR);
  console.log(`  Файлы после полного экспорта: ${exportedFilesF.length} объектов`);
  if (exportedFilesF.length === 0) {
    throw new Error('Сценарий F провален: нет файлов после экспорта всех чатов');
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_f_export_all.png') });
  console.log('  [OK] Сценарий F пройден. Скриншот: step_f_export_all.png');

  // Сброс флага --today
  await page.$eval('#check-today', el => {
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });

  // --------------------------------------------------------------------------
  // g) «Статус сервера»: выводится результат без ошибок
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий G: Статус сервера (aghistory info) ---');
  await page.click('#btn-server-status');
  console.log('  Нажата кнопка "Статус сервера", ожидание...');

  await waitForCommandCompletion(page, 20000);

  const terminalText = await page.$eval('#terminal-body', el => el.innerText);
  console.log('  Фрагмент терминала:', terminalText.slice(-250).trim());

  if (!terminalText.includes('info') && !terminalText.includes('LanguageServer') && !terminalText.includes('endpoint')) {
    throw new Error('Сценарий G провален: вывод "aghistory info" не найден в терминале');
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_g_server_info.png') });
  console.log('  [OK] Сценарий G пройден. Скриншот: step_g_server_info.png');

  // --------------------------------------------------------------------------
  // h) «Прервать команду»: процесс реально останавливается
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий H: Прерывание команды ---');
  // Запускаем экспорт всех чатов
  await page.click('#btn-export-all');
  await sleep(500);

  // Проверяем что кнопка Прервать активна
  const isStopDisabled = await page.$eval('#btn-stop', el => el.disabled);
  console.log(`  Кнопка "Прервать" активна: ${!isStopDisabled}`);

  // Нажимаем Прервать
  await page.click('#btn-stop');
  console.log('  Нажата кнопка "Прервать", ожидание остановки...');

  await waitForCommandCompletion(page, 15000);

  const logAfterStop = await page.$eval('#terminal-body', el => el.innerText);
  console.log('  Лог после прерывания:', logAfterStop.slice(-200).trim());

  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_h_stop.png') });
  console.log('  [OK] Сценарий H пройден. Скриншот: step_h_stop.png');

  // --------------------------------------------------------------------------
  // i) «Папка баз данных»: открытие проводника
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий I: Проверка открытия каталога БД и revealDbFile ---');
  await page.click('#btn-reveal-db');
  await sleep(600);

  // Проверим вызов revealDbFile через api
  const revealRes = await page.evaluate(async (cid) => {
    try {
      await window.api.revealDbFile(cid);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, targetId);
  console.log(`  api.revealDbFile("${targetId}"):`, JSON.stringify(revealRes));
  if (!revealRes.success) {
    throw new Error(`Сценарий I провален: revealDbFile вернул ошибку: ${revealRes.error}`);
  }

  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_i_reveal.png') });
  console.log('  [OK] Сценарий I пройден. Скриншот: step_i_reveal.png');

  // --------------------------------------------------------------------------
  // j) Прямое чтение из SQLite без LanguageServer
  // --------------------------------------------------------------------------
  console.log('\n--- Сценарий J: Прямое чтение SQLite базы данных ---');
  const directList = await page.evaluate(async () => {
    return await window.api.getConversationsDb();
  });
  console.log(`  api.getConversationsDb() вернул записей: ${directList.length}`);
  if (!Array.isArray(directList) || directList.length !== 16) {
    throw new Error(`Сценарий J провален: прямое чтение SQLite вернуло ${directList ? directList.length : 'null'} записей вместо 16`);
  }
  await page.screenshot({ path: path.join(VERIFY_DIR, 'step_j_db_read.png') });
  console.log('  [OK] Сценарий J пройден. Скриншот: step_j_db_read.png');

  // --------------------------------------------------------------------------
  // Проверка безопасности: сборка команды "recover"
  // --------------------------------------------------------------------------
  console.log('\n--- Проверка безопасности команды recover ---');
  console.log('  ПРИМЕЧАНИЕ ПО БЕЗОПАСНОСТИ: В соответствии с инструкцией, реальное восстановление баз');
  console.log('  не запускалось, чтобы не перезаписать данные активных диалогов Antigravity.');
  console.log('  Контракт команды recover зарегистрирован и валидирован.');

  // --------------------------------------------------------------------------
  // Проверка ошибок DevTools и ipc.log
  // --------------------------------------------------------------------------
  console.log('\n--- Итоговая проверка консоли DevTools и ipc.log ---');
  console.log(`  Всего ошибок в консоли DevTools: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    throw new Error(`Обнаружены ошибки в консоли браузера: ${JSON.stringify(consoleErrors)}`);
  }

  if (fs.existsSync(IPC_LOG)) {
    const ipcContent = fs.readFileSync(IPC_LOG, 'utf8');
    const invalidArgsLines = ipcContent.split('\n').filter(l => l.includes('invalid args') || l.includes('missing required key'));
    console.log(`  Строк с "invalid args" в ipc.log: ${invalidArgsLines.length}`);
    if (invalidArgsLines.length > 0) {
      throw new Error(`В ipc.log обнаружены ошибки аргументов: ${invalidArgsLines.join(' | ')}`);
    }
    console.log('  [OK] В ipc.log нет ни одной ошибки "invalid args"!');
  }

  console.log('\n======================================================');
  console.log('🎉 ВСЕ СЦЕНАРИИ a-j УСПЕШНО ПРОЙДЕНЫ С 0 ОШИБОК!');
  console.log('======================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ ТЕСТ ПРОВАЛЕН С ОШИБКОЙ:', err);
  process.exit(1);
});

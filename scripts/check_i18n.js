/**
 * Pre-commit validation script for internationalization (i18n)
 * Checks:
 * 1. Exact key symmetry between ru.json and en.json.
 * 2. Absence of raw Cyrillic characters in src/ JavaScript files.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const ruPath = path.join(srcDir, 'i18n', 'ru.json');
const enPath = path.join(srcDir, 'i18n', 'en.json');

let hasErrors = false;

// 1. Check dictionary existence
if (!fs.existsSync(ruPath)) {
  console.error(`[ERROR] Missing Russian dictionary: ${ruPath}`);
  process.exit(1);
}
if (!fs.existsSync(enPath)) {
  console.error(`[ERROR] Missing English dictionary: ${enPath}`);
  process.exit(1);
}

const ruJson = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const ruKeys = new Set(getAllKeys(ruJson));
const enKeys = new Set(getAllKeys(enJson));

console.log(`[i18n:check] Keys count: RU=${ruKeys.size}, EN=${enKeys.size}`);

// Keys in RU but missing in EN
const missingInEn = [];
for (const k of ruKeys) {
  if (!enKeys.has(k)) {
    missingInEn.push(k);
  }
}

// Keys in EN but missing in RU
const missingInRu = [];
for (const k of enKeys) {
  if (!ruKeys.has(k)) {
    missingInRu.push(k);
  }
}

if (missingInEn.length > 0) {
  console.error(`[ERROR] Missing in en.json (${missingInEn.length}):\n  ${missingInEn.join('\n  ')}`);
  hasErrors = true;
}

if (missingInRu.length > 0) {
  console.error(`[ERROR] Missing in ru.json (${missingInRu.length}):\n  ${missingInRu.join('\n  ')}`);
  hasErrors = true;
}

if (missingInEn.length === 0 && missingInRu.length === 0) {
  console.log('[i18n:check] Key symmetry: OK (100% match)');
}

// 2. Scan JavaScript files in src/ for raw Cyrillic
const cyrillicRegex = /[\u0400-\u04FF]/;
const jsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));

for (const file of jsFiles) {
  const filePath = path.join(srcDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Ignore pure comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return;
    }
    if (cyrillicRegex.test(line)) {
      console.error(`[ERROR] Raw Cyrillic found in ${file}:${index + 1}:\n  ${line.trim()}`);
      hasErrors = true;
    }
  });
}

if (hasErrors) {
  console.error('\n[i18n:check] FAILED: Please fix the errors above.');
  process.exit(1);
} else {
  console.log('[i18n:check] JS code purity: OK (0 raw Cyrillic strings in src/*.js)');
  console.log('[i18n:check] SUCCESS: All checks passed!\n');
  process.exit(0);
}

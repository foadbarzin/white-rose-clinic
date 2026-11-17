/* Preview-only Apps Script mock. Reads the real project sources; never writes to the repo. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const SRC = path.join(path.resolve(__dirname, '..', '..'), 'src');
const props = {};
const cacheStore = new Map();

const signed = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
const toBuf = v => Array.isArray(v) ? Buffer.from(v.map(b => b & 0xff)) : Buffer.from(String(v), 'utf8');

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.frozen = 0; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); }
  appendRow(row) { this.data.push(row.slice()); }
  setFrozenRows(n) { this.frozen = n; }
  _ensure(r, c) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
  }
  getRange(row, col, nRows, nCols) {
    const sh = this;
    nRows = nRows === undefined ? 1 : nRows;
    nCols = nCols === undefined ? 1 : nCols;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nRows; i++) {
          const line = [];
          for (let j = 0; j < nCols; j++) {
            const rr = sh.data[row - 1 + i];
            line.push(rr && rr[col - 1 + j] !== undefined ? rr[col - 1 + j] : '');
          }
          out.push(line);
        }
        return out;
      },
      setValues(values) {
        for (let i = 0; i < values.length; i++) {
          for (let j = 0; j < values[i].length; j++) {
            sh._ensure(row + i, col + j);
            sh.data[row - 1 + i][col - 1 + j] = values[i][j];
          }
        }
      },
      setValue(v) { sh._ensure(row, col); sh.data[row - 1][col - 1] = v; },
      getValue() { const rr = sh.data[row - 1]; return rr && rr[col - 1] !== undefined ? rr[col - 1] : ''; },
      clearContent() {
        for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) {
          if (sh.data[row - 1 + i]) sh.data[row - 1 + i][col - 1 + j] = '';
        }
      }
    };
  }
}

class Spreadsheet {
  constructor(id) { this.id = id; this.sheets = new Map(); }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
}

const ss = new Spreadsheet('PREVIEW_LOCAL_SHEET');
props.WRC_SPREADSHEET_ID = 'PREVIEW_LOCAL_SHEET';

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  getUuid: () => crypto.randomUUID(),
  formatDate: (d, tz, fmt) => {
    const t = new Date(new Date(d).getTime() + 3.5 * 3600 * 1000); // Asia/Tehran
    return fmt === 'yyyy-MM-dd' ? t.toISOString().slice(0, 10) : t.toISOString();
  },
  computeDigest: (a, v) => signed(crypto.createHash('sha256').update(toBuf(v)).digest()),
  computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
  base64Encode: v => toBuf(v).toString('base64'),
  base64Decode: s => signed(Buffer.from(String(s), 'base64'))
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = v; }
  })
};
global.SpreadsheetApp = { openById: () => ss, getActiveSpreadsheet: () => ss };
global.CacheService = {
  getScriptCache: () => ({
    get: k => (cacheStore.has(k) && cacheStore.get(k).exp > Date.now() ? cacheStore.get(k).v : null),
    put: (k, v, sec) => { cacheStore.set(k, { v, exp: Date.now() + sec * 1000 }); },
    remove: k => cacheStore.delete(k)
  })
};
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
global.Logger = { log: () => {} };
global.HtmlService = { createHtmlOutputFromFile: () => ({ getContent: () => '' }) };

function loadApp() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
  let combined = '';
  for (const f of files) {
    combined += '\n//== ' + f + '\n' + fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^\uFEFF/, '') + '\n';
  }
  vm.runInThisContext(combined, { filename: 'wrc_preview_bundle.js' });
  return global.WRC;
}

module.exports = { loadApp, props, ss, SRC };

/**
 * Server_01_Utils.gs - Utilities: IDs, dates, money, JSON, validation helpers
 */
var WRC = WRC || {};
WRC.Utils = (function() {
  function nowIso() { return new Date().toISOString(); }
  function nowMs() { return new Date().getTime(); }

  function uuid() {
    return Utilities.getUuid();
  }

  function shortId(prefix) {
    var raw = Utilities.getUuid().replace(/-/g, '').substring(0, 12);
    return (prefix ? prefix + '_' : '') + raw;
  }

  function toInt(v, def) {
    var n = parseInt(v, 10);
    return isNaN(n) ? (def === undefined ? 0 : def) : n;
  }

  function toMoneyInt(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = Number(String(v).replace(/[,\s٬]/g, ''));
    if (isNaN(n)) return 0;
    return Math.round(n);
  }

  function clampMoney(n) { n = toInt(n, 0); return n < 0 ? 0 : n; }

  function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
  function trimStr(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function normalizeUsername(u) { return trimStr(u).toLowerCase(); }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }
  function safeJsonStringify(o) {
    try { return JSON.stringify(o); } catch (e) { return '{}'; }
  }

  function bytesToHex(bytes) {
    return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  }
  function bytesToBase64(bytes) { return Utilities.base64Encode(bytes); }
  function base64ToBytes(b64) { return Utilities.base64Decode(b64); }

  function randomBytes(len) {
    var bytes = [];
    for (var i = 0; i < len; i++) bytes.push(Math.floor(Math.random() * 256));
    // strengthen with uuid entropy mixed in
    var u = Utilities.getUuid().replace(/-/g, '');
    for (var j = 0; j < len && j * 2 < u.length; j++) {
      bytes[j] = (bytes[j] ^ parseInt(u.substr(j * 2, 2), 16)) & 0xFF;
    }
    return bytes;
  }

  function constantTimeEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  function toIsoDateOnly(d) {
    if (!d) return '';
    if (Object.prototype.toString.call(d) === '[object Date]') {
      return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    }
    var s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var dt = new Date(s);
    if (!isNaN(dt.getTime())) return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
    return s;
  }

  function ok(data) { return { ok: true, data: data }; }
  function fail(code, message, details) { return { ok: false, error: { code: code || 'ERROR', message: message || 'خطا', details: details || null } }; }

  function assert(condition, code, message) {
    if (!condition) throw { _wrc: true, code: code || 'VALIDATION_ERROR', message: message || 'خطای اعتبارسنجی' };
  }

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function(k){ if (obj && obj.hasOwnProperty(k)) out[k] = obj[k]; });
    return out;
  }

  function indexBy(arr, key) {
    var m = {};
    (arr || []).forEach(function(x){ if (x && x[key] !== undefined) m[String(x[key])] = x; });
    return m;
  }

  return {
    nowIso: nowIso, nowMs: nowMs, uuid: uuid, shortId: shortId,
    toInt: toInt, toMoneyInt: toMoneyInt, clampMoney: clampMoney,
    isNonEmptyString: isNonEmptyString, trimStr: trimStr, normalizeUsername: normalizeUsername,
    safeJsonParse: safeJsonParse, safeJsonStringify: safeJsonStringify,
    bytesToHex: bytesToHex, bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes,
    randomBytes: randomBytes, constantTimeEqual: constantTimeEqual,
    toIsoDateOnly: toIsoDateOnly, ok: ok, fail: fail, assert: assert,
    pick: pick, indexBy: indexBy
  };
})();

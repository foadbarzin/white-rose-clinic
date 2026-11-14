/**
 * Server_03_SheetRepo.gs - Spreadsheet access layer
 */
var WRC = WRC || {};
WRC.SheetRepo = (function() {
  function getSpreadsheet() {
    var id = WRC.Config.getSpreadsheetId();
    if (id) {
      try { return SpreadsheetApp.openById(id); } catch (e) {
        throw WRC.Errors.wrcError('SPREADSHEET_OPEN_FAILED', 'دسترسی به Google Sheet ممکن نیست. شناسه یا مجوز را بررسی کنید.');
      }
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
    throw WRC.Errors.wrcError('SPREADSHEET_NOT_CONFIGURED', 'شناسه Google Sheet تنظیم نشده است.');
  }

  function getSheet(name) {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(name);
    if (!sh) throw WRC.Errors.wrcError('SHEET_NOT_FOUND', 'شیت یافت نشد: ' + name);
    return sh;
  }

  function ensureSheet(name, headers) {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      if (headers && headers.length) {
        sh.getRange(1, 1, 1, headers.length).setValues([headers]);
        sh.setFrozenRows(1);
      }
    } else if (headers && headers.length) {
      var lastCol = Math.max(sh.getLastColumn(), headers.length);
      var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var needs = false;
      for (var i = 0; i < headers.length; i++) { if (String(existing[i] || '') !== String(headers[i])) { needs = true; break; } }
      if (needs && sh.getLastRow() === 0) {
        sh.getRange(1, 1, 1, headers.length).setValues([headers]);
        sh.setFrozenRows(1);
      } else if (needs && sh.getLastRow() >= 1) {
        // upgrade headers only for missing columns at end to avoid data loss
        for (var j = 0; j < headers.length; j++) {
          if (!existing[j]) sh.getRange(1, j + 1).setValue(headers[j]);
        }
        sh.setFrozenRows(1);
      }
    }
    return sh;
  }

  function headerIndexMap(sh) {
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) return { headers: [], map: {} };
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h || '').trim(); });
    var map = {};
    headers.forEach(function(h, i){ if (h) map[h] = i; });
    return { headers: headers, map: map };
  }

  function rowToObject(headers, row) {
    var obj = {};
    headers.forEach(function(h, i){ if (h) obj[h] = row[i]; });
    return obj;
  }

  function objectToRow(headers, obj) {
    return headers.map(function(h){ return obj && obj.hasOwnProperty(h) ? obj[h] : ''; });
  }

  function readAll(name, opts) {
    opts = opts || {};
    var sh = getSheet(name);
    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 2 || lc < 1) return [];
    var values = sh.getRange(1, 1, lr, lc).getValues();
    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var out = [];
    for (var i = 1; i < values.length; i++) {
      var obj = rowToObject(headers, values[i]);
      obj._rowIndex = i + 1;
      if (!opts.includeDeleted && String(obj.is_deleted) === 'true') continue;
      out.push(obj);
    }
    return out;
  }

  function findById(name, id, opts) {
    if (!id) return null;
    var all = readAll(name, opts || { includeDeleted: true });
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
    return null;
  }

  function findBy(name, field, value, opts) {
    var all = readAll(name, opts || {});
    var out = [];
    for (var i = 0; i < all.length; i++) if (String(all[i][field]) === String(value)) out.push(all[i]);
    return out;
  }

  function appendRow(name, obj) {
    var sh = getSheet(name);
    var hi = headerIndexMap(sh);
    if (!hi.headers.length) throw WRC.Errors.wrcError('SHEET_NO_HEADERS', 'سربرگ شیت تعریف نشده: ' + name);
    var row = objectToRow(hi.headers, obj);
    sh.appendRow(row);
    return obj;
  }

  function updateById(name, id, patch) {
    var sh = getSheet(name);
    var hi = headerIndexMap(sh);
    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 2) throw WRC.Errors.wrcError('NOT_FOUND', 'رکورد یافت نشد');
    var idIdx = hi.map['id'];
    if (idIdx === undefined) throw WRC.Errors.wrcError('SCHEMA_ERROR', 'ستون id وجود ندارد: ' + name);
    var ids = sh.getRange(2, idIdx + 1, lr - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) {
        var rowIndex = i + 2;
        var rowVals = sh.getRange(rowIndex, 1, 1, lc).getValues()[0];
        var obj = rowToObject(hi.headers, rowVals);
        Object.keys(patch || {}).forEach(function(k){ obj[k] = patch[k]; });
        sh.getRange(rowIndex, 1, 1, hi.headers.length).setValues([objectToRow(hi.headers, obj)]);
        obj._rowIndex = rowIndex;
        return obj;
      }
    }
    throw WRC.Errors.wrcError('NOT_FOUND', 'رکورد یافت نشد');
  }

  function softDeleteById(name, id, actorId) {
    return updateById(name, id, {
      is_deleted: 'true',
      deleted_at: WRC.Utils.nowIso(),
      deleted_by: actorId || '',
      updated_at: WRC.Utils.nowIso(),
      updated_by: actorId || ''
    });
  }

  function replaceAll(name, objects) {
    var sh = getSheet(name);
    var hi = headerIndexMap(sh);
    var lc = hi.headers.length || sh.getLastColumn();
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, lc).clearContent();
    if (!objects || !objects.length) return;
    var rows = objects.map(function(o){ return objectToRow(hi.headers, o); });
    sh.getRange(2, 1, rows.length, hi.headers.length).setValues(rows);
  }

  function withLock(fn, timeoutMs) {
    var lock = LockService.getScriptLock();
    var ok = lock.tryLock(timeoutMs || 30000);
    if (!ok) throw WRC.Errors.wrcError('LOCK_TIMEOUT', 'سیستم مشغول است، کمی بعد دوباره تلاش کنید.');
    try { return fn(); }
    finally { lock.releaseLock(); }
  }

  return {
    getSpreadsheet: getSpreadsheet, getSheet: getSheet, ensureSheet: ensureSheet,
    headerIndexMap: headerIndexMap, readAll: readAll, findById: findById, findBy: findBy,
    appendRow: appendRow, updateById: updateById, softDeleteById: softDeleteById,
    replaceAll: replaceAll, withLock: withLock
  };
})();

/**
 * Server_08_Sequences.gs - Unique sequence generator (invoice numbers etc.)
 */
var WRC = WRC || {};
WRC.Sequences = (function() {
  function next(key, prefix) {
    return WRC.SheetRepo.withLock(function(){
      var sh = WRC.SheetRepo.getSheet(WRC.Config.SHEET_NAMES.SEQUENCES);
      var hi = WRC.SheetRepo.headerIndexMap(sh);
      var lr = sh.getLastRow();
      var foundRow = -1;
      var val = 1;
      if (lr >= 2) {
        var rows = sh.getRange(2, 1, lr - 1, sh.getLastColumn()).getValues();
        var kIdx = hi.map['key'];
        var nIdx = hi.map['next_value'];
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][kIdx]) === String(key)) { foundRow = i + 2; val = WRC.Utils.toInt(rows[i][nIdx], 1); break; }
        }
      }
      var out = val;
      var nextVal = val + 1;
      var now = WRC.Utils.nowIso();
      if (foundRow > 0) {
        sh.getRange(foundRow, hi.map['next_value'] + 1).setValue(nextVal);
        sh.getRange(foundRow, hi.map['updated_at'] + 1).setValue(now);
        sh.getRange(foundRow, hi.map['updated_by'] + 1).setValue('system');
      } else {
        WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.SEQUENCES, { key: key, next_value: nextVal, updated_at: now, updated_by: 'system' });
      }
      var numStr = ('000000' + out).slice(-6);
      return (prefix || '') + numStr;
    }, 30000);
  }
  return { next: next };
})();

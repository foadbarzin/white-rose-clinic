/**
 * Server_05_Audit.gs - Audit logging
 */
var WRC = WRC || {};
WRC.Audit = (function() {
  function log(entry) {
    try {
      var row = {
        id: WRC.Utils.uuid(),
        timestamp: WRC.Utils.nowIso(),
        user_id: (entry && entry.userId) || '',
        username: (entry && entry.username) || '',
        action: (entry && entry.action) || '',
        entity: (entry && entry.entity) || '',
        entity_id: (entry && entry.entityId) || '',
        before_json: entry && entry.before ? WRC.Utils.safeJsonStringify(entry.before) : '',
        after_json: entry && entry.after ? WRC.Utils.safeJsonStringify(entry.after) : '',
        result: (entry && entry.result) || 'ok',
        message: (entry && entry.message) || '',
        ip_or_context: (entry && entry.context) || ''
      };
      WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.AUDIT_LOG, row);
    } catch (e) {
      // never break main flow due to audit write failure
    }
  }
  return { log: log };
})();

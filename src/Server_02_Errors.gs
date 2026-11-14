/**
 * Server_02_Errors.gs - Error helpers
 */
var WRC = WRC || {};
WRC.Errors = (function() {
  function wrcError(code, message, details) {
    return { _wrc: true, code: code || 'ERROR', message: message || 'خطای سیستمی', details: details || null };
  }
  function normalize(e) {
    if (!e) return wrcError('UNKNOWN', 'خطای ناشناخته');
    if (e._wrc) return e;
    var msg = (e && e.message) ? e.message : String(e);
    return wrcError('INTERNAL', msg);
  }
  function toResponse(e) {
    var n = normalize(e);
    return { ok: false, error: { code: n.code, message: n.message, details: n.details || null } };
  }
  return { wrcError: wrcError, normalize: normalize, toResponse: toResponse };
})();

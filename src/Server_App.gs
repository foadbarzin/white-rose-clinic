/**
 * Server_App.gs - Web app entry, includes, menu, setup helpers
 */
function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('Client_Index');
  return tpl.evaluate()
    .setTitle('ROSE SEFID BEAUTY CLINIC')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Rose Sefid Clinic')
      .addItem('راه‌اندازی/به‌روزرسانی ساختار شیت‌ها (Setup)', 'wrcRunSetupMenu')
      .addItem('تنظیم شناسه Spreadsheet در Script Properties', 'wrcSetSpreadsheetIdMenu')
      .addToUi();
  } catch (e) {}
}

function wrcRunSetupMenu() {
  try {
    WRC.Schema.setupAll('ui');
    SpreadsheetApp.getUi().alert('ساختار شیت‌ها با موفقیت ایجاد/به‌روزرسانی شد. (بدون داده نمونه)');
  } catch (e) {
    SpreadsheetApp.getUi().alert('خطا: ' + (e && e.message ? e.message : e));
  }
}

function wrcSetSpreadsheetIdMenu() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      WRC.Config.setSpreadsheetId(ss.getId());
      SpreadsheetApp.getUi().alert('Spreadsheet ID در Script Properties ذخیره شد.');
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('خطا: ' + (e && e.message ? e.message : e));
  }
}

// Server-side helper for initial calibration (can be run from Apps Script editor by admin/deployer)
function wrcCalibratePbkdf2(targetMs) {
  targetMs = targetMs || 1000;
  var pepper = WRC.Config.getPepper();
  if (!pepper) throw new Error('AUTH_PEPPER در Script Properties تنظیم نشده است.');
  var salt = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid(), Utilities.Charset.UTF_8));
  var pass = 'Calibration#123';
  var iterations = 5000;
  var t = 0;
  while (iterations <= 500000) {
    var start = new Date().getTime();
    WRC.Auth.hashPassword(pass, { salt: salt, iterations: iterations, hashVersion: WRC.Config.AUTH.HASH_VERSION });
    t = new Date().getTime() - start;
    if (t >= targetMs) break;
    iterations = Math.floor(iterations * 1.5);
  }
  // step down a bit if overshot badly
  if (t > targetMs * 1.3) iterations = Math.max(5000, Math.floor(iterations / 1.3));
  PropertiesService.getScriptProperties().setProperty(WRC.Config.PROP_KEYS.ITERATIONS_CURRENT, String(iterations));
  return { iterations: iterations, measuredMs: t, targetMs: targetMs };
}

function wrcBootstrapAdmin(username, password, displayName) {
  // deployer-run helper (Apps Script editor). Also exposed via api for initial bootstrap when no admin exists.
  WRC.Schema.setupAll('bootstrap');
  return WRC.Auth.bootstrapAdmin({ username: username, password: password, displayName: displayName });
}

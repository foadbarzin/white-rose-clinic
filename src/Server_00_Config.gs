/**
 * Server_00_Config.gs - Core configuration and constants
 * White Rose Clinic V2 | ROSE SEFID BEAUTY CLINIC
 * Executive defaults marked where pending confirmation.
 */
var WRC = WRC || {};
WRC.Config = (function() {
  var SHEET_NAMES = {
    META: 'Meta',
    SETTINGS: 'Settings',
    USERS: 'Users',
    CUSTOMERS: 'Customers',
    DOCTORS: 'Doctors',
    OPERATORS: 'Operators',
    SERVICES: 'Services',
    INVOICES: 'Invoices',
    INVOICE_ITEMS: 'InvoiceItems',
    PAYMENTS: 'Payments',
    REVENUE: 'Revenue',
    EXPENSES: 'Expenses',
    COMMISSION_RULES: 'CommissionRules',
    COMMISSIONS: 'Commissions',
    AUDIT_LOG: 'AuditLog',
    SEQUENCES: 'Sequences',
    SESSIONS: 'Sessions'
  };

  var ROLES = { ADMIN: 'admin', OPERATOR: 'operator', DOCTOR: 'doctor' };

  var INVOICE_STATUS = {
    DRAFT: 'draft',
    PENDING_DISCOUNT_APPROVAL: 'pending_discount_approval',
    ISSUED: 'issued',
    PARTIALLY_PAID: 'partially_paid',
    PAID: 'paid',
    VOID: 'void'
  };

  var DISCOUNT_STATUS = { NONE: 'none', REQUESTED: 'requested', APPROVED: 'approved', REJECTED: 'rejected' };
  var PAYMENT_STATUS = { RECORDED: 'recorded', VOID: 'void' };
  var COMMISSION_STATUS = { CALCULATED: 'calculated', PAYABLE: 'payable', PAID: 'paid', VOID: 'void', ADJUSTED: 'adjusted' };
  var COMMISSION_TYPES = { PERCENT: 'percent', FIXED_PER_UNIT: 'fixed_per_unit' };

  var SESSION = {
    ABSOLUTE_TTL_SECONDS: 8 * 60 * 60,      // 8 hours (confirmed)
    IDLE_TIMEOUT_SECONDS: 60 * 60,           // 60 minutes (confirmed)
    MAX_CONCURRENT: 3,                       // confirmed; 4th invalidates oldest
    CACHE_PREFIX: 'wrc_sess_',
    USER_INDEX_PREFIX: 'wrc_sess_idx_'
  };

  var AUTH = {
    ALGO: 'PBKDF2-HMAC-SHA256',
    HASH_VERSION: 1,
    DK_LEN: 32,
    SALT_BYTES: 32,
    FALLBACK_ITERATIONS: 20000,              // پیش‌فرض اجرایی until calibrated
    TARGET_P95_MS: 1000,                    // confirmed target
    MAX_FAILED_ATTEMPTS: 5,                 // پیش‌فرض اجرایی
    LOCK_MINUTES: 15,                       // پیش‌فرض اجرایی
    MIN_PASSWORD_LENGTH: 8                  // پیش‌فرض اجرایی
  };

  var PROP_KEYS = {
    SPREADSHEET_ID: 'WRC_SPREADSHEET_ID',
    AUTH_PEPPER: 'AUTH_PEPPER',
    ITERATIONS_CURRENT: 'AUTH_ITERATIONS_CURRENT',
    SCHEMA_VERSION: 'SCHEMA_VERSION'
  };

  var APP = {
    NAME: 'ROSE SEFID BEAUTY CLINIC',
    SHORT_NAME: 'White Rose Clinic V2',
    VERSION: '0.3.2',
    TIMEZONE: 'Asia/Tehran',
    CURRENCY: 'IRT',
    CURRENCY_LABEL: 'تومان'
  };

  function getProps() { return PropertiesService.getScriptProperties(); }
  function getSpreadsheetId() { return getProps().getProperty(PROP_KEYS.SPREADSHEET_ID) || ''; }
  function setSpreadsheetId(id) { getProps().setProperty(PROP_KEYS.SPREADSHEET_ID, id); }
  function getPepper() { return getProps().getProperty(PROP_KEYS.AUTH_PEPPER) || ''; }
  function getCurrentIterations() {
    var v = parseInt(getProps().getProperty(PROP_KEYS.ITERATIONS_CURRENT), 10);
    return (v && v > 0) ? v : AUTH.FALLBACK_ITERATIONS;
  }

  return {
    SHEET_NAMES: SHEET_NAMES,
    ROLES: ROLES,
    INVOICE_STATUS: INVOICE_STATUS,
    DISCOUNT_STATUS: DISCOUNT_STATUS,
    PAYMENT_STATUS: PAYMENT_STATUS,
    COMMISSION_STATUS: COMMISSION_STATUS,
    COMMISSION_TYPES: COMMISSION_TYPES,
    SESSION: SESSION,
    AUTH: AUTH,
    PROP_KEYS: PROP_KEYS,
    APP: APP,
    getProps: getProps,
    getSpreadsheetId: getSpreadsheetId,
    setSpreadsheetId: setSpreadsheetId,
    getPepper: getPepper,
    getCurrentIterations: getCurrentIterations
  };
})();

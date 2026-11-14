/**
 * Server_04_Schema.gs - Sheet schema definitions and setup
 */
var WRC = WRC || {};
WRC.Schema = (function() {
  var baseAudit = ['created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'];

  function defs() {
    return {
      Meta: ['key','value','updated_at','updated_by'],
      Settings: ['key','value','description','updated_at','updated_by'],
      Users: ['id','username','password_hash','password_salt','hash_algo','hash_version','iterations','display_name','role','linked_doctor_id','linked_operator_id','is_active','must_change_password','failed_attempts','locked_until','last_login_at','last_password_change_at'].concat(baseAudit),
      Customers: ['id','full_name','mobile','phone','national_code','birth_date','gender','address','notes','status'].concat(baseAudit),
      Doctors: ['id','full_name','specialty','mobile','is_active','notes','status'].concat(baseAudit),
      Operators: ['id','full_name','mobile','role_title','is_active','notes','status'].concat(baseAudit),
      Services: ['id','name','category','base_price_toman','duration_min','taxable','default_tax_rate','is_active','notes','status'].concat(baseAudit),
      Invoices: ['id','invoice_no','invoice_date','customer_id','doctor_id','operator_id','subtotal_toman','discount_requested_toman','discount_request_note','discount_status','discount_approved_toman','discount_approved_by','discount_approved_at','discount_rejected_reason','discount_toman','tax_toman','total_toman','paid_toman','balance_toman','status','issued_at','issued_by','amended_from_invoice_id','void_reason','notes'].concat(baseAudit),
      InvoiceItems: ['id','invoice_id','service_id','service_name_snapshot','description','quantity','unit_price_toman','line_gross_toman','line_discount_alloc_toman','line_net_after_discount_toman','effective_tax_rate','taxable','line_tax_toman','line_total_toman','commission_basis_toman','sort_order'].concat(baseAudit),
      Payments: ['id','invoice_id','payment_date','amount_toman','method','reference_no','received_by','status','notes'].concat(baseAudit),
      Revenue: ['id','date','source_type','source_id','amount_toman','description','status'].concat(baseAudit),
      Expenses: ['id','date','category','amount_toman','payee','description','status'].concat(baseAudit),
      CommissionRules: ['id','applies_to','person_id','service_id','type','value','calc_unit','basis_scope','priority','is_active','effective_from','effective_to','notes'].concat(baseAudit),
      Commissions: ['id','invoice_id','invoice_item_id','invoice_version','person_type','person_id','rule_id','commission_basis_toman','quantity','rate_or_amount_snapshot','commission_amount_toman','status','calculated_at','calculated_by','approved_payable_at','approved_payable_by','paid_at','paid_by','payment_reference','voided_or_adjusted_at','voided_or_adjusted_by','adjustment_reason','source_commission_id'].concat(baseAudit),
      AuditLog: ['id','timestamp','user_id','username','action','entity','entity_id','before_json','after_json','result','message','ip_or_context'],
      Sequences: ['key','next_value','updated_at','updated_by'],
      Sessions: ['id','user_id','token_hash','issued_at','expires_at','idle_expires_at','last_activity_at','revoked_at','revoke_reason','device_info'].concat(baseAudit)
    };
  }

  function ensureAllSheets() {
    var d = defs();
    Object.keys(d).forEach(function(name){ WRC.SheetRepo.ensureSheet(name, d[name]); });
  }

  function seedSettingsIfNeeded(actorId) {
    var existing = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.SETTINGS, { includeDeleted: true });
    if (existing.length > 0) return;
    var now = WRC.Utils.nowIso();
    var rows = [
      { key:'tax_enabled', value:'true', description:'فعال بودن مالیات', updated_at:now, updated_by:actorId||'system' },
      { key:'tax_default_rate', value:'0', description:'نرخ پیش‌فرض مالیات (درصد)', updated_at:now, updated_by:actorId||'system' },
      { key:'invoice_prefix', value:'WRC', description:'پیشوند شماره فاکتور', updated_at:now, updated_by:actorId||'system' },
      { key:'discount_requires_admin', value:'true', description:'تخفیف فقط با تأیید مدیر', updated_at:now, updated_by:actorId||'system' }
    ];
    rows.forEach(function(r){ WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.SETTINGS, r); });
  }

  function seedMetaIfNeeded() {
    var meta = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.META, { includeDeleted: true });
    var now = WRC.Utils.nowIso();
    var hasSchema = meta.some(function(m){ return m.key === 'schema_version'; });
    if (!hasSchema) WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.META, { key:'schema_version', value:'1', updated_at:now, updated_by:'system' });
  }

  function setupAll(actorId) {
    return WRC.SheetRepo.withLock(function(){
      ensureAllSheets();
      seedMetaIfNeeded();
      seedSettingsIfNeeded(actorId);
      return { ok: true };
    }, 30000);
  }

  return { defs: defs, ensureAllSheets: ensureAllSheets, setupAll: setupAll };
})();

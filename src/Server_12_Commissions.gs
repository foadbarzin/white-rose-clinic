/**
 * Server_12_Commissions.gs - Commission rules and commission lifecycle
 */
var WRC = WRC || {};
WRC.CommissionsSvc = (function(){
  var RULES = WRC.Config.SHEET_NAMES.COMMISSION_RULES;
  var COMM = WRC.Config.SHEET_NAMES.COMMISSIONS;

  function listRules(ctx) {
    WRC.Permissions.assert('commission_rules.manage', ctx.user);
    return WRC.SheetRepo.readAll(RULES);
  }
  function upsertRule(payload, ctx) {
    WRC.Permissions.assert('commission_rules.manage', ctx.user);
    payload = payload || {};
    var now = WRC.Utils.nowIso();
    var obj = {
      applies_to: String(payload.applies_to||''), person_id: WRC.Utils.trimStr(payload.person_id||''), service_id: WRC.Utils.trimStr(payload.service_id||''),
      type: String(payload.type||''), value: String(payload.value||'0'), calc_unit: String(payload.calc_unit|| (String(payload.type)===WRC.Config.COMMISSION_TYPES.FIXED_PER_UNIT?'per_unit':'line')),
      basis_scope: String(payload.basis_scope||'invoice_item'), priority: WRC.Utils.toInt(payload.priority,100), is_active: String(payload.is_active)==='false'?'false':'true',
      effective_from: WRC.Utils.toIsoDateOnly(payload.effective_from||''), effective_to: WRC.Utils.toIsoDateOnly(payload.effective_to||''), notes: WRC.Utils.trimStr(payload.notes||'')
    };
    if (['doctor','operator'].indexOf(obj.applies_to)<0) throw WRC.Errors.wrcError('VALIDATION','نوع ذینفع نامعتبر است.');
    if ([WRC.Config.COMMISSION_TYPES.PERCENT, WRC.Config.COMMISSION_TYPES.FIXED_PER_UNIT].indexOf(obj.type)<0) throw WRC.Errors.wrcError('VALIDATION','نوع پورسانت نامعتبر است.');
    if (payload.id) {
      var patch = Object.assign({}, obj, { updated_at: now, updated_by: ctx.user.id });
      var r = WRC.SheetRepo.updateById(RULES, payload.id, patch);
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission_rules.update', entity:'CommissionRules', entityId:payload.id, after:patch, result:'ok' });
      return r;
    }
    var row = Object.assign({ id: WRC.Utils.uuid(), created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:'' }, obj);
    WRC.SheetRepo.appendRow(RULES, row);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission_rules.create', entity:'CommissionRules', entityId:row.id, after:obj, result:'ok' });
    return row;
  }
  function removeRule(payload, ctx) {
    WRC.Permissions.assert('commission_rules.manage', ctx.user);
    WRC.SheetRepo.softDeleteById(RULES, payload.id, ctx.user.id);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission_rules.delete', entity:'CommissionRules', entityId:payload.id, result:'ok' });
    return { ok:true };
  }

  function activeRules() { return WRC.SheetRepo.readAll(RULES).filter(function(r){ return String(r.is_active)!=='false'; }); }

  function pickRule(rules, appliesTo, personId, serviceId) {
    var candidates = rules.filter(function(r){ return String(r.applies_to)===String(appliesTo); });
    // match specificity: service+person > person > service > default
    function score(r){
      var s = 0;
      if (r.person_id && String(r.person_id)===String(personId)) s += 10;
      if (r.service_id && String(r.service_id)===String(serviceId)) s += 20;
      if (!r.person_id) s += 0;
      if (!r.service_id) s += 0;
      // specificity count
      if (r.person_id && String(r.person_id)===String(personId) && r.service_id && String(r.service_id)===String(serviceId)) s += 100;
      return s;
    }
    var matched = candidates.filter(function(r){
      var okP = !r.person_id || String(r.person_id)===String(personId);
      var okS = !r.service_id || String(r.service_id)===String(serviceId);
      return okP && okS;
    });
    if (!matched.length) return null;
    matched.sort(function(a,b){ var sa=score(a), sb=score(b); if (sb!==sa) return sb-sa; return WRC.Utils.toInt(a.priority,100)-WRC.Utils.toInt(b.priority,100); });
    return matched[0];
  }

  function computeAmount(rule, item) {
    if (!rule) return 0;
    var basis = WRC.Utils.toMoneyInt(item.commission_basis_toman || item.line_net_after_discount_toman || 0);
    var quantity = Number(item.quantity || 0);
    if (isNaN(quantity) || quantity <= 0) quantity = 1;
    if (String(rule.type) === WRC.Config.COMMISSION_TYPES.FIXED_PER_UNIT) {
      var fixed = WRC.Utils.toMoneyInt(rule.value);
      return Math.round(fixed * quantity);
    }
    // percent
    var rate = Number(rule.value || 0); if (isNaN(rate)) rate = 0;
    return Math.round(basis * (rate / 100));
  }

  function calculateForInvoice(inv, items, ctx) {
    // called inside lock during issue; idempotent per invoice version: clear existing calculated for invoice
    var existing = WRC.SheetRepo.readAll(COMM).filter(function(c){ return String(c.invoice_id)===String(inv.id) && String(c.is_deleted)!=='true'; });
    var now = WRC.Utils.nowIso();
    existing.forEach(function(c){ WRC.SheetRepo.softDeleteById(COMM, c.id, ctx.user.id); });
    var rules = activeRules();
    var records = [];
    items.forEach(function(item){
      var persons = [];
      if (inv.doctor_id) persons.push({ type:'doctor', id: inv.doctor_id });
      if (inv.operator_id) persons.push({ type:'operator', id: inv.operator_id });
      persons.forEach(function(p){
        var rule = pickRule(rules, p.type, p.id, item.service_id);
        if (!rule) return;
        var amount = computeAmount(rule, item);
        if (amount <= 0) return;
        var rec = {
          id: WRC.Utils.uuid(), invoice_id: inv.id, invoice_item_id: item.id, invoice_version: inv.invoice_no || inv.id,
          person_type: p.type, person_id: p.id, rule_id: rule.id,
          commission_basis_toman: WRC.Utils.toMoneyInt(item.commission_basis_toman || item.line_net_after_discount_toman || 0),
          quantity: item.quantity, rate_or_amount_snapshot: String(rule.value), commission_amount_toman: amount,
          status: WRC.Config.COMMISSION_STATUS.CALCULATED,
          calculated_at: now, calculated_by: ctx.user.id,
          approved_payable_at:'', approved_payable_by:'', paid_at:'', paid_by:'', payment_reference:'',
          voided_or_adjusted_at:'', voided_or_adjusted_by:'', adjustment_reason:'', source_commission_id:'',
          created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:''
        };
        WRC.SheetRepo.appendRow(COMM, rec);
        records.push(rec);
      });
    });
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission.calculate', entity:'Invoices', entityId:inv.id, after:{count:records.length}, result:'ok' });
    return records;
  }

  function list(ctx) {
    if (WRC.Permissions.isDoctor(ctx.user)) WRC.Permissions.assert('commissions.read.own', ctx.user);
    else WRC.Permissions.assert('invoices.read', ctx.user);
    var rows = WRC.SheetRepo.readAll(COMM);
    if (WRC.Permissions.isDoctor(ctx.user)) rows = WRC.Permissions.filterForDoctor(ctx.user, 'Commissions', rows);
    return rows;
  }

  function approvePayable(payload, ctx) {
    WRC.Permissions.assert('commissions.approve_payable', ctx.user); // admin only by policy
    var ids = (payload && payload.ids) || (payload && payload.id ? [payload.id] : []);
    if (!ids.length) throw WRC.Errors.wrcError('VALIDATION','شناسه پورسانت الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var now = WRC.Utils.nowIso(); var updated = 0;
      ids.forEach(function(id){
        var c = WRC.SheetRepo.findById(COMM, id);
        if (!c) return;
        if (String(c.status) !== WRC.Config.COMMISSION_STATUS.CALCULATED) throw WRC.Errors.wrcError('INVALID_STATE','فقط وضعیت calculated قابل تأیید است.');
        WRC.SheetRepo.updateById(COMM, id, { status: WRC.Config.COMMISSION_STATUS.PAYABLE, approved_payable_at: now, approved_payable_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id });
        WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission.approve_payable', entity:'Commissions', entityId:id, before:{status:'calculated'}, after:{status:'payable'}, result:'ok' });
        updated++;
      });
      return { updated: updated };
    }, 30000);
  }

  function markPaid(payload, ctx) {
    WRC.Permissions.assert('commissions.mark_paid', ctx.user); // admin only
    var ids = (payload && payload.ids) || (payload && payload.id ? [payload.id] : []);
    var ref = WRC.Utils.trimStr(payload && payload.payment_reference || '');
    if (!ids.length) throw WRC.Errors.wrcError('VALIDATION','شناسه پورسانت الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var now = WRC.Utils.nowIso(); var updated = 0;
      ids.forEach(function(id){
        var c = WRC.SheetRepo.findById(COMM, id);
        if (!c) return;
        if (String(c.status) !== WRC.Config.COMMISSION_STATUS.PAYABLE) throw WRC.Errors.wrcError('INVALID_STATE','چرخه اجباری: calculated → payable → paid (ابتدا تأیید مدیر لازم است).');
        WRC.SheetRepo.updateById(COMM, id, { status: WRC.Config.COMMISSION_STATUS.PAID, paid_at: now, paid_by: ctx.user.id, payment_reference: ref, updated_at: now, updated_by: ctx.user.id });
        WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission.pay', entity:'Commissions', entityId:id, before:{status:'payable'}, after:{status:'paid',payment_reference:ref}, result:'ok' });
        updated++;
      });
      return { updated: updated };
    }, 30000);
  }

  function voidForInvoice(invoiceId, ctx, reason) {
    var rows = WRC.SheetRepo.readAll(COMM).filter(function(c){ return String(c.invoice_id)===String(invoiceId) && String(c.is_deleted)!=='true' && [WRC.Config.COMMISSION_STATUS.CALCULATED,WRC.Config.COMMISSION_STATUS.PAYABLE].indexOf(String(c.status))>=0; });
    var now = WRC.Utils.nowIso();
    rows.forEach(function(c){
      WRC.SheetRepo.updateById(COMM, c.id, { status: WRC.Config.COMMISSION_STATUS.VOID, voided_or_adjusted_at: now, voided_or_adjusted_by: ctx.user.id, adjustment_reason: reason||'void', updated_at: now, updated_by: ctx.user.id });
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission.void', entity:'Commissions', entityId:c.id, before:{status:c.status}, after:{status:'void'}, result:'ok' });
    });
    // if paid commissions exist, mark adjusted (auditable) - executive default
    var paid = WRC.SheetRepo.readAll(COMM).filter(function(c){ return String(c.invoice_id)===String(invoiceId) && String(c.is_deleted)!=='true' && String(c.status)===WRC.Config.COMMISSION_STATUS.PAID; });
    paid.forEach(function(c){
      WRC.SheetRepo.updateById(COMM, c.id, { status: WRC.Config.COMMISSION_STATUS.ADJUSTED, voided_or_adjusted_at: now, voided_or_adjusted_by: ctx.user.id, adjustment_reason: reason||'invoice_void_after_payment', updated_at: now, updated_by: ctx.user.id });
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'commission.adjust', entity:'Commissions', entityId:c.id, before:{status:'paid'}, after:{status:'adjusted'}, result:'ok' });
    });
  }

  return { listRules:listRules, upsertRule:upsertRule, removeRule:removeRule, calculateForInvoice:calculateForInvoice, list:list, approvePayable:approvePayable, markPaid:markPaid, voidForInvoice:voidForInvoice };
})();

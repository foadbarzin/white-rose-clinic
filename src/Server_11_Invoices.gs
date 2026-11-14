/**
 * Server_11_Invoices.gs - Invoice, items, payments, discounts, issue, commissions
 */
var WRC = WRC || {};
WRC.InvoicesSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.INVOICES;
  var ITEMS = WRC.Config.SHEET_NAMES.INVOICE_ITEMS;

  function listRaw() { return WRC.SheetRepo.readAll(SHEET); }
  function itemsByInvoice(invoiceId) { return WRC.SheetRepo.readAll(ITEMS).filter(function(r){ return String(r.invoice_id)===String(invoiceId); }).sort(function(a,b){ return WRC.Utils.toInt(a.sort_order,0)-WRC.Utils.toInt(b.sort_order,0); }); }

  function getTaxSettings() {
    var map = WRC.SettingsSvc.getAll();
    var enabled = String(map.tax_enabled||'true') === 'true';
    var rate = Number(map.tax_default_rate || 0);
    if (isNaN(rate)) rate = 0;
    return { enabled: enabled, rate: rate };
  }

  function calculate(items, discountApprovedToman, taxSettings) {
    // items: [{quantity, unit_price_toman, taxable, effective_tax_rate_override}]
    var subtotal = 0;
    var normalized = items.map(function(it, idx){
      var quantity = Number(it.quantity);
      if (isNaN(quantity) || quantity <= 0) quantity = 1;
      var unit = WRC.Utils.toMoneyInt(it.unit_price_toman);
      var gross = Math.round(quantity * unit);
      subtotal += gross;
      return { idx: idx, quantity: quantity, unit_price_toman: unit, line_gross_toman: gross, taxable: (String(it.taxable)==='false'?false:true), tax_rate: (it.effective_tax_rate !== undefined && it.effective_tax_rate !== '' ? Number(it.effective_tax_rate) : (taxSettings.enabled ? taxSettings.rate : 0)) };
    });
    var discount = WRC.Utils.clampMoney(discountApprovedToman);
    if (discount > subtotal) discount = subtotal;
    // allocate discount by largest remainder proportional to gross
    var allocs = normalized.map(function(n){ return 0; });
    if (discount > 0 && subtotal > 0) {
      var remainders = [];
      var sumBase = 0;
      normalized.forEach(function(n, i){
        var raw = (discount * n.line_gross_toman) / subtotal;
        var base = Math.floor(raw);
        allocs[i] = base; sumBase += base;
        remainders.push({ i:i, r: raw - base });
      });
      var remain = discount - sumBase;
      remainders.sort(function(a,b){ return b.r - a.r; });
      for (var k=0;k<remainders.length && remain>0;k++){ allocs[remainders[k].i]++; remain--; }
      // final adjust if rounding edge
      var s2 = allocs.reduce(function(a,b){return a+b;},0);
      if (s2 !== discount && normalized.length) allocs[normalized.length-1] += (discount - s2);
    }
    var totalTax = 0;
    var lines = normalized.map(function(n,i){
      var disc = allocs[i] || 0;
      var net = n.line_gross_toman - disc; if (net < 0) net = 0;
      var rate = n.taxable ? Number(n.tax_rate || 0) : 0; if (isNaN(rate)) rate = 0;
      var tax = Math.round(net * (rate / 100));
      totalTax += tax;
      return Object.assign({}, n, { line_discount_alloc_toman: disc, line_net_after_discount_toman: net, effective_tax_rate: rate, line_tax_toman: tax, line_total_toman: net + tax, commission_basis_toman: net });
    });
    var total = subtotal - discount + totalTax;
    if (total < 0) total = 0;
    return { subtotal_toman: subtotal, discount_toman: discount, tax_toman: totalTax, total_toman: total, items: lines };
  }

  function list(ctx) {
    if (WRC.Permissions.isDoctor(ctx.user)) WRC.Permissions.assert('invoices.read.own', ctx.user);
    else WRC.Permissions.assert('invoices.read', ctx.user);
    var rows = listRaw();
    if (WRC.Permissions.isDoctor(ctx.user)) rows = WRC.Permissions.filterForDoctor(ctx.user, 'Invoices', rows);
    return rows;
  }

  function get(payload, ctx) {
    var inv = WRC.SheetRepo.findById(SHEET, payload && payload.id);
    if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
    if (WRC.Permissions.isDoctor(ctx.user)) {
      WRC.Permissions.assert('invoices.read.own', ctx.user);
      if (String(inv.doctor_id||'') !== String(ctx.user.linked_doctor_id||'')) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.');
    } else {
      WRC.Permissions.assert('invoices.read', ctx.user);
    }
    return { invoice: inv, items: itemsByInvoice(inv.id), payments: WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.PAYMENTS).filter(function(p){ return String(p.invoice_id)===String(inv.id); }) };
  }

  function upsertDraft(payload, ctx) {
    // create or update draft/pending_discount_approval
    var canCreate = WRC.Permissions.can('invoices.create', ctx.user);
    var canUpdate = WRC.Permissions.can('invoices.update_draft', ctx.user) || WRC.Permissions.isAdmin(ctx.user);
    if (!canCreate && !canUpdate) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.');
    payload = payload || {};
    var items = Array.isArray(payload.items) ? payload.items : [];
    WRC.Utils.assert(items.length > 0, 'VALIDATION', 'حداقل یک آیتم برای فاکتور لازم است.');
    var now = WRC.Utils.nowIso();
    return WRC.SheetRepo.withLock(function(){
      var inv = null; var isNew = false;
      if (payload.id) {
        inv = WRC.SheetRepo.findById(SHEET, payload.id);
        if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
        if ([WRC.Config.INVOICE_STATUS.ISSUED, WRC.Config.INVOICE_STATUS.PARTIALLY_PAID, WRC.Config.INVOICE_STATUS.PAID, WRC.Config.INVOICE_STATUS.VOID].indexOf(inv.status) >= 0) {
          throw WRC.Errors.wrcError('INVALID_STATE','فاکتور صادرشده/نهایی قابل ویرایش مستقیم نیست.');
        }
      } else {
        isNew = true;
        inv = { id: WRC.Utils.uuid(), invoice_no: '', invoice_date: WRC.Utils.toIsoDateOnly(payload.invoice_date) || Utilities.formatDate(new Date(), WRC.Config.APP.TIMEZONE, 'yyyy-MM-dd'), customer_id: WRC.Utils.trimStr(payload.customer_id), doctor_id: WRC.Utils.trimStr(payload.doctor_id), operator_id: WRC.Utils.trimStr(payload.operator_id || (ctx.user.linked_operator_id||'')), status: WRC.Config.INVOICE_STATUS.DRAFT, discount_requested_toman:0, discount_request_note:'', discount_status:WRC.Config.DISCOUNT_STATUS.NONE, discount_approved_toman:0, discount_approved_by:'', discount_approved_at:'', discount_rejected_reason:'', discount_toman:0, tax_toman:0, subtotal_toman:0, total_toman:0, paid_toman:0, balance_toman:0, issued_at:'', issued_by:'', amended_from_invoice_id:'', void_reason:'', notes:WRC.Utils.trimStr(payload.notes), created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:'' };
      }
      var taxSettings = getTaxSettings();
      // requested discount only recorded; effective only if approved (and approval flow separate)
      var reqDisc = WRC.Utils.toMoneyInt(payload.discount_requested_toman || inv.discount_requested_toman || 0);
      var effectiveApproved = 0;
      var discStatus = inv.discount_status || WRC.Config.DISCOUNT_STATUS.NONE;
      if (String(discStatus) === WRC.Config.DISCOUNT_STATUS.APPROVED) effectiveApproved = WRC.Utils.toMoneyInt(inv.discount_approved_toman||0);
      // operator can request discount
      if (reqDisc > 0 && !WRC.Permissions.isAdmin(ctx.user)) {
        discStatus = WRC.Config.DISCOUNT_STATUS.REQUESTED;
      } else if (reqDisc <= 0 && String(discStatus) === WRC.Config.DISCOUNT_STATUS.REQUESTED) {
        discStatus = WRC.Config.DISCOUNT_STATUS.NONE;
      }
      var calc = calculate(items, effectiveApproved, taxSettings);
      var patch = {
        invoice_date: WRC.Utils.toIsoDateOnly(payload.invoice_date || inv.invoice_date),
        customer_id: WRC.Utils.trimStr(payload.customer_id || inv.customer_id),
        doctor_id: WRC.Utils.trimStr(payload.doctor_id || inv.doctor_id),
        operator_id: WRC.Utils.trimStr(payload.operator_id || inv.operator_id || ''),
        notes: WRC.Utils.trimStr(payload.notes !== undefined ? payload.notes : inv.notes),
        subtotal_toman: calc.subtotal_toman,
        discount_requested_toman: reqDisc,
        discount_request_note: WRC.Utils.trimStr(payload.discount_request_note !== undefined ? payload.discount_request_note : inv.discount_request_note),
        discount_status: discStatus,
        discount_toman: calc.discount_toman,
        tax_toman: calc.tax_toman,
        total_toman: calc.total_toman,
        paid_toman: WRC.Utils.toMoneyInt(inv.paid_toman||0),
        balance_toman: Math.max(0, calc.total_toman - WRC.Utils.toMoneyInt(inv.paid_toman||0)),
        updated_at: now, updated_by: ctx.user.id
      };
      if (patch.discount_status === WRC.Config.DISCOUNT_STATUS.REQUESTED && [WRC.Config.INVOICE_STATUS.DRAFT].indexOf(inv.status)>=0) patch.status = WRC.Config.INVOICE_STATUS.PENDING_DISCOUNT_APPROVAL;
      if (patch.discount_status === WRC.Config.DISCOUNT_STATUS.NONE && inv.status === WRC.Config.INVOICE_STATUS.PENDING_DISCOUNT_APPROVAL) patch.status = WRC.Config.INVOICE_STATUS.DRAFT;

      if (isNew) {
        Object.assign(inv, patch);
        WRC.SheetRepo.appendRow(SHEET, inv);
      } else {
        inv = WRC.SheetRepo.updateById(SHEET, inv.id, patch);
      }
      // replace items
      var existingItems = itemsByInvoice(inv.id);
      existingItems.forEach(function(it){ WRC.SheetRepo.softDeleteById(ITEMS, it.id, ctx.user.id); });
      var services = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.SERVICES);
      var svcMap = WRC.Utils.indexBy(services, 'id');
      calc.items.forEach(function(line, idx){
        var src = items[idx] || {};
        var svc = svcMap[String(src.service_id||'')] || null;
        var item = {
          id: WRC.Utils.uuid(), invoice_id: inv.id, service_id: WRC.Utils.trimStr(src.service_id||''), service_name_snapshot: svc ? svc.name : WRC.Utils.trimStr(src.service_name||src.description||''),
          description: WRC.Utils.trimStr(src.description||''), quantity: line.quantity, unit_price_toman: line.unit_price_toman,
          line_gross_toman: line.line_gross_toman, line_discount_alloc_toman: line.line_discount_alloc_toman, line_net_after_discount_toman: line.line_net_after_discount_toman,
          effective_tax_rate: line.effective_tax_rate, taxable: line.taxable ? 'true':'false', line_tax_toman: line.line_tax_toman, line_total_toman: line.line_total_toman,
          commission_basis_toman: line.commission_basis_toman, sort_order: idx, created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:''
        };
        WRC.SheetRepo.appendRow(ITEMS, item);
      });
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:isNew?'invoices.create':'invoices.update_draft', entity:'Invoices', entityId:inv.id, after:{status:inv.status,total:calc.total_toman}, result:'ok' });
      return get({ id: inv.id }, ctx);
    }, 30000);
  }

  function requestDiscount(payload, ctx) {
    WRC.Permissions.assert('invoices.request_discount', ctx.user);
    var id = payload && payload.id; if(!id) throw WRC.Errors.wrcError('VALIDATION','شناسه فاکتور الزامی است.');
    var amount = WRC.Utils.toMoneyInt(payload.discount_requested_toman);
    return WRC.SheetRepo.withLock(function(){
      var inv = WRC.SheetRepo.findById(SHEET, id);
      if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
      if ([WRC.Config.INVOICE_STATUS.ISSUED,WRC.Config.INVOICE_STATUS.PARTIALLY_PAID,WRC.Config.INVOICE_STATUS.PAID,WRC.Config.INVOICE_STATUS.VOID].indexOf(inv.status)>=0) throw WRC.Errors.wrcError('INVALID_STATE','وضعیت فاکتور مجاز نیست.');
      var status = amount>0 ? WRC.Config.DISCOUNT_STATUS.REQUESTED : WRC.Config.DISCOUNT_STATUS.NONE;
      var invStatus = amount>0 ? WRC.Config.INVOICE_STATUS.PENDING_DISCOUNT_APPROVAL : WRC.Config.INVOICE_STATUS.DRAFT;
      inv = WRC.SheetRepo.updateById(SHEET, id, { discount_requested_toman: amount, discount_request_note: WRC.Utils.trimStr(payload.note||''), discount_status: status, status: invStatus, updated_at: WRC.Utils.nowIso(), updated_by: ctx.user.id });
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'invoices.request_discount', entity:'Invoices', entityId:id, after:{amount:amount,status:status}, result:'ok' });
      return inv;
    }, 30000);
  }

  function approveDiscount(payload, ctx) {
    WRC.Permissions.assert('invoices.approve_discount', ctx.user);
    var id = payload && payload.id; if(!id) throw WRC.Errors.wrcError('VALIDATION','شناسه فاکتور الزامی است.');
    var approved = payload && payload.approve !== false;
    return WRC.SheetRepo.withLock(function(){
      var inv = WRC.SheetRepo.findById(SHEET, id);
      if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
      var its = itemsByInvoice(id);
      var taxSettings = getTaxSettings();
      var now = WRC.Utils.nowIso();
      if (approved) {
        var amount = WRC.Utils.toMoneyInt(payload.discount_approved_toman !== undefined ? payload.discount_approved_toman : inv.discount_requested_toman);
        var calc = calculate(its, amount, taxSettings);
        inv = WRC.SheetRepo.updateById(SHEET, id, { discount_approved_toman: amount, discount_approved_by: ctx.user.id, discount_approved_at: now, discount_status: WRC.Config.DISCOUNT_STATUS.APPROVED, discount_toman: calc.discount_toman, subtotal_toman: calc.subtotal_toman, tax_toman: calc.tax_toman, total_toman: calc.total_toman, balance_toman: Math.max(0, calc.total_toman - WRC.Utils.toMoneyInt(inv.paid_toman||0)), status: WRC.Config.INVOICE_STATUS.DRAFT, discount_rejected_reason:'', updated_at: now, updated_by: ctx.user.id });
        // update item allocations
        var existing = itemsByInvoice(id);
        calc.items.forEach(function(line, idx){ if (existing[idx]) WRC.SheetRepo.updateById(ITEMS, existing[idx].id, { line_discount_alloc_toman: line.line_discount_alloc_toman, line_net_after_discount_toman: line.line_net_after_discount_toman, line_tax_toman: line.line_tax_toman, line_total_toman: line.line_total_toman, commission_basis_toman: line.commission_basis_toman, updated_at: now, updated_by: ctx.user.id }); });
        WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'invoices.approve_discount', entity:'Invoices', entityId:id, after:{approved:true,amount:amount}, result:'ok' });
      } else {
        var calc0 = calculate(its, 0, taxSettings);
        inv = WRC.SheetRepo.updateById(SHEET, id, { discount_approved_toman: 0, discount_approved_by: ctx.user.id, discount_approved_at: now, discount_status: WRC.Config.DISCOUNT_STATUS.REJECTED, discount_toman: 0, discount_rejected_reason: WRC.Utils.trimStr(payload.reason||''), subtotal_toman: calc0.subtotal_toman, tax_toman: calc0.tax_toman, total_toman: calc0.total_toman, balance_toman: Math.max(0, calc0.total_toman - WRC.Utils.toMoneyInt(inv.paid_toman||0)), status: WRC.Config.INVOICE_STATUS.DRAFT, updated_at: now, updated_by: ctx.user.id });
        var existing0 = itemsByInvoice(id);
        calc0.items.forEach(function(line, idx){ if (existing0[idx]) WRC.SheetRepo.updateById(ITEMS, existing0[idx].id, { line_discount_alloc_toman: 0, line_net_after_discount_toman: line.line_net_after_discount_toman, line_tax_toman: line.line_tax_toman, line_total_toman: line.line_total_toman, commission_basis_toman: line.commission_basis_toman, updated_at: now, updated_by: ctx.user.id }); });
        WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'invoices.reject_discount', entity:'Invoices', entityId:id, after:{approved:false}, result:'ok' });
      }
      return get({id:id}, ctx);
    }, 30000);
  }

  function issue(payload, ctx) {
    if (!WRC.Permissions.can('invoices.issue', ctx.user) && !WRC.Permissions.isAdmin(ctx.user)) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.');
    var id = payload && payload.id; if(!id) throw WRC.Errors.wrcError('VALIDATION','شناسه فاکتور الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var inv = WRC.SheetRepo.findById(SHEET, id);
      if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
      if ([WRC.Config.INVOICE_STATUS.ISSUED,WRC.Config.INVOICE_STATUS.PARTIALLY_PAID,WRC.Config.INVOICE_STATUS.PAID].indexOf(inv.status)>=0) throw WRC.Errors.wrcError('INVALID_STATE','فاکتور قبلاً صادر شده است.');
      if (inv.status === WRC.Config.INVOICE_STATUS.VOID) throw WRC.Errors.wrcError('INVALID_STATE','فاکتور باطل است.');
      if (String(inv.discount_status) === WRC.Config.DISCOUNT_STATUS.REQUESTED) throw WRC.Errors.wrcError('INVALID_STATE','درخواست تخفیف در انتظار تأیید مدیر است.');
      var its = itemsByInvoice(id);
      if (!its.length) throw WRC.Errors.wrcError('VALIDATION','فاکتور بدون آیتم قابل صدور نیست.');
      var now = WRC.Utils.nowIso();
      var prefix = WRC.SettingsSvc.get('invoice_prefix') || 'WRC';
      var year = (inv.invoice_date || Utilities.formatDate(new Date(), WRC.Config.APP.TIMEZONE,'yyyy-MM-dd')).substring(0,4);
      var invoiceNo = inv.invoice_no || WRC.Sequences.next('invoice_' + year, prefix + '-' + year + '-');
      var paid = WRC.Utils.toMoneyInt(inv.paid_toman||0);
      var status = paid >= WRC.Utils.toMoneyInt(inv.total_toman||0) && paid>0 ? WRC.Config.INVOICE_STATUS.PAID : (paid>0 ? WRC.Config.INVOICE_STATUS.PARTIALLY_PAID : WRC.Config.INVOICE_STATUS.ISSUED);
      inv = WRC.SheetRepo.updateById(SHEET, id, { invoice_no: invoiceNo, status: status, issued_at: now, issued_by: ctx.user.id, balance_toman: Math.max(0, WRC.Utils.toMoneyInt(inv.total_toman||0)-paid), updated_at: now, updated_by: ctx.user.id });
      // calculate commissions at issue
      WRC.CommissionsSvc.calculateForInvoice(inv, its, ctx);
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'invoices.issue', entity:'Invoices', entityId:id, after:{invoice_no:invoiceNo,status:status,total:inv.total_toman}, result:'ok' });
      return get({id:id}, ctx);
    }, 30000);
  }

  function voidInvoice(payload, ctx) {
    WRC.Permissions.assert('invoices.void', ctx.user);
    var id = payload && payload.id; if(!id) throw WRC.Errors.wrcError('VALIDATION','شناسه فاکتور الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var inv = WRC.SheetRepo.findById(SHEET, id);
      if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
      if (inv.status === WRC.Config.INVOICE_STATUS.VOID) return inv;
      var now = WRC.Utils.nowIso();
      inv = WRC.SheetRepo.updateById(SHEET, id, { status: WRC.Config.INVOICE_STATUS.VOID, void_reason: WRC.Utils.trimStr(payload.reason||''), updated_at: now, updated_by: ctx.user.id });
      WRC.CommissionsSvc.voidForInvoice(id, ctx, 'ابطال فاکتور');
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'invoices.void', entity:'Invoices', entityId:id, after:{status:'void'}, result:'ok' });
      return inv;
    }, 30000);
  }

  function addPayment(payload, ctx) {
    WRC.Permissions.assert('payments.create', ctx.user);
    var invoiceId = payload && payload.invoice_id; var amount = WRC.Utils.toMoneyInt(payload && payload.amount_toman);
    if (!invoiceId || amount <= 0) throw WRC.Errors.wrcError('VALIDATION','فاکتور و مبلغ معتبر الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var inv = WRC.SheetRepo.findById(SHEET, invoiceId);
      if (!inv) throw WRC.Errors.wrcError('NOT_FOUND','فاکتور یافت نشد.');
      if (inv.status === WRC.Config.INVOICE_STATUS.VOID) throw WRC.Errors.wrcError('INVALID_STATE','فاکتور باطل است.');
      var now = WRC.Utils.nowIso();
      var pay = { id: WRC.Utils.uuid(), invoice_id: invoiceId, payment_date: WRC.Utils.toIsoDateOnly(payload.payment_date) || Utilities.formatDate(new Date(), WRC.Config.APP.TIMEZONE,'yyyy-MM-dd'), amount_toman: amount, method: WRC.Utils.trimStr(payload.method||'cash'), reference_no: WRC.Utils.trimStr(payload.reference_no||''), received_by: ctx.user.id, status: WRC.Config.PAYMENT_STATUS.RECORDED, notes: WRC.Utils.trimStr(payload.notes||''), created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:'' };
      WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.PAYMENTS, pay);
      var paid = WRC.Utils.toMoneyInt(inv.paid_toman||0) + amount;
      var total = WRC.Utils.toMoneyInt(inv.total_toman||0);
      var status = inv.status;
      if ([WRC.Config.INVOICE_STATUS.ISSUED,WRC.Config.INVOICE_STATUS.PARTIALLY_PAID,WRC.Config.INVOICE_STATUS.PAID].indexOf(status)>=0) {
        status = paid >= total ? WRC.Config.INVOICE_STATUS.PAID : WRC.Config.INVOICE_STATUS.PARTIALLY_PAID;
      }
      inv = WRC.SheetRepo.updateById(SHEET, invoiceId, { paid_toman: paid, balance_toman: Math.max(0,total-paid), status: status, updated_at: now, updated_by: ctx.user.id });
      WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'payments.create', entity:'Payments', entityId:pay.id, after:{invoice_id:invoiceId,amount:amount}, result:'ok' });
      return { payment: pay, invoice: inv };
    }, 30000);
  }

  return { list:list, listRaw:listRaw, get:get, upsertDraft:upsertDraft, requestDiscount:requestDiscount, approveDiscount:approveDiscount, issue:issue, voidInvoice:voidInvoice, addPayment:addPayment, calculate:calculate, itemsByInvoice:itemsByInvoice };
})();

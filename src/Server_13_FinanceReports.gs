/**
 * Server_13_FinanceReports.gs - Revenue, Expenses, Reports, Dashboard
 */
var WRC = WRC || {};

WRC.ExpensesSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.EXPENSES;
  function list(ctx) { WRC.Permissions.assert(WRC.Permissions.isAdmin(ctx.user)?'reports.read.financial_sensitive':'expenses.read', ctx.user); if (WRC.Permissions.isDoctor(ctx.user)) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.'); return WRC.SheetRepo.readAll(SHEET); }
  function create(payload, ctx) {
    WRC.Permissions.assert(WRC.Permissions.isAdmin(ctx.user)?'reports.read.financial_sensitive':'expenses.create', ctx.user);
    if (WRC.Permissions.isDoctor(ctx.user)) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.');
    payload = payload||{}; var now=WRC.Utils.nowIso();
    var obj = { id:WRC.Utils.uuid(), date:WRC.Utils.toIsoDateOnly(payload.date)||Utilities.formatDate(new Date(),WRC.Config.APP.TIMEZONE,'yyyy-MM-dd'), category:WRC.Utils.trimStr(payload.category), amount_toman:WRC.Utils.toMoneyInt(payload.amount_toman), payee:WRC.Utils.trimStr(payload.payee), description:WRC.Utils.trimStr(payload.description), status:'active', created_at:now, created_by:ctx.user.id, updated_at:now, updated_by:ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:'' };
    WRC.Utils.assert(obj.amount_toman>0,'VALIDATION','مبلغ هزینه معتبر نیست.');
    WRC.SheetRepo.appendRow(SHEET,obj);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'expenses.create', entity:'Expenses', entityId:obj.id, after:{amount:obj.amount_toman}, result:'ok' });
    return obj;
  }
  function remove(payload, ctx){ WRC.Permissions.assert('invoices.void', ctx.user); WRC.SheetRepo.softDeleteById(SHEET, payload.id, ctx.user.id); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'expenses.delete',entity:'Expenses',entityId:payload.id,result:'ok'}); return {ok:true}; }
  return { list:list, create:create, remove:remove };
})();

WRC.RevenueSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.REVENUE;
  function list(ctx){ WRC.Permissions.assert(WRC.Permissions.isAdmin(ctx.user)?'reports.read.financial_sensitive':'revenue.read', ctx.user); if (WRC.Permissions.isDoctor(ctx.user)) throw WRC.Errors.wrcError('FORBIDDEN','دسترسی مجاز نیست.'); return WRC.SheetRepo.readAll(SHEET); }
  function create(payload, ctx){
    WRC.Permissions.assert('settings.manage', ctx.user); // admin-only for misc revenue (executive default)
    payload=payload||{}; var now=WRC.Utils.nowIso();
    var obj={ id:WRC.Utils.uuid(), date:WRC.Utils.toIsoDateOnly(payload.date)||Utilities.formatDate(new Date(),WRC.Config.APP.TIMEZONE,'yyyy-MM-dd'), source_type:WRC.Utils.trimStr(payload.source_type||'misc'), source_id:WRC.Utils.trimStr(payload.source_id||''), amount_toman:WRC.Utils.toMoneyInt(payload.amount_toman), description:WRC.Utils.trimStr(payload.description), status:'active', created_at:now, created_by:ctx.user.id, updated_at:now, updated_by:ctx.user.id, is_deleted:'false', deleted_at:'', deleted_by:'' };
    WRC.Utils.assert(obj.amount_toman>0,'VALIDATION','مبلغ درآمد معتبر نیست.');
    WRC.SheetRepo.appendRow(SHEET,obj);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'revenue.create', entity:'Revenue', entityId:obj.id, after:{amount:obj.amount_toman}, result:'ok' });
    return obj;
  }
  return { list:list, create:create };
})();

WRC.ReportsSvc = (function(){
  function dashboard(ctx) {
    var now = new Date();
    var today = Utilities.formatDate(now, WRC.Config.APP.TIMEZONE,'yyyy-MM-dd');
    var monthPrefix = today.substring(0,7);
    if (WRC.Permissions.isDoctor(ctx.user)) {
      WRC.Permissions.assert('dashboard.read.own', ctx.user);
      var inv = WRC.InvoicesSvc.list(ctx);
      var com = WRC.CommissionsSvc.list(ctx);
      var issued = inv.filter(function(i){ return ['issued','partially_paid','paid'].indexOf(i.status)>=0; });
      var myMonth = issued.filter(function(i){ return String(i.invoice_date||'').indexOf(monthPrefix)===0; });
      var payable = com.filter(function(c){ return c.status==='payable'; }).reduce(function(s,c){return s+WRC.Utils.toMoneyInt(c.commission_amount_toman);},0);
      var paid = com.filter(function(c){ return c.status==='paid'; }).reduce(function(s,c){return s+WRC.Utils.toMoneyInt(c.commission_amount_toman);},0);
      return { role:'doctor', month_invoices: myMonth.length, month_total: myMonth.reduce(function(s,i){return s+WRC.Utils.toMoneyInt(i.total_toman);},0), commission_payable: payable, commission_paid: paid };
    }
    WRC.Permissions.assert('dashboard.read', ctx.user);
    var invoices = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.INVOICES);
    var payments = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.PAYMENTS);
    var expenses = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.EXPENSES);
    var revenueMisc = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.REVENUE);
    var commissions = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.COMMISSIONS);
    var customers = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.CUSTOMERS);

    var activeInvoices = invoices.filter(function(i){ return i.status !== WRC.Config.INVOICE_STATUS.VOID; });
    var monthInvoices = activeInvoices.filter(function(i){ return String(i.invoice_date||'').indexOf(monthPrefix)===0; });
    var monthInvoiceIncome = payments.filter(function(p){ return String(p.status)===WRC.Config.PAYMENT_STATUS.RECORDED && String(p.payment_date||'').indexOf(monthPrefix)===0; }).reduce(function(s,p){return s+WRC.Utils.toMoneyInt(p.amount_toman);},0);
    var monthMiscIncome = revenueMisc.filter(function(r){ return String(r.status)==='active' && String(r.date||'').indexOf(monthPrefix)===0; }).reduce(function(s,r){return s+WRC.Utils.toMoneyInt(r.amount_toman);},0);
    var monthExpense = expenses.filter(function(e){ return String(e.status)==='active' && String(e.date||'').indexOf(monthPrefix)===0; }).reduce(function(s,e){return s+WRC.Utils.toMoneyInt(e.amount_toman);},0);
    var commissionPayable = commissions.filter(function(c){ return c.status===WRC.Config.COMMISSION_STATUS.PAYABLE; }).reduce(function(s,c){return s+WRC.Utils.toMoneyInt(c.commission_amount_toman);},0);

    return {
      role: ctx.user.role,
      customers_count: customers.length,
      month_invoices_count: monthInvoices.length,
      month_invoice_total: monthInvoices.reduce(function(s,i){return s+WRC.Utils.toMoneyInt(i.total_toman);},0),
      month_income_invoice_payments: monthInvoiceIncome,
      month_income_misc: monthMiscIncome,
      month_income_total: monthInvoiceIncome + monthMiscIncome,
      month_expense_total: monthExpense,
      month_net: (monthInvoiceIncome + monthMiscIncome) - monthExpense,
      commission_payable_total: commissionPayable,
      today: today
    };
  }

  function summary(ctx) {
    WRC.Permissions.assert(WRC.Permissions.isAdmin(ctx.user)?'reports.read.financial_sensitive':'reports.read.operational', ctx.user);
    var invoices = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.INVOICES);
    var payments = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.PAYMENTS).filter(function(p){return String(p.status)===WRC.Config.PAYMENT_STATUS.RECORDED;});
    var expenses = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.EXPENSES).filter(function(e){return String(e.status)==='active';});
    var revenue = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.REVENUE).filter(function(r){return String(r.status)==='active';});
    var commissions = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.COMMISSIONS);
    var invoiceIncome = payments.reduce(function(s,p){return s+WRC.Utils.toMoneyInt(p.amount_toman);},0);
    var miscIncome = revenue.reduce(function(s,r){return s+WRC.Utils.toMoneyInt(r.amount_toman);},0);
    var expenseTotal = expenses.reduce(function(s,e){return s+WRC.Utils.toMoneyInt(e.amount_toman);},0);
    var byStatus = {};
    invoices.forEach(function(i){ byStatus[i.status]=(byStatus[i.status]||0)+1; });
    var commByStatus = {};
    commissions.forEach(function(c){ commByStatus[c.status]=(commByStatus[c.status]||0)+WRC.Utils.toMoneyInt(c.commission_amount_toman); });
    return { invoice_income: invoiceIncome, misc_income: miscIncome, income_total: invoiceIncome+miscIncome, expense_total: expenseTotal, net: (invoiceIncome+miscIncome)-expenseTotal, invoices_by_status: byStatus, commissions_amount_by_status: commByStatus };
  }

  /* =====================================================================
     Period reporting (dashboard charts): daily / weekly / monthly buckets
     inside an explicit [from..to] range. Dates are treated as UTC calendar
     days (stored format is plain yyyy-MM-dd); Iranian weeks start Saturday.
     ===================================================================== */
  var GRAN_LABELS = { day: 'روزانه', week: 'هفتگی', month: 'ماهانه' };
  var GRAN_ORDER = ['day', 'week', 'month'];
  var MAX_BUCKETS = 62;

  function toDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  }
  function dayStr(d) { return d.toISOString().substring(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function startOfMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  function startOfWeek(d) { var off = (d.getUTCDay() + 1) % 7; return new Date(d.getTime() - off * 86400000); }
  function startOfBucket(d, g) {
    if (g === 'week') return startOfWeek(d);
    if (g === 'month') return startOfMonth(d);
    return d;
  }
  function nextBucket(d, g) {
    if (g === 'week') return addDays(d, 7);
    if (g === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return addDays(d, 1);
  }
  function bucketLabel(key, g) {
    if (g === 'month') return key.substring(0, 7);
    return key.substring(5);
  }
  function buildBuckets(from, to, g) {
    var out = [], cur = startOfBucket(from, g), guard = 0;
    while (cur.getTime() <= to.getTime() && guard < 420) {
      out.push(dayStr(cur));
      cur = nextBucket(cur, g);
      guard++;
    }
    return out;
  }

  function period(payload, ctx) {
    payload = payload || {};
    var isDoctor = WRC.Permissions.isDoctor(ctx.user);
    WRC.Permissions.assert(
      isDoctor ? 'dashboard.read.own'
        : (WRC.Permissions.isAdmin(ctx.user) ? 'reports.read.financial_sensitive' : 'reports.read.operational'),
      ctx.user
    );

    var today = Utilities.formatDate(new Date(), WRC.Config.APP.TIMEZONE, 'yyyy-MM-dd');
    var toD = toDay(payload.to) || toDay(today);
    var fromD = toDay(payload.from) || startOfMonth(toD);
    if (fromD.getTime() > toD.getTime()) { var swap = fromD; fromD = toD; toD = swap; }

    var g = String(payload.granularity || 'day');
    if (GRAN_ORDER.indexOf(g) < 0) g = 'day';
    while (buildBuckets(fromD, toD, g).length > MAX_BUCKETS && g !== 'month') {
      g = (g === 'day') ? 'week' : 'month';
    }

    var keys = buildBuckets(fromD, toD, g);
    var index = {};
    keys.forEach(function (k, i) { index[k] = i; });
    var buckets = keys.map(function (k) {
      return { key: k, label: bucketLabel(k, g), income: 0, expense: 0, net: 0, invoices_count: 0, invoices_total: 0 };
    });

    function slotOf(dateStr) {
      var d = toDay(dateStr);
      if (!d) return -1;
      if (d.getTime() < fromD.getTime() || d.getTime() > toD.getTime()) return -1;
      var k = dayStr(startOfBucket(d, g));
      return index.hasOwnProperty(k) ? index[k] : -1;
    }

    var totals = {
      income_payments: 0, income_misc: 0, income: 0, expense: 0, net: 0,
      invoices_count: 0, invoices_total: 0, commission_payable: 0
    };

    if (isDoctor) {
      var myId = String(ctx.user.linked_doctor_id || '');
      WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.INVOICES).filter(function (i) {
        return String(i.doctor_id || '') === myId &&
          [WRC.Config.INVOICE_STATUS.ISSUED, WRC.Config.INVOICE_STATUS.PARTIALLY_PAID, WRC.Config.INVOICE_STATUS.PAID]
            .indexOf(String(i.status)) >= 0;
      }).forEach(function (i) {
        var b = slotOf(i.invoice_date); if (b < 0) return;
        var amt = WRC.Utils.toMoneyInt(i.total_toman);
        buckets[b].income += amt; buckets[b].invoices_count++; buckets[b].invoices_total += amt;
        totals.income += amt; totals.invoices_count++; totals.invoices_total += amt;
      });
      buckets.forEach(function (b) { b.net = b.income - b.expense; });
      totals.net = totals.income - totals.expense;
      return {
        from: dayStr(fromD), to: dayStr(toD), granularity: g, granularity_label: GRAN_LABELS[g],
        role: 'doctor', today: today, buckets: buckets, totals: totals
      };
    }

    WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.PAYMENTS).forEach(function (p) {
      if (String(p.status) !== WRC.Config.PAYMENT_STATUS.RECORDED) return;
      var b = slotOf(p.payment_date); if (b < 0) return;
      var amt = WRC.Utils.toMoneyInt(p.amount_toman);
      buckets[b].income += amt; totals.income_payments += amt; totals.income += amt;
    });
    WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.REVENUE).forEach(function (r) {
      if (String(r.status) !== 'active') return;
      var b = slotOf(r.date); if (b < 0) return;
      var amt = WRC.Utils.toMoneyInt(r.amount_toman);
      buckets[b].income += amt; totals.income_misc += amt; totals.income += amt;
    });
    WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.EXPENSES).forEach(function (e) {
      if (String(e.status) !== 'active') return;
      var b = slotOf(e.date); if (b < 0) return;
      var amt = WRC.Utils.toMoneyInt(e.amount_toman);
      buckets[b].expense += amt; totals.expense += amt;
    });
    WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.INVOICES).forEach(function (i) {
      if (String(i.status) === WRC.Config.INVOICE_STATUS.VOID) return;
      var b = slotOf(i.invoice_date); if (b < 0) return;
      var amt = WRC.Utils.toMoneyInt(i.total_toman);
      buckets[b].invoices_count++; buckets[b].invoices_total += amt;
      totals.invoices_count++; totals.invoices_total += amt;
    });
    WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.COMMISSIONS).forEach(function (c) {
      if (String(c.status) !== WRC.Config.COMMISSION_STATUS.PAYABLE) return;
      totals.commission_payable += WRC.Utils.toMoneyInt(c.commission_amount_toman);
    });

    buckets.forEach(function (b) { b.net = b.income - b.expense; });
    totals.net = totals.income - totals.expense;

    return {
      from: dayStr(fromD), to: dayStr(toD), granularity: g, granularity_label: GRAN_LABELS[g],
      role: ctx.user.role, today: today, buckets: buckets, totals: totals
    };
  }

  return { dashboard: dashboard, summary: summary, period: period };
})();

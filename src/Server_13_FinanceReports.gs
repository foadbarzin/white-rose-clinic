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

  return { dashboard: dashboard, summary: summary };
})();

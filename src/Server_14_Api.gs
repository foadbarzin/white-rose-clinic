/**
 * Server_14_Api.gs - Central API gateway and router
 */
var WRC = WRC || {};
WRC.Api = (function(){
  var PUBLIC_ACTIONS = { 'system.ping': true, 'auth.login': true, 'system.bootstrapStatus': true, 'setup.bootstrapAdmin': true };

  function route(action, payload, token) {
    payload = payload || {};
    if (PUBLIC_ACTIONS[action]) {
      return routePublic(action, payload, token);
    }
    var ctx = WRC.Auth.requireSession(token);
    return routeAuthed(action, payload, ctx);
  }

  function routePublic(action, payload, token) {
    switch(action) {
      case 'system.ping': return { ok:true, app: WRC.Config.APP, ts: WRC.Utils.nowIso() };
      case 'system.bootstrapStatus': return { hasAdmin: WRC.Auth.hasAnyActiveAdmin(), spreadsheetConfigured: !!WRC.Config.getSpreadsheetId(), pepperConfigured: !!WRC.Config.getPepper() };
      case 'auth.login': return WRC.Auth.login(payload.username, payload.password, payload.deviceInfo||'');
      case 'setup.bootstrapAdmin': return WRC.Auth.bootstrapAdmin(payload);
      default: throw WRC.Errors.wrcError('NOT_FOUND','اکشن نامعتبر است.');
    }
  }

  function routeAuthed(action, payload, ctx) {
    switch(action) {
      case 'auth.me': return { user: WRC.Auth.sanitizeUser(ctx.user) };
      case 'auth.logout': return WRC.Auth.logout(payload.token || '', ctx.user);
      case 'auth.changePassword': return WRC.Auth.changePassword(payload.token || payload.sessionToken || '', payload.oldPassword, payload.newPassword);

      case 'settings.get': WRC.Permissions.assert('settings.manage', ctx.user); return WRC.SettingsSvc.getAll(ctx);
      case 'settings.set': return WRC.SettingsSvc.set(payload.key, payload.value, ctx);

      case 'users.list': return WRC.UsersSvc.list(ctx);
      case 'users.create': return WRC.UsersSvc.create(payload, ctx);
      case 'users.update': return WRC.UsersSvc.update(payload, ctx);
      case 'users.resetPassword': return WRC.UsersSvc.resetPassword(payload, ctx);

      case 'customers.list': return WRC.CustomersSvc.list(ctx);
      case 'customers.create': return WRC.CustomersSvc.create(payload, ctx);
      case 'customers.update': return WRC.CustomersSvc.update(payload, ctx);
      case 'customers.delete': return WRC.CustomersSvc.remove(payload, ctx);

      case 'doctors.list': return WRC.DoctorsSvc.list(ctx);
      case 'doctors.create': return WRC.DoctorsSvc.create(payload, ctx);
      case 'doctors.update': return WRC.DoctorsSvc.update(payload, ctx);
      case 'doctors.delete': return WRC.DoctorsSvc.remove(payload, ctx);

      case 'operators.list': return WRC.OperatorsSvc.list(ctx);
      case 'operators.create': return WRC.OperatorsSvc.create(payload, ctx);
      case 'operators.update': return WRC.OperatorsSvc.update(payload, ctx);
      case 'operators.delete': return WRC.OperatorsSvc.remove(payload, ctx);

      case 'services.list': return WRC.ServicesSvc.list(ctx);
      case 'services.create': return WRC.ServicesSvc.create(payload, ctx);
      case 'services.update': return WRC.ServicesSvc.update(payload, ctx);
      case 'services.delete': return WRC.ServicesSvc.remove(payload, ctx);

      case 'invoices.list': return WRC.InvoicesSvc.list(ctx);
      case 'invoices.get': return WRC.InvoicesSvc.get(payload, ctx);
      case 'invoices.saveDraft': return WRC.InvoicesSvc.upsertDraft(payload, ctx);
      case 'invoices.requestDiscount': return WRC.InvoicesSvc.requestDiscount(payload, ctx);
      case 'invoices.approveDiscount': return WRC.InvoicesSvc.approveDiscount(payload, ctx);
      case 'invoices.issue': return WRC.InvoicesSvc.issue(payload, ctx);
      case 'invoices.void': return WRC.InvoicesSvc.voidInvoice(payload, ctx);

      case 'payments.add': return WRC.InvoicesSvc.addPayment(payload, ctx);

      case 'expenses.list': return WRC.ExpensesSvc.list(ctx);
      case 'expenses.create': return WRC.ExpensesSvc.create(payload, ctx);
      case 'expenses.delete': return WRC.ExpensesSvc.remove(payload, ctx);

      case 'revenue.list': return WRC.RevenueSvc.list(ctx);
      case 'revenue.create': return WRC.RevenueSvc.create(payload, ctx);

      case 'commissionRules.list': return WRC.CommissionsSvc.listRules(ctx);
      case 'commissionRules.upsert': return WRC.CommissionsSvc.upsertRule(payload, ctx);
      case 'commissionRules.delete': return WRC.CommissionsSvc.removeRule(payload, ctx);
      case 'commissions.list': return WRC.CommissionsSvc.list(ctx);
      case 'commissions.approvePayable': return WRC.CommissionsSvc.approvePayable(payload, ctx);
      case 'commissions.markPaid': return WRC.CommissionsSvc.markPaid(payload, ctx);

      case 'reports.dashboard': return WRC.ReportsSvc.dashboard(ctx);
      case 'reports.summary': return WRC.ReportsSvc.summary(ctx);
      case 'reports.period': return WRC.ReportsSvc.period(payload, ctx);
      case 'reports.insights': return WRC.ReportsSvc.insights(payload, ctx);

      case 'setup.run': WRC.Permissions.assert('settings.manage', ctx.user); WRC.Schema.setupAll(ctx.user.id); return { ok:true };

      default: throw WRC.Errors.wrcError('NOT_FOUND','اکشن نامعتبر است.');
    }
  }

  function call(action, payload, token) {
    try {
      if (!WRC.Config.getSpreadsheetId() && action !== 'system.bootstrapStatus' && action !== 'system.ping') {
        // allow active spreadsheet fallback in bound context
        try { var ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss) WRC.Config.setSpreadsheetId(ss.getId()); } catch(e){}
      }
      var data = route(action, payload || {}, token || (payload && payload.token) || '');
      if (data && data.ok === false && data.error) return data;
      return { ok: true, data: data };
    } catch (e) {
      var err = WRC.Errors.normalize(e);
      // audit failures for authed actions when possible
      try { WRC.Audit.log({ action: action, entity:'API', entityId:'', result:'fail', message: err.code + ':' + err.message }); } catch(_){}
      return { ok: false, error: { code: err.code, message: err.message } };
    }
  }

  return { call: call };
})();

function apiCall(action, payload, token) {
  // Single server gateway exposed to google.script.run
  return WRC.Api.call(action, payload || {}, token || (payload && (payload.sessionToken || payload.token)) || '');
}

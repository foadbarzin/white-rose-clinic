/**
 * Server_07_Permissions.gs - RBAC and ownership checks
 */
var WRC = WRC || {};
WRC.Permissions = (function() {
  var R = WRC.Config.ROLES;

  function isAdmin(user) { return user && user.role === R.ADMIN; }
  function isOperator(user) { return user && user.role === R.OPERATOR; }
  function isDoctor(user) { return user && user.role === R.DOCTOR; }

  function can(action, user, ctx) {
    ctx = ctx || {};
    if (!user) return false;
    // admin
    if (isAdmin(user)) return true;

    // doctor: only own data (read-focused)
    if (isDoctor(user)) {
      var doctorId = user.linked_doctor_id || '';
      switch (action) {
        case 'me.read':
        case 'dashboard.read.own':
        case 'commissions.read.own':
        case 'invoices.read.own':
        case 'invoice_items.read.own':
        case 'customers.read.limited':
          return !!doctorId;
        case 'auth.logout':
        case 'auth.change_password':
          return true;
        default:
          return false;
      }
    }

    // operator
    if (isOperator(user)) {
      switch (action) {
        case 'auth.logout':
        case 'auth.change_password':
        case 'me.read':
        case 'dashboard.read':
        case 'customers.read':
        case 'customers.create':
        case 'customers.update':
        case 'doctors.read':
        case 'operators.read':
        case 'services.read':
        case 'invoices.read':
        case 'invoices.create':
        case 'invoices.update_draft':
        case 'invoices.request_discount':
        case 'invoices.issue':
        case 'invoice_items.read':
        case 'payments.read':
        case 'payments.create':
        case 'revenue.read':
        case 'expenses.read':
        case 'expenses.create':
        case 'reports.read.operational':
          return true;
        // forbidden for operator
        case 'customers.delete':
        case 'doctors.manage':
        case 'operators.manage':
        case 'services.manage':
        case 'invoices.approve_discount':
        case 'invoices.void':
        case 'commissions.approve_payable':
        case 'commissions.mark_paid':
        case 'commission_rules.manage':
        case 'users.manage':
        case 'settings.manage':
        case 'reports.read.financial_sensitive':
          return false;
        default:
          return false;
      }
    }
    return false;
  }

  function assert(action, user, ctx) {
    if (!can(action, user, ctx)) throw WRC.Errors.wrcError('FORBIDDEN', 'دسترسی مجاز نیست.');
  }

  function filterForDoctor(user, entity, rows) {
    if (!isDoctor(user)) return rows;
    var docId = String(user.linked_doctor_id || '');
    rows = rows || [];
    if (entity === 'Invoices') return rows.filter(function(r){ return String(r.doctor_id || '') === docId; });
    if (entity === 'Commissions') return rows.filter(function(r){ return String(r.person_type) === 'doctor' && String(r.person_id || '') === docId; });
    if (entity === 'InvoiceItems') return rows; // filtered by invoice ownership in service
    return [];
  }

  return { can: can, assert: assert, isAdmin: isAdmin, isOperator: isOperator, isDoctor: isDoctor, filterForDoctor: filterForDoctor };
})();

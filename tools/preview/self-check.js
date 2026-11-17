/* Local self-check for the preview harness (no HTTP server, no files written to the repo). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { loadApp, props, SRC, ss } = require('./mock');
const seed = require('./seed');

const fails = [];
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label); if (!cond) fails.push(label); };
const read = n => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8').replace(/^\uFEFF/, '');
const include = n => { const f = path.join(SRC, n + '.html'); if (!fs.existsSync(f)) throw new Error('No HTML file named "' + n + '" was found.'); return read(n); };

// ---- 1. doGet template + includes ----
let html = read('Client_Index')
  .replace(/<\?(!?=)\s*JSON\.stringify\(include\((['"])([^'"]+)\2\)\)\s*;?\s*\?>/g, (m, e, q, n) => JSON.stringify(include(n)))
  .replace(/<\?(!?=)\s*include\((['"])([^'"]+)\2\)\s*;?\s*\?>/g, (m, e, q, n) => include(n));
ok(!/<\?/.test(html), 'rendered page has no unevaluated scriptlets');
ok(/var WRC_LOGO_HTML = /.test(html), 'logo markup is injected for the client');
ok((html.match(/<svg/g) || []).length === (html.match(/<\/svg>/g) || []).length, 'SVG markup is balanced');

const scripts = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
ok(scripts.length === 2, 'page has 2 inline scripts (logo data + client app)');
scripts.forEach((code, i) => {
  const f = path.join(os.tmpdir(), 'wrc_preview_check_' + i + '.js');
  fs.writeFileSync(f, code, 'utf8');
  const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  ok(r.status === 0, 'script #' + (i + 1) + ' is syntactically valid' + (r.status ? ': ' + r.stderr : ''));
});

// ---- 2. real backend (all .gs) + seed ----
props.AUTH_PEPPER = 'self-check-pepper';
const WRC = loadApp();
ok(!!WRC && !!WRC.Api, 'all .gs files loaded and compiled');

WRC.Schema.setupAll('check');
ok(ss.sheets.size === 17, 'setup created 17 sheets (got ' + ss.sheets.size + ')');

WRC.Auth.bootstrapAdmin({ username: 'check-admin', password: 'Check#12345', displayName: 'بررسی' });
const login = WRC.Auth.login('check-admin', 'Check#12345', 'self-check');
ok(login && login.token && login.user.role === 'admin', 'bootstrap + login work');
const ctx = { user: login.user };

const seeded = seed(WRC, ctx);
ok(seeded.invoices.length === 7, 'seed created 7 invoices (got ' + seeded.invoices.length + ')');
const invoices = WRC.InvoicesSvc.list(ctx);
const count = s => invoices.filter(i => i.status === s).length;
ok(count('paid') === 2 && count('partially_paid') === 1 && count('issued') === 1 && count('draft') === 1 && count('pending_discount_approval') === 1 && count('void') === 1,
  'invoice statuses cover paid/partially_paid/issued/draft/pending/void');
ok(invoices.every(i => Number(i.balance_toman) === Math.max(0, Number(i.total_toman) - Number(i.paid_toman))), 'invoice balance equals total - paid');

const commissions = WRC.CommissionsSvc.list(ctx);
const cCount = s => commissions.filter(c => c.status === s).length;
ok(commissions.length === 13, 'seed created 13 commission rows (got ' + commissions.length + ')');
ok(cCount('paid') === 4 && cCount('payable') === 2 && cCount('calculated') === 6 && cCount('void') === 1, 'commission lifecycle states are represented');

const dash = WRC.ReportsSvc.dashboard(ctx);
ok(dash.month_income_total === 47000000, 'monthly income matches seed (got ' + dash.month_income_total + ')');
ok(dash.month_expense_total === 40500000, 'monthly expense matches seed (got ' + dash.month_expense_total + ')');
ok(dash.month_net === dash.month_income_total - dash.month_expense_total, 'dashboard net is consistent');

let forbidden = false;
try {
  WRC.InvoicesSvc.approveDiscount({ id: invoices[0].id, approve: true, discount_approved_toman: 1 }, { user: { id: 'o1', username: 'op', role: 'operator' } });
} catch (e) { forbidden = e && e.code === 'FORBIDDEN'; }
ok(forbidden, 'operator cannot approve discounts (server-side RBAC enforced)');

console.log(fails.length ? '\n' + fails.length + ' CHECK(S) FAILED' : '\nALL PREVIEW CHECKS PASSED');
process.exit(fails.length ? 1 : 0);

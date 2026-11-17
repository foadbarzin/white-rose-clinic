/* Seeds realistic demo data through the REAL server services (in-memory only). */
module.exports = function seed(WRC, ctx) {
  const DATE = '2026-11-15';

  // ---- doctors / operators ----
  const d1 = WRC.DoctorsSvc.create({ full_name: 'دکتر سارا احمدی', specialty: 'پوست، مو و زیبایی', mobile: '09121234567', notes: 'متخصص پوست و لیزر' }, ctx).id;
  const d2 = WRC.DoctorsSvc.create({ full_name: 'دکتر نیلوفر کریمی', specialty: 'لیزر و جوان‌سازی', mobile: '09122345678' }, ctx).id;
  const d3 = WRC.DoctorsSvc.create({ full_name: 'دکتر امیر رضایی', specialty: 'جراحی زیبایی', mobile: '09123456789' }, ctx).id;
  const op1 = WRC.OperatorsSvc.create({ full_name: 'مریم حسینی', role_title: 'مسئول پذیرش', mobile: '09125550011' }, ctx).id;
  const op2 = WRC.OperatorsSvc.create({ full_name: 'زهرا محمدی', role_title: 'منشی', mobile: '09125550022' }, ctx).id;

  // ---- services ----
  const svc = (name, category, price) => WRC.ServicesSvc.create({ name: name, category: category, base_price_toman: price, taxable: false, duration_min: 45 }, ctx).id;
  const S_BOTOX = svc('تزریق بوتاکس', 'زیبایی', 8500000);
  const S_GEL = svc('تزریق ژل لب', 'زیبایی', 12000000);
  const S_LASER = svc('لیزر موهای زائد', 'لیزر', 3500000);
  const S_CLEAN = svc('پاکسازی پوست', 'پوست', 2500000);
  const S_MICRO = svc('میکرونیدلینگ', 'پوست', 4500000);
  const S_CONSULT = svc('ویزیت و مشاوره پوست', 'مشاوره', 500000);

  // ---- commission rules ----
  WRC.CommissionsSvc.upsertRule({ applies_to: 'doctor', person_id: d1, type: 'percent', value: 15, priority: 100 }, ctx);
  WRC.CommissionsSvc.upsertRule({ applies_to: 'doctor', person_id: d2, service_id: S_LASER, type: 'fixed_per_unit', value: 800000, priority: 10 }, ctx);
  WRC.CommissionsSvc.upsertRule({ applies_to: 'operator', person_id: op1, type: 'percent', value: 5, priority: 100 }, ctx);
  WRC.CommissionsSvc.upsertRule({ applies_to: 'operator', person_id: op2, type: 'percent', value: 5, priority: 100 }, ctx);

  // ---- customers ----
  const cust = (name, mobile, address) => WRC.CustomersSvc.create({ full_name: name, mobile: mobile, phone: '', national_code: '', gender: '', address: address, notes: '' }, ctx).id;
  const c1 = cust('نگار موسوی', '09121112233', 'تهران، سعادت‌آباد، خیابان بهار');
  const c2 = cust('الهام رستمی', '09122223344', 'تهران، ونک، خیابان گاندی');
  const c3 = cust('سحر کاظمی', '09123334455', 'تهران، پاسداران، بوستان دوم');
  const c4 = cust('مریم شریفی', '09124445566', 'تهران، نیاوران، خیابان شهید باهنر');
  const c5 = cust('پریسا نوری', '09125556677', 'تهران، جردن، خیابان ناهید');
  const c6 = cust('آیدا صادقی', '09126667788', 'تهران، شهرک غرب، ایران‌زمین');
  const c7 = cust('شیما فراهانی', '09127778899', 'تهران، میرداماد، نفت شمالی');

  // ---- users (operator account for the discount workflow) ----
  const opUser = WRC.UsersSvc.create({ username: 'operator1', password: 'Operator#123', role: 'operator', display_name: 'مریم حسینی', linked_operator_id: op1 }, ctx);
  WRC.UsersSvc.create({ username: 'doctor1', password: 'Doctor#1234', role: 'doctor', display_name: 'دکتر سارا احمدی', linked_doctor_id: d1 }, ctx);
  const opCtx = { user: { id: opUser.id, username: 'operator1', role: 'operator', display_name: 'مریم حسینی', linked_operator_id: op1 } };


  const line = (service_id, quantity, unit_price_toman) => ({ service_id: service_id, quantity: quantity, unit_price_toman: unit_price_toman, description: '' });
  const draft = (customer_id, doctor_id, operator_id, items, discount, context) =>
    WRC.InvoicesSvc.upsertDraft({ customer_id: customer_id, doctor_id: doctor_id, operator_id: operator_id, invoice_date: DATE, discount_requested_toman: discount || 0, items: items }, context || ctx).invoice;

  // 1) paid invoice with an admin-approved discount (requested by the operator)
  const i1 = draft(c1, d1, op1, [line(S_BOTOX, 2, 8500000), line(S_CONSULT, 1, 500000)], 1500000, opCtx);
  WRC.InvoicesSvc.approveDiscount({ id: i1.id, approve: true, discount_approved_toman: 1500000 }, ctx);
  WRC.InvoicesSvc.issue({ id: i1.id }, ctx);
  WRC.InvoicesSvc.addPayment({ invoice_id: i1.id, amount_toman: 16000000, payment_date: '2026-11-16', method: 'card', reference_no: 'TRX-884201' }, ctx);

  // 2) partially paid (fixed per-unit doctor commission for laser)
  const i2 = draft(c2, d2, op2, [line(S_LASER, 3, 3500000)], 0);
  WRC.InvoicesSvc.issue({ id: i2.id }, ctx);
  WRC.InvoicesSvc.addPayment({ invoice_id: i2.id, amount_toman: 4000000, payment_date: '2026-11-12', method: 'cash', reference_no: '' }, ctx);

  // 3) issued, unpaid
  const i3 = draft(c3, d1, op1, [line(S_GEL, 1, 12000000)], 0);
  WRC.InvoicesSvc.issue({ id: i3.id }, ctx);

  // 4) draft
  const i4 = draft(c4, d1, op1, [line(S_CLEAN, 1, 2500000), line(S_MICRO, 1, 4500000)], 0);

  // 5) pending discount approval (operator request waiting for the manager)
  const i5 = draft(c5, d2, op2, [line(S_LASER, 2, 3500000)], 500000, opCtx);

  // 6) voided invoice
  const i6 = draft(c6, d3, op1, [line(S_CONSULT, 1, 500000)], 0);
  WRC.InvoicesSvc.issue({ id: i6.id }, ctx);
  WRC.InvoicesSvc.voidInvoice({ id: i6.id, reason: 'ثبت اشتباه توسط پذیرش' }, ctx);

  // 7) paid invoice (calculated commissions left untouched for the lifecycle demo)
  const i7 = draft(c7, d1, op1, [line(S_BOTOX, 1, 8500000), line(S_GEL, 1, 12000000)], 0);
  WRC.InvoicesSvc.issue({ id: i7.id }, ctx);
  WRC.InvoicesSvc.addPayment({ invoice_id: i7.id, amount_toman: 20500000, payment_date: '2026-11-14', method: 'card', reference_no: 'TRX-884512' }, ctx);

  // ---- commission lifecycle: invoice 1 -> payable -> paid, invoice 2 -> payable ----
  const byInv = id => WRC.CommissionsSvc.list(ctx).filter(c => String(c.invoice_id) === String(id) && c.status === 'calculated').map(c => c.id);
  const ids1 = byInv(i1.id);
  WRC.CommissionsSvc.approvePayable({ ids: ids1 }, ctx);
  WRC.CommissionsSvc.markPaid({ ids: ids1, payment_reference: 'PRV-1404-001' }, ctx);
  WRC.CommissionsSvc.approvePayable({ ids: byInv(i2.id) }, ctx);

  // ---- expenses / misc revenue ----
  const exp = (date, category, amount, payee, description) => WRC.ExpensesSvc.create({ date: date, category: category, amount_toman: amount, payee: payee, description: description }, ctx);
  exp('2026-11-02', 'اجاره', 15000000, 'مالک ساختمان', 'اجاره ماهانه مطب');
  exp('2026-11-05', 'حقوق و دستمزد', 18000000, 'پرسنل کلینیک', 'حقوق آبان‌ماه');
  exp('2026-11-08', 'مواد مصرفی', 4500000, 'شرکت تجهیزات پزشکی', 'خرید فیلر و بوتاکس');
  exp('2026-11-11', 'تبلیغات', 3000000, 'آژانس دیجیتال مارکتینگ', 'کمپین اینستاگرام');
  WRC.RevenueSvc.create({ date: '2026-11-10', source_type: 'product', amount_toman: 4500000, description: 'فروش محصولات مراقبتی پوست' }, ctx);
  WRC.RevenueSvc.create({ date: '2026-11-13', source_type: 'giftcard', amount_toman: 2000000, description: 'فروش گيفت‌کارت' }, ctx);

  return {
    invoices: WRC.InvoicesSvc.list(ctx).map(i => ({ no: i.invoice_no || '(draft)', status: i.status, total: i.total_toman })),
    commissions: WRC.CommissionsSvc.list(ctx).length
  };
};

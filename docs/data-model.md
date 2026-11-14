# مدل داده پیشنهادی - White Rose Clinic V2

> فاز یک: مستندسازی فقط. هیچ Google Sheet یا داده‌ای ایجاد نشده است. در زمان Setup فقط سربرگ‌ها ساخته می‌شوند (بدون ردیف داده).

## قواعد عمومی
- **شناسه:** `id` یکتا (متنی/UUID یا شمارنده کنترل‌شده با قفل).
- **زمان:** ذخیره‌سازی استاندارد (ISO 8601 / timestamp میلادی)؛ نمایش در UI به شمسی.
- **حذف:** نرم (`is_deleted` یا `status=deleted`)؛ بدون حذف فیزیکی ردیف.
- **ردیابی:** `created_at`, `created_by`, `updated_at`, `updated_by` در تمام جداول اصلی.
- **مبالغ:** تومان، ذخیره عددی؛ قالب‌بندی در UI.

## شیت‌های پیشنهادی

| شیت | هدف | ستون‌های کلیدی (پیشنهادی) |
|---|---|---|
| `Meta` | نسخه schema و تنظیمات سیستمی | `key`, `value`, `updated_at`, `updated_by` |
| `Users` | کاربران و ورود | `id`, `username`, `password_hash`, `password_salt`, `display_name`, `role`, `is_active`, `last_login_at`, audit fields |
| `Customers` | مشتریان | `id`, `full_name`, `mobile`, `phone`, `national_code`, `birth_date`, `gender`, `address`, `notes`, `status`, audit fields |
| `Doctors` | پزشکان | `id`, `full_name`, `specialty`, `mobile`, `commission_type`, `commission_value`, `is_active`, `notes`, audit fields |
| `Operators` | اپراتورها | `id`, `full_name`, `mobile`, `role_title`, `commission_type`, `commission_value`, `is_active`, `notes`, audit fields |
| `Services` | خدمات | `id`, `name`, `category`, `base_price_toman`, `duration_min`, `taxable`, `default_tax_rate`, `is_active`, `notes`, audit fields |
| `Invoices` | سربرگ فاکتور | `id`, `invoice_no`, `invoice_date`, `customer_id`, `doctor_id`, `operator_id`, `subtotal_toman`, `discount_toman`, `discount_approved_by`, `tax_toman`, `total_toman`, `paid_toman`, `balance_toman`, `status`, `notes`, audit fields |
| `InvoiceItems` | اقلام فاکتور | `id`, `invoice_id`, `service_id`, `description`, `qty`, `unit_price_toman`, `discount_toman`, `tax_toman`, `line_total_toman`, audit fields |
| `Payments` | پرداخت‌ها | `id`, `invoice_id`, `payment_date`, `amount_toman`, `method`, `reference_no`, `received_by`, `status`, `notes`, audit fields |
| `Revenue` | درآمدها | `id`, `date`, `source_type`, `source_id`, `amount_toman`, `description`, `status`, audit fields |
| `Expenses` | هزینه‌ها | `id`, `date`, `category`, `amount_toman`, `payee`, `description`, `status`, audit fields |
| `CommissionRules` | قواعد کمیسیون | `id`, `applies_to` (doctor/operator), `person_id`, `service_id` (اختیاری), `type` (percent/fixed), `value`, `is_active`, `effective_from`, `effective_to`, audit fields |
| `Commissions` | کمیسیون محاسبه‌شده | `id`, `invoice_id`, `person_type`, `person_id`, `basis_amount_toman`, `rule_id`, `commission_amount_toman`, `status`, `calculated_at`, audit fields |
| `Settings` | تنظیمات قابل پیکربندی | `key`, `value`, `description`, `updated_at`, `updated_by` (مالیات، الگوی شماره فاکتور، سیاست تخفیف و ...) |
| `AuditLog` | لاگ تغییرات | `id`, `timestamp`, `user_id`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `ip_or_context`, `result` |

## نکات دامنه
- **کمیسیون:** هم درصدی و هم مبلغ ثابت؛ قابل تعریف در سطح پزشک/اپراتور و در صورت نیاز per service.
- **تخفیف:** فقط با مجوز مدیر؛ `discount_approved_by` و ثبت در Audit الزامی.
- **مالیات:** نرخ/فعال‌بودن قابل تنظیم در `Settings` و قابل اعمال در محاسبه فاکتور.
- **فاکتور:** محاسبه `subtotal/discount/tax/total/paid/balance` سمت سرور و با قفل.

## خارج از دامنه فاز یک
ایجاد واقعی شیت‌ها، هدرنویسی، migration، Seed (ممنوع طبق الزام)، و کد CRUD.

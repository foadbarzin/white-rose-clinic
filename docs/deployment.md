# راهنمای استقرار و نسخه‌بندی - White Rose Clinic V2

## وضعیت فاز یک
این سند برنامه استقرار را تعریف می‌کند. در فاز یک **هیچ اتصال، انتشار یا عملیات تغییردهنده** انجام نشده است.

## پیش‌نیازها
- Git (نصب/در دسترس)، دسترسی به مخزن خصوصی `https://github.com/foadbarzin/white-rose-clinic`
- Node.js و npm
- `@google/clasp` (نسخه نصب‌شده محلی: 3.4.1)
- حساب Google با دسترسی به Apps Script و Google Sheets
- فعال‌سازی **Google Apps Script API** در تنظیمات کاربر Google

## اتصال مخزن (پس از تأیید)
1. تأیید محتوای راه‌دور و همگام‌سازی امن (با توجه به وجود commit/README در `main`).
2. تنظیم remote و شاخه کاری طبق توافق.
3. Commit و Push فقط پس از بررسی diff و تأیید صریح.

## تنظیم Apps Script محلی (فازهای بعد)
1. کپی `.clasp.json.example` به `.clasp.json` (محلی، خارج از commit).
2. مقداردهی `scriptId` واقعی فقط در فایل محلی.
3. `clasp login` (ذخیره توکن در `~/.clasprc.json`، خارج از مخزن).
4. `clasp push`/`pull` طبق نیاز، با رعایت `rootDir` و `.claspignore`.

## Google Sheets (فازهای بعد)
- ایجاد **Google Sheet جدید** (طبق تصمیم قطعی).
- اجرای Setup/Migration برای ساخت سربرگ شیت‌ها بدون داده نمونه.
- ثبت شناسه Sheet در تنظیمات محلی/Properties (نه در مخزن عمومی/کد نسخه‌بندی‌شده).

## نسخه‌بندی و انتشار
- `VERSION`: نسخه جاری (`0.1.0` در فاز یک).
- `CHANGELOG.md`: ثبت هر تغییر با تاریخ و دسته‌بندی (Added/Changed/Fixed/Security).
- Git tag: `vX.Y.Z` برای هر انتشار تأییدشده.
- Apps Script: `clasp version "vX.Y.Z - توضیح"` و سپس `clasp deploy` (در فاز انتشار).

## امنیت استقرار
- عدم commit: `.clasp.json`, `.clasprc.json`, `.env*`, کلیدها، توکن‌ها، شناسه‌های حساس.
- حداقل دسترسی OAuth/Scopes در `appsscript.json`.
- دسترسی Spreadsheet محدود به افراد/حساب‌های مجاز.
- بررسی نهایی قبل از push: جستجوی الگوهای `scriptId` واقعی، توکن، رمز.

## خارج از دامنه فاز یک
ایجاد پروژه Apps Script/Sheet، ورود clasp، push/deploy واقعی، و commit/push به GitHub.

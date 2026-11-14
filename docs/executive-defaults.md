# White Rose Clinic V2 - Design Tokens & Executive Defaults (Implementation Phase)

## Brand
- Official name: **ROSE SEFID BEAUTY CLINIC**
- Logo concept (as specified): metallic gold rose, face profile, stethoscope. Logo files are stored in `src/assets/` and must not be replaced with generic logos.
- Reference images: not present in repository workspace; **پیش‌فرض اجرایی**: SVG brand mark created from specified elements and palette, replaceable with official provided files.

## Color tokens (پیش‌فرض اجرایی - extracted from described palette)
- `--color-gold`: #C9A227 (metallic gold base)
- `--color-gold-light`: #E2C45A
- `--color-gold-dark`: #9E7C19
- `--color-black`: #0B0B0B (deep black)
- `--color-teal`: #0B3D3A (dark teal / deep emerald)
- `--color-teal-dark`: #072928
- `--color-ivory`: #F7F3E8 (ivory accent)
- `--color-white`: #FFFFFF

> Note: Exact values should be calibrated from official reference images when added to `src/assets/`.

## Security & session executive defaults (pending user confirmation items implemented as safe defaults)
- Web app: `ANYONE_ANONYMOUS`, `USER_DEPLOYING` (confirmed).
- Password KDF: PBKDF2-HMAC-SHA256, `dkLen=32`, per-user `salt` (random), per-user `iterations` and `hash_version` stored. Pepper from Script Properties key `AUTH_PEPPER`.
- Calibration target: p95 <= 1000ms in real GAS. **پیش‌فرض اجرایی**: initial runtime calibration routine sets `iterations_current` in `Meta`; bootstrap uses calibrated value; if not calibrated, conservative fallback `20000` is used until calibration is run by admin in setup.
- Lazy rehash: on successful login if user params < current policy/version, rehash with new random salt.
- Session: server-side token (random), stored in `CacheService` keyed by hashed token. **پیش‌فرض اجرایی**: absolute TTL 8h, idle timeout 60m, max 3 concurrent sessions per user; 4th login invalidates oldest. Invalidate on logout/password change/deactivate/lock.
- Login lock: **پیش‌فرض اجرایی**: 5 failed attempts -> 15 minute lock; admin can unlock/reset.
- Bootstrap: one-time admin bootstrap when no active admin exists, requires password change on first login.

## Data & finance defaults
- Amounts: integer Toman. Dates: stored ISO/standard, displayed Jalali.
- Discount: header-level, requires manager approval before effective; allocated to items by Largest Remainder.
- Commission: calculated on invoice issue (`issued`), basis after discount excluding tax. Fixed commission `per_unit = fixed_amount_per_unit * quantity` from `InvoiceItems.quantity`. Lifecycle `calculated -> payable -> paid` only (no direct calculated->paid), manager-only transitions, audited.
- Invoice issued snapshot immutable; amendments/voids adjust prior commission effects with auditable history.
- Soft delete via `is_deleted`.
- Unique: `username`, `invoice_no`.

## Remaining items
All unconfirmed items from design section 9 remain non-final until explicitly approved; implemented values above are marked **پیش‌فرض اجرایی**.

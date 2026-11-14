/**
 * Server_06_Auth.gs - Authentication, sessions, password hashing (PBKDF2-HMAC-SHA256)
 * Executive defaults: PBKDF2 calibrated (p95<=1s) with fallback, per-user iterations/hash_version, lazy rehash with new salt.
 */
var WRC = WRC || {};
WRC.Auth = (function() {
  function sha256Bytes(str) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  }
  function hmacSha256Bytes(keyBytesOrString, msgString) {
    // Utilities.computeHmacSha256Signature(value, key)
    return Utilities.computeHmacSha256Signature(msgString, keyBytesOrString);
  }
  function bytesXor(a, b) {
    var out = [];
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) out.push(((a[i] || 0) ^ (b[i] || 0)) & 0xFF);
    return out;
  }
  function int32ToBytesBE(i) {
    return [(i >>> 24) & 0xFF, (i >>> 16) & 0xFF, (i >>> 8) & 0xFF, i & 0xFF];
  }
  function bytesToBinaryString(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xFF);
    return s;
  }

  function pbkdf2HmacSha256(password, saltBase64, iterations, dkLen, pepper) {
    iterations = Math.max(1, parseInt(iterations, 10) || WRC.Config.AUTH.FALLBACK_ITERATIONS);
    dkLen = dkLen || WRC.Config.AUTH.DK_LEN;
    var saltBytes = WRC.Utils.base64ToBytes(saltBase64);
    var passInput = String(password) + ':' + String(pepper || '');
    // Key for HMAC is passInput string; salt+INT(i) as message per PBKDF2
    var hLen = 32;
    var l = Math.ceil(dkLen / hLen);
    var derived = [];
    for (var i = 1; i <= l; i++) {
      var msgBytes = saltBytes.concat(int32ToBytesBE(i));
      var msg = bytesToBinaryString(msgBytes);
      var u = hmacSha256Bytes(passInput, msg);
      var t = u.slice();
      for (var j = 1; j < iterations; j++) {
        u = hmacSha256Bytes(passInput, bytesToBinaryString(u));
        t = bytesXor(t, u);
      }
      derived = derived.concat(t);
    }
    return WRC.Utils.bytesToBase64(derived.slice(0, dkLen));
  }

  function generateSaltBase64() {
    var bytes = [];
    for (var i = 0; i < WRC.Config.AUTH.SALT_BYTES; i++) bytes.push(Math.floor(Math.random() * 256));
    try {
      // add entropy
      var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + new Date().getTime(), Utilities.Charset.UTF_8);
      for (var j = 0; j < bytes.length; j++) bytes[j] = (bytes[j] ^ (d[j] & 0xFF)) & 0xFF;
    } catch (e) {}
    return Utilities.base64Encode(bytes);
  }

  function hashPassword(password, opts) {
    opts = opts || {};
    var salt = opts.salt || generateSaltBase64();
    var iterations = opts.iterations || WRC.Config.getCurrentIterations();
    var hashVersion = opts.hashVersion || WRC.Config.AUTH.HASH_VERSION;
    var pepper = WRC.Config.getPepper();
    var hash = pbkdf2HmacSha256(password, salt, iterations, WRC.Config.AUTH.DK_LEN, pepper);
    return { hash: hash, salt: salt, iterations: iterations, hashVersion: hashVersion, algo: WRC.Config.AUTH.ALGO };
  }

  function verifyPassword(password, user) {
    var pepper = WRC.Config.getPepper();
    var iterations = WRC.Utils.toInt(user.iterations, WRC.Config.AUTH.FALLBACK_ITERATIONS);
    var hash = pbkdf2HmacSha256(password, user.password_salt, iterations, WRC.Config.AUTH.DK_LEN, pepper);
    return WRC.Utils.constantTimeEqual(hash, user.password_hash);
  }

  function needsRehash(user) {
    var currentIter = WRC.Config.getCurrentIterations();
    var uIter = WRC.Utils.toInt(user.iterations, 0);
    var uVer = WRC.Utils.toInt(user.hash_version, 0);
    return uIter < currentIter || uVer < WRC.Config.AUTH.HASH_VERSION || String(user.hash_algo || '') !== WRC.Config.AUTH.ALGO;
  }

  function getUserByUsername(username) {
    var uname = WRC.Utils.normalizeUsername(username);
    var users = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.USERS, { includeDeleted: false });
    for (var i = 0; i < users.length; i++) {
      if (WRC.Utils.normalizeUsername(users[i].username) === uname) return users[i];
    }
    return null;
  }

  function isLocked(user) {
    var until = user.locked_until ? new Date(user.locked_until).getTime() : 0;
    return until && until > WRC.Utils.nowMs();
  }

  function recordFailedLogin(user) {
    var attempts = WRC.Utils.toInt(user.failed_attempts, 0) + 1;
    var patch = { failed_attempts: attempts, updated_at: WRC.Utils.nowIso(), updated_by: 'system' };
    if (attempts >= WRC.Config.AUTH.MAX_FAILED_ATTEMPTS) {
      patch.locked_until = new Date(WRC.Utils.nowMs() + WRC.Config.AUTH.LOCK_MINUTES * 60000).toISOString();
      patch.failed_attempts = 0;
    }
    WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, user.id, patch);
  }

  function clearFailedLogin(user) {
    WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, user.id, {
      failed_attempts: 0, locked_until: '', updated_at: WRC.Utils.nowIso(), updated_by: user.id
    });
  }

  function sessionCacheKey(tokenHash) { return WRC.Config.SESSION.CACHE_PREFIX + tokenHash; }
  function userSessionsKey(userId) { return WRC.Config.SESSION.USER_INDEX_PREFIX + userId; }

  function hashToken(token) {
    var bytes = sha256Bytes(String(token));
    return WRC.Utils.bytesToHex(bytes);
  }

  function createSession(user, deviceInfo) {
    var token = Utilities.getUuid() + Utilities.getUuid();
    var tokenHash = hashToken(token);
    var now = WRC.Utils.nowMs();
    var sess = {
      id: WRC.Utils.uuid(),
      user_id: user.id,
      token_hash: tokenHash,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + WRC.Config.SESSION.ABSOLUTE_TTL_SECONDS * 1000).toISOString(),
      idle_expires_at: new Date(now + WRC.Config.SESSION.IDLE_TIMEOUT_SECONDS * 1000).toISOString(),
      last_activity_at: new Date(now).toISOString(),
      revoked_at: '',
      revoke_reason: '',
      device_info: deviceInfo || '',
      is_deleted: 'false'
    };

    var cache = CacheService.getScriptCache();
    // manage concurrent sessions (index in cache) - executive default
    var idxKey = userSessionsKey(user.id);
    var idx = WRC.Utils.safeJsonParse(cache.get(idxKey), []);
    if (!Array.isArray(idx)) idx = [];
    // remove expired/revoked known
    idx = idx.filter(function(x){ return x && x.hash && x.expiresAt && new Date(x.expiresAt).getTime() > now; });
    // enforce max
    while (idx.length >= WRC.Config.SESSION.MAX_CONCURRENT) {
      var oldest = idx.shift();
      if (oldest && oldest.hash) cache.remove(sessionCacheKey(oldest.hash));
    }
    idx.push({ hash: tokenHash, issuedAt: sess.issued_at, expiresAt: sess.expires_at });
    cache.put(idxKey, WRC.Utils.safeJsonStringify(idx), WRC.Config.SESSION.ABSOLUTE_TTL_SECONDS);
    cache.put(sessionCacheKey(tokenHash), WRC.Utils.safeJsonStringify(sess), WRC.Config.SESSION.IDLE_TIMEOUT_SECONDS);

    // persist lightweight session record
    try { WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.SESSIONS, sess); } catch (e) {}
    return { token: token, session: sess };
  }

  function getSessionByToken(token) {
    if (!token) return null;
    var tokenHash = hashToken(token);
    var cache = CacheService.getScriptCache();
    var raw = cache.get(sessionCacheKey(tokenHash));
    if (!raw) return null;
    var sess = WRC.Utils.safeJsonParse(raw, null);
    if (!sess || sess.revoked_at) return null;
    var now = WRC.Utils.nowMs();
    if (new Date(sess.expires_at).getTime() <= now) { cache.remove(sessionCacheKey(tokenHash)); return null; }
    if (new Date(sess.idle_expires_at).getTime() <= now) { cache.remove(sessionCacheKey(tokenHash)); return null; }
    // sliding idle
    sess.last_activity_at = new Date(now).toISOString();
    sess.idle_expires_at = new Date(now + WRC.Config.SESSION.IDLE_TIMEOUT_SECONDS * 1000).toISOString();
    cache.put(sessionCacheKey(tokenHash), WRC.Utils.safeJsonStringify(sess), WRC.Config.SESSION.IDLE_TIMEOUT_SECONDS);
    return sess;
  }

  function revokeSession(token, reason) {
    if (!token) return;
    var tokenHash = hashToken(token);
    var cache = CacheService.getScriptCache();
    cache.remove(sessionCacheKey(tokenHash));
    // best-effort mark in sheet not required for cache-based auth; audit covers revocation events
  }

  function revokeAllUserSessions(userId, reason) {
    var cache = CacheService.getScriptCache();
    var idxKey = userSessionsKey(userId);
    var idx = WRC.Utils.safeJsonParse(cache.get(idxKey), []);
    if (Array.isArray(idx)) {
      idx.forEach(function(x){ if (x && x.hash) cache.remove(sessionCacheKey(x.hash)); });
    }
    cache.remove(idxKey);
  }

  function requireSession(token) {
    var sess = getSessionByToken(token);
    if (!sess) throw WRC.Errors.wrcError('UNAUTHORIZED', 'نشست معتبر نیست. دوباره وارد شوید.');
    var user = WRC.SheetRepo.findById(WRC.Config.SHEET_NAMES.USERS, sess.user_id, { includeDeleted: false });
    if (!user || String(user.is_deleted) === 'true' || String(user.is_active) !== 'true') {
      revokeSession(token, 'user_inactive');
      throw WRC.Errors.wrcError('UNAUTHORIZED', 'دسترسی کاربر غیرفعال است.');
    }
    return { session: sess, user: user };
  }

  function sanitizeUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      linked_doctor_id: user.linked_doctor_id || '',
      linked_operator_id: user.linked_operator_id || '',
      is_active: String(user.is_active) === 'true',
      must_change_password: String(user.must_change_password) === 'true',
      last_login_at: user.last_login_at || ''
    };
  }

  function login(username, password, deviceInfo) {
    username = WRC.Utils.normalizeUsername(username);
    if (!username || !password) throw WRC.Errors.wrcError('VALIDATION', 'نام کاربری و رمز عبور الزامی است.');
    return WRC.SheetRepo.withLock(function(){
      var user = getUserByUsername(username);
      if (!user || String(user.is_deleted) === 'true' || String(user.is_active) !== 'true') {
        WRC.Audit.log({ action:'auth.login_failed', entity:'Users', entityId: username, result:'fail', message:'invalid_user' });
        throw WRC.Errors.wrcError('AUTH_FAILED', 'نام کاربری یا رمز عبور نادرست است.');
      }
      if (isLocked(user)) {
        WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.login_locked', entity:'Users', entityId:user.id, result:'fail' });
        throw WRC.Errors.wrcError('AUTH_LOCKED', 'حساب موقتاً قفل شده است. بعداً تلاش کنید.');
      }
      var pepper = WRC.Config.getPepper();
      if (!pepper) {
        // allow bootstrap/setup context? login requires pepper set for secure verify except impossible; fail safe
        throw WRC.Errors.wrcError('AUTH_CONFIG', 'تنظیمات امنیتی ناقص است (Pepper).');
      }
      var ok = verifyPassword(password, user);
      if (!ok) {
        recordFailedLogin(user);
        WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.login_failed', entity:'Users', entityId:user.id, result:'fail', message:'bad_password' });
        throw WRC.Errors.wrcError('AUTH_FAILED', 'نام کاربری یا رمز عبور نادرست است.');
      }
      // success
      clearFailedLogin(user);
      var patch = { last_login_at: WRC.Utils.nowIso(), updated_at: WRC.Utils.nowIso(), updated_by: user.id };
      if (needsRehash(user)) {
        var h = hashPassword(password); // new random salt
        patch.password_hash = h.hash; patch.password_salt = h.salt; patch.iterations = h.iterations; patch.hash_version = h.hashVersion; patch.hash_algo = h.algo;
        patch.last_password_change_at = WRC.Utils.nowIso();
        WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.lazy_rehash', entity:'Users', entityId:user.id, result:'ok' });
      }
      user = WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, user.id, patch);
      var created = createSession(user, deviceInfo || '');
      WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.login_success', entity:'Users', entityId:user.id, result:'ok' });
      return { token: created.token, user: sanitizeUser(user), mustChangePassword: String(user.must_change_password) === 'true' };
    }, 30000);
  }

  function logout(token, ctxUser) {
    revokeSession(token, 'logout');
    if (ctxUser) WRC.Audit.log({ userId:ctxUser.id, username:ctxUser.username, action:'auth.logout', entity:'Users', entityId:ctxUser.id, result:'ok' });
    return { ok: true };
  }

  function changePassword(token, oldPassword, newPassword) {
    var ctx = requireSession(token);
    if (!oldPassword || !newPassword) throw WRC.Errors.wrcError('VALIDATION', 'رمز فعلی و رمز جدید الزامی است.');
    if (String(newPassword).length < WRC.Config.AUTH.MIN_PASSWORD_LENGTH) throw WRC.Errors.wrcError('VALIDATION', 'حداقل طول رمز رعایت نشده است.');
    return WRC.SheetRepo.withLock(function(){
      var user = WRC.SheetRepo.findById(WRC.Config.SHEET_NAMES.USERS, ctx.user.id, { includeDeleted: false });
      if (!verifyPassword(oldPassword, user)) throw WRC.Errors.wrcError('AUTH_FAILED', 'رمز فعلی نادرست است.');
      var h = hashPassword(newPassword);
      user = WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, user.id, {
        password_hash: h.hash, password_salt: h.salt, iterations: h.iterations, hash_version: h.hashVersion, hash_algo: h.algo,
        must_change_password: 'false', last_password_change_at: WRC.Utils.nowIso(), updated_at: WRC.Utils.nowIso(), updated_by: user.id,
        failed_attempts: 0, locked_until: ''
      });
      revokeAllUserSessions(user.id, 'password_change');
      WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.password_change', entity:'Users', entityId:user.id, result:'ok' });
      return { ok: true };
    }, 30000);
  }

  function hasAnyActiveAdmin() {
    var users = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.USERS, { includeDeleted: false });
    return users.some(function(u){ return u.role === WRC.Config.ROLES.ADMIN && String(u.is_active) === 'true'; });
  }

  function bootstrapAdmin(payload) {
    // one-time, only when no active admin exists. payload: { username, password, displayName }
    payload = payload || {};
    var username = WRC.Utils.normalizeUsername(payload.username);
    var password = String(payload.password || '');
    var displayName = WRC.Utils.trimStr(payload.displayName || 'مدیر سیستم');
    if (!username || !password) throw WRC.Errors.wrcError('VALIDATION', 'نام کاربری و رمز عبور مدیر الزامی است.');
    if (password.length < WRC.Config.AUTH.MIN_PASSWORD_LENGTH) throw WRC.Errors.wrcError('VALIDATION', 'حداقل طول رمز رعایت نشده است.');
    if (!WRC.Config.getPepper()) throw WRC.Errors.wrcError('AUTH_CONFIG', 'AUTH_PEPPER در Script Properties تنظیم نشده است.');
    return WRC.SheetRepo.withLock(function(){
      if (hasAnyActiveAdmin()) throw WRC.Errors.wrcError('BOOTSTRAP_NOT_ALLOWED', 'مدیر فعال وجود دارد.');
      var existing = getUserByUsername(username);
      if (existing) throw WRC.Errors.wrcError('DUPLICATE', 'نام کاربری تکراری است.');
      var h = hashPassword(password);
      var now = WRC.Utils.nowIso();
      var user = {
        id: WRC.Utils.uuid(), username: username,
        password_hash: h.hash, password_salt: h.salt, hash_algo: h.algo, hash_version: h.hashVersion, iterations: h.iterations,
        display_name: displayName, role: WRC.Config.ROLES.ADMIN,
        linked_doctor_id: '', linked_operator_id: '',
        is_active: 'true', must_change_password: 'true',
        failed_attempts: 0, locked_until: '', last_login_at: '', last_password_change_at: now,
        created_at: now, created_by: 'bootstrap', updated_at: now, updated_by: 'bootstrap',
        is_deleted: 'false', deleted_at: '', deleted_by: ''
      };
      WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.USERS, user);
      WRC.Audit.log({ userId:user.id, username:user.username, action:'auth.bootstrap_admin', entity:'Users', entityId:user.id, result:'ok' });
      return { ok: true, user: sanitizeUser(user) };
    }, 30000);
  }

  return {
    hashPassword: hashPassword, verifyPassword: verifyPassword, needsRehash: needsRehash,
    login: login, logout: logout, requireSession: requireSession, sanitizeUser: sanitizeUser,
    changePassword: changePassword, bootstrapAdmin: bootstrapAdmin, hasAnyActiveAdmin: hasAnyActiveAdmin,
    getUserByUsername: getUserByUsername, revokeAllUserSessions: revokeAllUserSessions,
    hashToken: hashToken
  };
})();

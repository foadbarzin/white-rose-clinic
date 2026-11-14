/**
 * Server_09_SettingsUsers.gs - Settings and Users management
 */
var WRC = WRC || {};
WRC.SettingsSvc = (function() {
  function getAll(ctx) {
    var rows = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.SETTINGS, { includeDeleted: true });
    var map = {};
    rows.forEach(function(r){ map[r.key] = r.value; });
    return map;
  }
  function get(key) {
    var rows = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.SETTINGS, { includeDeleted: true });
    for (var i=0;i<rows.length;i++) if (rows[i].key === key) return rows[i].value;
    return null;
  }
  function set(key, value, ctx) {
    WRC.Permissions.assert('settings.manage', ctx.user);
    var rows = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.SETTINGS, { includeDeleted: true });
    var now = WRC.Utils.nowIso();
    for (var i=0;i<rows.length;i++) if (rows[i].key === key) {
      WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.SETTINGS, rows[i].id || rows[i]._rowIndex, { value: String(value), updated_at: now, updated_by: ctx.user.id });
      // Settings sheet has no id column in schema; handle by replace
    }
    // simple approach: read/update via sheet directly
    var sh = WRC.SheetRepo.getSheet(WRC.Config.SHEET_NAMES.SETTINGS);
    var hi = WRC.SheetRepo.headerIndexMap(sh);
    var lr = sh.getLastRow();
    if (lr >= 2) {
      var vals = sh.getRange(2,1,lr-1,sh.getLastColumn()).getValues();
      for (var j=0;j<vals.length;j++) if (String(vals[j][hi.map['key']]) === String(key)) {
        sh.getRange(j+2, hi.map['value']+1).setValue(String(value));
        if (hi.map['updated_at']!==undefined) sh.getRange(j+2, hi.map['updated_at']+1).setValue(now);
        if (hi.map['updated_by']!==undefined) sh.getRange(j+2, hi.map['updated_by']+1).setValue(ctx.user.id);
        WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'settings.update', entity:'Settings', entityId:key, after:{key:key,value:value}, result:'ok' });
        return { ok: true };
      }
    }
    WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.SETTINGS, { key:key, value:String(value), description:'', updated_at:now, updated_by:ctx.user.id });
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'settings.create', entity:'Settings', entityId:key, after:{key:key,value:value}, result:'ok' });
    return { ok: true };
  }
  return { getAll: getAll, get: get, set: set };
})();

WRC.UsersSvc = (function() {
  function list(ctx) {
    WRC.Permissions.assert('users.manage', ctx.user);
    var users = WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.USERS, { includeDeleted: false });
    return users.map(function(u){ return WRC.Auth.sanitizeUser(u); }).concat(users.map(function(u){ return {
      id:u.id, username:u.username, display_name:u.display_name, role:u.role,
      linked_doctor_id:u.linked_doctor_id||'', linked_operator_id:u.linked_operator_id||'',
      is_active:String(u.is_active)==='true', must_change_password:String(u.must_change_password)==='true',
      failed_attempts:WRC.Utils.toInt(u.failed_attempts,0), locked_until:u.locked_until||'', last_login_at:u.last_login_at||'',
      created_at:u.created_at||''
    }; })).filter(function(_,i,arr){ return i < arr.length/2 ? false : true; });
  }
  function listSafe(ctx) {
    WRC.Permissions.assert('users.manage', ctx.user);
    return WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.USERS, { includeDeleted: false }).map(function(u){
      return { id:u.id, username:u.username, display_name:u.display_name, role:u.role,
        linked_doctor_id:u.linked_doctor_id||'', linked_operator_id:u.linked_operator_id||'',
        is_active:String(u.is_active)==='true', must_change_password:String(u.must_change_password)==='true',
        failed_attempts:WRC.Utils.toInt(u.failed_attempts,0), locked_until:u.locked_until||'', last_login_at:u.last_login_at||'', created_at:u.created_at||'' };
    });
  }
  function create(payload, ctx) {
    WRC.Permissions.assert('users.manage', ctx.user);
    payload = payload || {};
    var username = WRC.Utils.normalizeUsername(payload.username);
    var password = String(payload.password || '');
    var role = String(payload.role || '');
    if (!username || !password) throw WRC.Errors.wrcError('VALIDATION', 'نام کاربری و رمز عبور الزامی است.');
    if ([WRC.Config.ROLES.ADMIN,WRC.Config.ROLES.OPERATOR,WRC.Config.ROLES.DOCTOR].indexOf(role) < 0) throw WRC.Errors.wrcError('VALIDATION', 'نقش نامعتبر است.');
    if (password.length < WRC.Config.AUTH.MIN_PASSWORD_LENGTH) throw WRC.Errors.wrcError('VALIDATION', 'حداقل طول رمز رعایت نشده است.');
    if (WRC.Auth.getUserByUsername(username)) throw WRC.Errors.wrcError('DUPLICATE', 'نام کاربری تکراری است.');
    var h = WRC.Auth.hashPassword(password);
    var now = WRC.Utils.nowIso();
    var user = {
      id: WRC.Utils.uuid(), username: username,
      password_hash: h.hash, password_salt: h.salt, hash_algo: h.algo, hash_version: h.hashVersion, iterations: h.iterations,
      display_name: WRC.Utils.trimStr(payload.display_name || payload.displayName || username),
      role: role,
      linked_doctor_id: WRC.Utils.trimStr(payload.linked_doctor_id || ''), linked_operator_id: WRC.Utils.trimStr(payload.linked_operator_id || ''),
      is_active: 'true', must_change_password: payload.must_change_password === false ? 'false' : 'true',
      failed_attempts: 0, locked_until: '', last_login_at: '', last_password_change_at: now,
      created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id,
      is_deleted: 'false', deleted_at: '', deleted_by: ''
    };
    WRC.SheetRepo.appendRow(WRC.Config.SHEET_NAMES.USERS, user);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'users.create', entity:'Users', entityId:user.id, after:{username:user.username,role:user.role}, result:'ok' });
    return { id: user.id, username: user.username };
  }
  function update(payload, ctx) {
    WRC.Permissions.assert('users.manage', ctx.user);
    var id = payload && payload.id; if (!id) throw WRC.Errors.wrcError('VALIDATION','شناسه کاربر الزامی است.');
    var patch = { updated_at: WRC.Utils.nowIso(), updated_by: ctx.user.id };
    ['display_name','role','linked_doctor_id','linked_operator_id','is_active'].forEach(function(k){ if (payload.hasOwnProperty(k)) patch[k] = String(payload[k]); });
    if (patch.role && [WRC.Config.ROLES.ADMIN,WRC.Config.ROLES.OPERATOR,WRC.Config.ROLES.DOCTOR].indexOf(patch.role)<0) throw WRC.Errors.wrcError('VALIDATION','نقش نامعتبر است.');
    var before = WRC.SheetRepo.findById(WRC.Config.SHEET_NAMES.USERS, id, { includeDeleted:true });
    var u = WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, id, patch);
    if (String(u.is_active) !== 'true') WRC.Auth.revokeAllUserSessions(id, 'deactivated');
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'users.update', entity:'Users', entityId:id, before:{role:before&&before.role,is_active:before&&before.is_active}, after:patch, result:'ok' });
    return { ok: true };
  }
  function resetPassword(payload, ctx) {
    WRC.Permissions.assert('users.manage', ctx.user);
    var id = payload && payload.id; var newPassword = String(payload && payload.newPassword || '');
    if (!id || !newPassword) throw WRC.Errors.wrcError('VALIDATION','شناسه و رمز جدید الزامی است.');
    if (newPassword.length < WRC.Config.AUTH.MIN_PASSWORD_LENGTH) throw WRC.Errors.wrcError('VALIDATION','حداقل طول رمز رعایت نشده است.');
    var h = WRC.Auth.hashPassword(newPassword);
    WRC.SheetRepo.updateById(WRC.Config.SHEET_NAMES.USERS, id, { password_hash:h.hash, password_salt:h.salt, iterations:h.iterations, hash_version:h.hashVersion, hash_algo:h.algo, must_change_password:'true', failed_attempts:0, locked_until:'', last_password_change_at:WRC.Utils.nowIso(), updated_at:WRC.Utils.nowIso(), updated_by:ctx.user.id });
    WRC.Auth.revokeAllUserSessions(id, 'password_reset');
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'users.reset_password', entity:'Users', entityId:id, result:'ok' });
    return { ok: true };
  }
  return { list: listSafe, create: create, update: update, resetPassword: resetPassword };
})();

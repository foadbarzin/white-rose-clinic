/**
 * Server_10_Modules_Basic.gs - Customers, Doctors, Operators, Services CRUD
 */
var WRC = WRC || {};

function wrcBaseFieldsCreate(ctx) {
  var now = WRC.Utils.nowIso();
  return { created_at: now, created_by: ctx.user.id, updated_at: now, updated_by: ctx.user.id, is_deleted: 'false', deleted_at: '', deleted_by: '' };
}
function wrcBaseFieldsUpdate(ctx) { return { updated_at: WRC.Utils.nowIso(), updated_by: ctx.user.id }; }

WRC.CustomersSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.CUSTOMERS;
  function list(ctx) {
    if (WRC.Permissions.isDoctor(ctx.user)) WRC.Permissions.assert('customers.read.limited', ctx.user);
    else WRC.Permissions.assert('customers.read', ctx.user);
    var rows = WRC.SheetRepo.readAll(SHEET);
    if (WRC.Permissions.isDoctor(ctx.user)) {
      // limited: customers who have invoices with this doctor
      var inv = WRC.InvoicesSvc ? WRC.InvoicesSvc.listRaw() : WRC.SheetRepo.readAll(WRC.Config.SHEET_NAMES.INVOICES);
      var docId = String(ctx.user.linked_doctor_id||'');
      var allowed = {};
      inv.forEach(function(i){ if (String(i.doctor_id||'')===docId) allowed[String(i.customer_id||'')] = true; });
      rows = rows.filter(function(c){ return allowed[String(c.id)]); });
    }
    return rows;
  }
  function create(payload, ctx) {
    WRC.Permissions.assert('customers.create', ctx.user);
    payload = payload || {};
    var obj = Object.assign({ id: WRC.Utils.uuid(), full_name: WRC.Utils.trimStr(payload.full_name), mobile: WRC.Utils.trimStr(payload.mobile), phone: WRC.Utils.trimStr(payload.phone), national_code: WRC.Utils.trimStr(payload.national_code), birth_date: WRC.Utils.toIsoDateOnly(payload.birth_date), gender: WRC.Utils.trimStr(payload.gender), address: WRC.Utils.trimStr(payload.address), notes: WRC.Utils.trimStr(payload.notes), status: 'active' }, wrcBaseFieldsCreate(ctx));
    WRC.Utils.assert(obj.full_name, 'VALIDATION', 'نام مشتری الزامی است.');
    WRC.SheetRepo.appendRow(SHEET, obj);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'customers.create', entity:'Customers', entityId:obj.id, after:{full_name:obj.full_name}, result:'ok' });
    return obj;
  }
  function update(payload, ctx) {
    WRC.Permissions.assert('customers.update', ctx.user);
    if (!payload || !payload.id) throw WRC.Errors.wrcError('VALIDATION','شناسه الزامی است.');
    var patch = Object.assign({}, wrcBaseFieldsUpdate(ctx));
    ['full_name','mobile','phone','national_code','gender','address','notes','status'].forEach(function(k){ if (payload.hasOwnProperty(k)) patch[k]=WRC.Utils.trimStr(payload[k]); });
    if (payload.hasOwnProperty('birth_date')) patch.birth_date = WRC.Utils.toIsoDateOnly(payload.birth_date);
    var before = WRC.SheetRepo.findById(SHEET, payload.id);
    var obj = WRC.SheetRepo.updateById(SHEET, payload.id, patch);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'customers.update', entity:'Customers', entityId:payload.id, before:{full_name:before&&before.full_name}, after:patch, result:'ok' });
    return obj;
  }
  function remove(payload, ctx) {
    WRC.Permissions.assert('customers.delete', ctx.user);
    if (!payload || !payload.id) throw WRC.Errors.wrcError('VALIDATION','شناسه الزامی است.');
    var obj = WRC.SheetRepo.softDeleteById(SHEET, payload.id, ctx.user.id);
    WRC.Audit.log({ userId:ctx.user.id, username:ctx.user.username, action:'customers.delete', entity:'Customers', entityId:payload.id, result:'ok' });
    return { ok:true };
  }
  return { list:list, create:create, update:update, remove:remove };
})();

WRC.DoctorsSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.DOCTORS;
  function list(ctx) { WRC.Permissions.assert(WRC.Permissions.isDoctor(ctx.user)?'invoices.read.own':'doctors.read', ctx.user); return WRC.SheetRepo.readAll(SHEET); }
  function create(payload, ctx) { WRC.Permissions.assert('doctors.manage', ctx.user); payload=payload||{}; var obj=Object.assign({id:WRC.Utils.uuid(), full_name:WRC.Utils.trimStr(payload.full_name), specialty:WRC.Utils.trimStr(payload.specialty), mobile:WRC.Utils.trimStr(payload.mobile), is_active:'true', notes:WRC.Utils.trimStr(payload.notes), status:'active'}, wrcBaseFieldsCreate(ctx)); WRC.Utils.assert(obj.full_name,'VALIDATION','نام پزشک الزامی است.'); WRC.SheetRepo.appendRow(SHEET,obj); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'doctors.create',entity:'Doctors',entityId:obj.id,after:{full_name:obj.full_name},result:'ok'}); return obj; }
  function update(payload, ctx) { WRC.Permissions.assert('doctors.manage', ctx.user); if(!payload||!payload.id) throw WRC.Errors.wrcError('VALIDATION','شناسه الزامی است.'); var patch=Object.assign({},wrcBaseFieldsUpdate(ctx)); ['full_name','specialty','mobile','notes','status','is_active'].forEach(function(k){ if(payload.hasOwnProperty(k)) patch[k]=String(payload[k]); }); var obj=WRC.SheetRepo.updateById(SHEET,payload.id,patch); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'doctors.update',entity:'Doctors',entityId:payload.id,after:patch,result:'ok'}); return obj; }
  function remove(payload, ctx) { WRC.Permissions.assert('doctors.manage', ctx.user); WRC.SheetRepo.softDeleteById(SHEET,payload.id,ctx.user.id); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'doctors.delete',entity:'Doctors',entityId:payload.id,result:'ok'}); return {ok:true}; }
  return { list:list, create:create, update:update, remove:remove };
})();

WRC.OperatorsSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.OPERATORS;
  function list(ctx) { WRC.Permissions.assert(WRC.Permissions.isDoctor(ctx.user)?'invoices.read.own':'operators.read', ctx.user); return WRC.SheetRepo.readAll(SHEET); }
  function create(payload, ctx) { WRC.Permissions.assert('operators.manage', ctx.user); payload=payload||{}; var obj=Object.assign({id:WRC.Utils.uuid(), full_name:WRC.Utils.trimStr(payload.full_name), mobile:WRC.Utils.trimStr(payload.mobile), role_title:WRC.Utils.trimStr(payload.role_title), is_active:'true', notes:WRC.Utils.trimStr(payload.notes), status:'active'}, wrcBaseFieldsCreate(ctx)); WRC.Utils.assert(obj.full_name,'VALIDATION','نام اپراتور الزامی است.'); WRC.SheetRepo.appendRow(SHEET,obj); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'operators.create',entity:'Operators',entityId:obj.id,after:{full_name:obj.full_name},result:'ok'}); return obj; }
  function update(payload, ctx) { WRC.Permissions.assert('operators.manage', ctx.user); if(!payload||!payload.id) throw WRC.Errors.wrcError('VALIDATION','شناسه الزامی است.'); var patch=Object.assign({},wrcBaseFieldsUpdate(ctx)); ['full_name','mobile','role_title','notes','status','is_active'].forEach(function(k){ if(payload.hasOwnProperty(k)) patch[k]=String(payload[k]); }); var obj=WRC.SheetRepo.updateById(SHEET,payload.id,patch); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'operators.update',entity:'Operators',entityId:payload.id,after:patch,result:'ok'}); return obj; }
  function remove(payload, ctx) { WRC.Permissions.assert('operators.manage', ctx.user); WRC.SheetRepo.softDeleteById(SHEET,payload.id,ctx.user.id); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'operators.delete',entity:'Operators',entityId:payload.id,result:'ok'}); return {ok:true}; }
  return { list:list, create:create, update:update, remove:remove };
})();

WRC.ServicesSvc = (function(){
  var SHEET = WRC.Config.SHEET_NAMES.SERVICES;
  function list(ctx) { WRC.Permissions.assert(WRC.Permissions.isDoctor(ctx.user)?'invoices.read.own':'services.read', ctx.user); return WRC.SheetRepo.readAll(SHEET); }
  function create(payload, ctx) { WRC.Permissions.assert('services.manage', ctx.user); payload=payload||{}; var obj=Object.assign({id:WRC.Utils.uuid(), name:WRC.Utils.trimStr(payload.name), category:WRC.Utils.trimStr(payload.category), base_price_toman:WRC.Utils.toMoneyInt(payload.base_price_toman), duration_min:WRC.Utils.toInt(payload.duration_min,0), taxable: String(payload.taxable)==='false'?'false':'true', default_tax_rate: String(payload.default_tax_rate||'0'), is_active:'true', notes:WRC.Utils.trimStr(payload.notes), status:'active'}, wrcBaseFieldsCreate(ctx)); WRC.Utils.assert(obj.name,'VALIDATION','نام خدمت الزامی است.'); WRC.SheetRepo.appendRow(SHEET,obj); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'services.create',entity:'Services',entityId:obj.id,after:{name:obj.name},result:'ok'}); return obj; }
  function update(payload, ctx) { WRC.Permissions.assert('services.manage', ctx.user); if(!payload||!payload.id) throw WRC.Errors.wrcError('VALIDATION','شناسه الزامی است.'); var patch=Object.assign({},wrcBaseFieldsUpdate(ctx)); ['name','category','base_price_toman','duration_min','taxable','default_tax_rate','notes','status','is_active'].forEach(function(k){ if(payload.hasOwnProperty(k)) patch[k]=(k.indexOf('price')>=0||k.indexOf('duration')>=0)? (k.indexOf('price')>=0?WRC.Utils.toMoneyInt(payload[k]):WRC.Utils.toInt(payload[k],0)) : String(payload[k]); }); var obj=WRC.SheetRepo.updateById(SHEET,payload.id,patch); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'services.update',entity:'Services',entityId:payload.id,after:patch,result:'ok'}); return obj; }
  function remove(payload, ctx) { WRC.Permissions.assert('services.manage', ctx.user); WRC.SheetRepo.softDeleteById(SHEET,payload.id,ctx.user.id); WRC.Audit.log({userId:ctx.user.id,username:ctx.user.username,action:'services.delete',entity:'Services',entityId:payload.id,result:'ok'}); return {ok:true}; }
  return { list:list, create:create, update:update, remove:remove };
})();

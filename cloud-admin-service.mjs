// Database permissions enforce access even if this UI is changed or bypassed.
export function productPayload(values) {
  const sku=String(values.sku??'').trim(),name=String(values.name_zh??'').trim();
  if(!name)throw Error('請填寫商品名稱。');
  if(sku.length>80)throw Error('商品編號最多 80 字。');
  const raw=String(values.public_price_twd??'').trim();
  if(raw!==''&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>2147483647))throw Error('售價請填 0 至 2,147,483,647 的整數，或留空。');
  if(!['draft','published','archived'].includes(values.publication_status))throw Error('請選擇有效的上架狀態。');
  if(!['available','low_stock','sold_out','inquiry_only','coming_soon'].includes(values.supply_status))throw Error('請選擇有效的供貨狀態。');
  return {sku:sku||null,name_zh:name,name_en:String(values.name_en??'').trim(),description_public:String(values.description_public??'').trim(),public_price_twd:raw===''?null:Number(raw),price_is_inquiry:raw==='',publication_status:values.publication_status,supply_status:values.supply_status};
}
export function createAdminService(client, randomUUID=()=>crypto.randomUUID(), journal=null) {
  let pending=null,actorId=null;
  const journalKey=()=>`wj_staging_pending_stock:${actorId}`;
  function persistPending(){if(!journal)return;if(!actorId)throw Error('請重新登入後再調整庫存。');try{if(pending)journal.setItem(journalKey(),JSON.stringify(pending));else journal.removeItem(journalKey())}catch{throw Error('無法保存異動重試資訊，本次操作未送出。')}}
  const checked=({data,error})=>{if(error)throw error;return data};
  return {
    get pending(){return pending?{...pending}:null},
    async login(email,password){checked(await client.auth.signInWithPassword({email:email.trim(),password}));return this.authorize()},
    async authorize(){const {user}=checked(await client.auth.getUser());if(!user)throw Error('請先登入。');if(checked(await client.rpc('store_admin_status'))!==true)throw Error('此帳號尚未獲得管理員權限。');actorId=user.id;pending=null;if(journal){try{pending=JSON.parse(journal.getItem(journalKey())||'null')}catch{throw Error('無法讀取上次庫存操作，請先確認瀏覽器儲存設定。')}if(pending&&(!pending.p_product_id||!pending.p_idempotency_key||!Number.isInteger(pending.p_delta)||!pending.p_delta||typeof pending.p_reason!=='string'))throw Error('上次庫存操作紀錄異常，請先核對庫存紀錄。')}return user},
    async logout(){checked(await client.auth.signOut({scope:'local'}));pending=null;actorId=null},
    async list(){return checked(await client.from('products').select('id,sku,name_zh,name_en,description_public,public_price_twd,price_is_inquiry,publication_status,supply_status,updated_at,inventory_balances(quantity_on_hand)').order('manual_sort_order').order('id').limit(200))},
    async save(values,existing){const payload=productPayload(values);let query=client.from('products');query=existing?query.update(payload).eq('id',existing.id).eq('updated_at',existing.updated_at):query.insert(payload);const rows=checked(await query.select('id'));if(rows.length!==1)throw Error('商品已被其他裝置修改，請重新載入後再編輯。');return rows[0]},
    async adjust(productId,delta,reason){
      reason=String(reason??'').trim();
      if(!Number.isInteger(delta)||delta===0||delta< -2147483648||delta>2147483647)throw Error('庫存增減量必須是非零整數。');
      if(reason.length<3)throw Error('請填寫至少 3 個字的異動原因。');
      if(pending&&(pending.p_product_id!==productId||pending.p_delta!==delta||pending.p_reason!==reason))throw Error('上一筆結果尚未確認，請先重試同一筆。');
      pending??={p_product_id:productId,p_delta:delta,p_reason:reason,p_idempotency_key:randomUUID()};
      persistPending();
      let response;
      try{response=await client.rpc('admin_adjust_inventory',pending)}catch(error){throw error}
      if(response.error){if(/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(response.error.code??'')){pending=null;try{persistPending()}catch{}}throw response.error}
      pending=null;try{persistPending()}catch{}return response.data;
    }
  };
}

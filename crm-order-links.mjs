// 網站訂單（以及匯入的歷史購買）歸到哪一位客人。
// orders 表沒有客人 ID，只有 customer_alias（名稱），所以：
// ① 老闆在後台確認過的關聯（crm_order_links：訂單 ID → 客人 ID）優先；
// ② 沒有確認時，才用名稱比對，而且這個名稱只能指向一位客人：
//    客人主名稱、其他別名、Threads 顯示名稱（同名客人匯入後主名稱會加 #尾碼，但顯示名稱一樣）都算候選；
// ③ 候選超過一位 → 不歸戶，列入「待確認」，由老闆指定；不會自己挑一位。
export const normName=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();

export function nameCandidates({profiles=[],identities=[]}){
 const map=new Map();const add=(k,id)=>{if(!k||!id)return;if(!map.has(k))map.set(k,new Set());map.get(k).add(id)};
 const mains=new Set();
 for(const p of profiles){const k=normName(p.alias);add(k,p.id);mains.add(k)}
 for(const i of identities)add(normName(i.display_name),i.customer_id);
 // 其他別名：跟別人的主名稱重複時不採用（主名稱優先），沿用既有規則
 for(const p of profiles)for(const a of new Set((p.other_aliases??[]).map(normName)))if(a&&!mains.has(a))add(a,p.id);
 return map;
}

// 回傳 owner：訂單 ID（沒有 ID 時為訂單物件）→ 客人 ID；pending：名稱對到多位客人的訂單（待確認）；ambiguousNames：這些名稱
export function resolveOrderOwners({orders=[],profiles=[],identities=[],links=[]}){
 const linked=new Map((links??[]).map(l=>[l.order_id,l.customer_id]));
 const names=nameCandidates({profiles,identities});
 const owner=new Map(),pending=[],ambiguous=new Set();
 for(const o of orders){const key=o.id??o;// 沒有 ID 的資料（測試或舊匯入）以物件本身為鍵
  if(o.id&&linked.has(o.id)){owner.set(key,linked.get(o.id));continue}
  const k=normName(o.customer_alias);const c=k?names.get(k):null;if(!c?.size)continue;
  if(c.size===1)owner.set(key,[...c][0]);
  else{pending.push({order_id:o.id,alias:o.customer_alias,candidates:[...c]});ambiguous.add(k)}
 }
 return {owner,pending,ambiguousNames:[...ambiguous].sort()};
}

// 沒有訂單 ID 的資料（匯入的歷史購買）：名稱只指向一位客人才歸戶
export function resolveNameOwner(name,index){const c=index.get(normName(name));return c?.size===1?[...c][0]:null}

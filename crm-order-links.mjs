// 暫時：重現目前行為（依 customer_alias 名稱歸戶）
export function resolveOrderOwners({orders=[],profiles=[]}){const by=new Map(profiles.map(p=>[String(p.alias).trim().toLowerCase(),p.id]));const owner=new Map();for(const o of orders){const c=by.get(String(o.customer_alias??'').trim().toLowerCase());if(c)owner.set(o.id,c)}return {owner,pending:[]}}

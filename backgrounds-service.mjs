export const normalizeSearch=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\-–—_]/g,'');
export function backgroundState(row){return row.release_state==='upcoming'?'upcoming':['official-event-confirmed','catalog-crosschecked','owner-confirmed'].includes(row.verification)&&row.release_state==='released'?'verified':'pending'}
export function backgroundPokemon(row){return [...(row.pokemon??[]),...(row.evolved_pokemon??[])]}
export function backgroundMatch(row,query){const term=normalizeSearch(query);if(!term)return true;if(/^#?\d+$/.test(term)){const n=Number(term.replace('#',''));return backgroundPokemon(row).some(p=>p.dex===n)}return normalizeSearch([row.name_en,row.name_zh,row.series,row.series_zh,row.year,row.region_zh,row.region_en,...backgroundPokemon(row).flatMap(p=>[p.name_en,p.name_zh])].join(' ')).includes(term)}
export function relatedProducts(row,products){const ids=new Set(row.related_product_ids??[]);return products.filter(p=>ids.has(p.id))}
export function filterBackgrounds(rows,{query='',type='',series='',region='',year='',state='verified',stockOnly=false,products=[]}={}){return rows.filter(r=>backgroundMatch(r,query)&&(!type||r.type===type)&&(!series||r.series===series)&&(!region||r.region_en===region)&&(!year||r.year===year)&&(state==='all'||(state==='official'?r.verification==='official-event-confirmed'&&backgroundState(r)==='verified':state==='catalogued'?r.verification==='catalog-crosschecked'&&backgroundState(r)==='verified':backgroundState(r)===state))&&(!stockOnly||relatedProducts(r,products).some(p=>['available','low_stock'].includes(p.status)&&Number.isInteger(p.stock_quantity)&&p.stock_quantity>0)))}
export function safeBackgroundImage(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&/\.(jpe?g|png|webp)$/i.test(u.pathname)&&u.href.length<=2000?u.href:''}catch{return ''}}
export function safeSource(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}

export function sortBackgrounds(rows,{order='newest',locale='zh'}={}){
 const name=r=>locale==='en'?r.name_en:(r.name_zh||r.name_en);
 const byName=(a,b)=>String(name(a)||'').localeCompare(String(name(b)||''),locale==='en'?'en':'zh-Hant');
 return [...rows].sort((a,b)=>{if(order==='name')return byName(a,b);const da=a.start_date||a.year||'',db=b.start_date||b.year||'';if(!da||!db)return da?-1:db?1:byName(a,b);return (order==='oldest'?da.localeCompare(db):db.localeCompare(da))||byName(a,b)});
}

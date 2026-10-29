export const normalizeSearch=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\-–—_]/g,'');
export function backgroundState(row){return row.release_state==='upcoming'?'upcoming':['official-event-confirmed','catalog-crosschecked','owner-confirmed'].includes(row.verification)&&row.release_state==='released'?'verified':'pending'}
export function backgroundPokemon(row){return [...(row.pokemon??[]),...(row.evolved_pokemon??[])]}
export function backgroundMatch(row,query){const term=normalizeSearch(query);if(!term)return true;if(/^#?\d+$/.test(term)){const n=Number(term.replace('#',''));return [...backgroundPokemon(row),...(row.upcoming_pokemon??[]),...(row.unconfirmed_pokemon??[])].some(p=>p.dex===n)}return normalizeSearch([row.name_en,row.name_zh,...(row.search_aliases??[]),...(row.upcoming_pokemon??[]).flatMap(p=>[p.name_en,p.name_zh]),...(row.unconfirmed_pokemon??[]).flatMap(p=>[p.name_en,p.name_zh]),row.series,row.series_zh,row.year,row.region_zh,row.region_en,...backgroundPokemon(row).flatMap(p=>[p.name_en,p.name_zh])].join(' ')).includes(term)}
export function relatedProducts(row,products){const ids=new Set(row.related_product_ids??[]),seen=new Set();return products.filter(p=>ids.has(p.id)&&!seen.has(p.id)&&seen.add(p.id))}
export function productOnSale(p){return ['available','low_stock'].includes(p.status)&&(p.stock_quantity==null||(Number.isInteger(p.stock_quantity)&&p.stock_quantity>0))}
export function backgroundProductSummary(row,products){
 const related=relatedProducts(row,products);
 return {onSale:related.filter(productOnSale).length,inquiry:related.filter(p=>p.status==='inquiry_only').length,comingSoon:related.filter(p=>p.status==='coming_soon').length,soldOut:related.filter(p=>p.status==='sold_out'||(['available','low_stock'].includes(p.status)&&p.stock_quantity===0)).length};
}
export function filterBackgrounds(rows,{query='',type='',series='',region='',year='',state='verified',stockOnly=false,products=[]}={}){return rows.filter(r=>backgroundMatch(r,query)&&(!type||r.type===type)&&(!series||r.series===series)&&(!region||r.region_en===region)&&(!year||r.year===year)&&(state==='all'||(state==='official'?r.verification==='official-event-confirmed'&&backgroundState(r)==='verified':state==='catalogued'?r.verification==='catalog-crosschecked'&&backgroundState(r)==='verified':backgroundState(r)===state))&&(!stockOnly||relatedProducts(r,products).some(productOnSale)))}
export function safeBackgroundImage(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&/\.(jpe?g|png|webp)$/i.test(u.pathname)&&u.href.length<=2000?u.href:''}catch{return ''}}
export function safeSource(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}

// A usable URL is not evidence of permission. Match approval to the exact image,
// including cloud overrides; an unavailable registry must never enable artwork.
export function permittedBackgroundImage(row,permissions,{today=new Date().toISOString().slice(0,10)}={}){
 const image=safeBackgroundImage(row.image_source);if(!image)return '';
 return (permissions?.entries??[]).some(p=>p.image_url===image&&p.usage==='commercial-web'&&safeSource(p.permission_source)&&(!p.expires_on||(/^\d{4}-\d{2}-\d{2}$/.test(p.expires_on)&&p.expires_on>=today)))?image:'';
}

export function sortBackgrounds(rows,{order='newest',locale='zh'}={}){
 const name=r=>locale==='en'?r.name_en:(r.name_zh||r.name_en);
 const byName=(a,b)=>String(name(a)||'').localeCompare(String(name(b)||''),locale==='en'?'en':'zh-Hant');
 return [...rows].sort((a,b)=>{if(order==='name')return byName(a,b);const da=a.start_date||a.year||'',db=b.start_date||b.year||'';if(!da||!db)return da?-1:db?1:byName(a,b);return (order==='oldest'?da.localeCompare(db):db.localeCompare(da))||byName(a,b)});
}

// Separate complete depictions from duplicate references and raw image layers.
export function publicBackgroundReferences(row,referenceData){
 return (referenceData?.entries??[]).filter(e=>e.background_id===row.background_id&&(!e.display_role||e.display_role==='primary'));
}
export function referenceArtwork(row,referenceData){
 if(row.cloud_override||row.cloud_version>0)return safeBackgroundImage(row.image_source);
 const preview=safeBackgroundImage(row.artwork_preview_url);if(preview)return preview;
 const refs=publicBackgroundReferences(row,referenceData);
 const primary=refs.find(e=>e.display_role==='primary')||refs.find(e=>e.date_kind==='release')||refs[0];
 return safeBackgroundImage(primary?.image_url||row.image_source);
}

// A complete preview may include animation layers missing from a raw texture.
// Alternate depictions remain in the same entry, rather than inflating counts.
export function backgroundArtworkGallery(row,referenceData){
 const main=referenceArtwork(row,referenceData),seen=new Set();
 const entries=[{image_url:main,label_zh:'主要參考圖',label_en:'Main reference',source_url:row.artwork_preview_source||row.source},...(Array.isArray(row.artwork_variants)?row.artwork_variants:[])];
 return entries.filter(e=>{const url=safeBackgroundImage(e?.image_url);if(!url||seen.has(url))return false;seen.add(url);return true}).map(e=>({...e,image_url:safeBackgroundImage(e.image_url),source_url:safeSource(e.source_url)}));
}

// Presentation only: preserve all source rows, IDs, artwork and deep links.
export const ANCIENTS_RECOVERED_IDS=/* @__PURE__ */Object.freeze(['BG-0265','BG-0271','BG-0272','BG-0273','BG-0274','BG-0275']);
export function groupBackgroundCards(rows,{eligibleRows=rows}={}){
 const ids=new Set(ANCIENTS_RECOVERED_IDS),matchedIds=rows.filter(r=>ids.has(r.background_id)).map(r=>r.background_id);
 if(!matchedIds.length)return [...rows];
 const members=ANCIENTS_RECOVERED_IDS.map(id=>eligibleRows.find(r=>r.background_id===id)).filter(Boolean);
 const group={activity_id:'ancients-recovered',members,matchedIds};
 let inserted=false;
 return rows.flatMap(r=>{if(!ids.has(r.background_id))return [r];if(inserted)return [];inserted=true;return [group]});
}

// Announced events without verified artwork remain separate from released counts.
export function filterBackgroundAnnouncements(rows,options={}){
 if(options.stockOnly||!['verified','all','upcoming',undefined].includes(options.state))return [];
 return filterBackgrounds(rows.map(r=>({...r,release_state:'upcoming',related_product_ids:[]})),{...options,state:'upcoming',stockOnly:false,products:[]});
}

// Group encounters within a background; never merge activity cards or infer routes
// from species type. Unknown/new cloud-edited variants remain visibly unassigned.
const arrangedIds=new Set(['BG-0190','BG-0070','BG-0122','BG-0123','BG-0022']);
export function sortPokemonByDex(rows){return [...(rows??[])].sort((a,b)=>(Number(a.dex)||Infinity)-(Number(b.dex)||Infinity))}
export function detailPokemonRows(row,{evolved=false}={}){const rows=row[evolved?'evolved_pokemon':'pokemon']??[];return arrangedIds.has(row.background_id)?sortPokemonByDex(rows):[...rows]}
const nagasakiSource='https://pokemongo.com/gowildarea/nagasaki/gameplay';
const route=(id,zh,en,dex,note_zh='',note_en='',source='')=>({id,label_zh:zh,label_en:en,dex,note_zh,note_en,source});
function routesFor(row){
 if(row.background_id==='BG-0070')return [
  route('raids','團體戰','Raids',[488,491,760],'暗影克雷色利亞、暗影達克萊伊及披風穿著熊；有機會附長崎背景。','Shadow Cresselia, Shadow Darkrai and wilderness-cape Bewear: chance of the Nagasaki background.',nagasakiSource),
  route('max','極巨戰（超極巨化）','Max Battles (Gigantamax)',[861],'此區為超極巨長毛巨魔；一般長毛巨魔的進化取得另列於下方。','Gigantamax Grimmsnarl; ordinary evolved Grimmsnarl is listed separately below.',nagasakiSource),
  route('stamps','蓋章／GO 集章','GO Stamp Rally',[728,633,859,760,181],'活動集章含球球海獅、單首龍、搗蛋小妖及披風穿著熊。電龍為 2025-11-10 起另開放的全民集章。','Event stamps include Popplio, Deino, Impidimp and wilderness-cape Bewear. The separate public Ampharos rally started on 2025-11-10.','https://pokemongo.com/news/stamp-rally-nagasaki'),
  route('research','調查獎勵','Research rewards',[38,210,229,282,303,359,461,488,491,635,730,858,861,862,908],'保留限時／特殊調查取得；同一款有多種途徑時會在各區重複列出，不增加原始款數。','Timed/Special Research routes are retained. A variant with multiple routes appears in each relevant section without increasing the encounter count.','https://leekduck.com/events/pokemon-go-wild-area-2025-nagasaki-japan/')
 ];
 if(['BG-0122','BG-0123'].includes(row.background_id)){const city=row.background_id==='BG-0122'?'tainan':'losangeles';return [
  route('day-raids','一般團體戰（日間，含超級團體戰）','Daytime raids (including Mega Raids)',[71,130,282,359,448,679,687,716,717],'列出捕捉後的寶可夢，不以超級頭目形態當作捕獲形態；需符合現場票券與時段。','Lists the caught Pokémon, not the Mega boss form. Event ticket and in-person timing requirements apply.',`https://pokemongo.com/gotour/${city}/gameplay`),
  route('mega-night','超級之夜｜Mega Night','Mega Night',[6,149,181,254,334,373,445],'另購超級之夜票券；包含原先六款，以及活動追加的超級快龍捕獲快龍。','Separate Mega Night ticket required; includes the six announced encounters plus Dragonite, added during the event.',`https://pokemongo.com/gotour/${city}/mega-night`)
 ]}
 if(row.background_id==='BG-0022')return [
  route('legends','傳說團體戰','Legendary raids',[483,484]),
  {...route('normal','顫弦蠑螈・一般','Toxtricity · Regular',[]),variants:['toxtricity-amped','toxtricity-low-key']},
  {...route('dynamax','顫弦蠑螈・極巨化','Toxtricity · Dynamax',[]),variants:['toxtricity-dynamax-amped','toxtricity-dynamax-low-key']},
  {...route('gigantamax','顫弦蠑螈・超極巨化','Toxtricity · Gigantamax',[]),variants:['toxtricity-gigantamax']}
 ];
 return [];
}
export function detailPokemonSections(row){
 const rows=detailPokemonRows(row),routes=routesFor(row);if(!routes.length)return [];
 const assigned=new Set(),sections=[];
 for(const r of routes){const pokemon=rows.filter(p=>r.variants?r.variants.includes(p.variant_id):r.dex.includes(p.dex));if(!pokemon.length)continue;for(const p of pokemon)assigned.add(p);sections.push({...r,pokemon})}
 const remaining=rows.filter(p=>!assigned.has(p));if(remaining.length)sections.push({id:'unassigned',label_zh:'其他／取得方式待核對',label_en:'Other / route awaiting verification',note_zh:'保留現有名錄資料，尚未確認取得途徑，不歸入已確認的團體戰或蓋章。',note_en:'Retained catalog entries with an unconfirmed acquisition route; not assigned to confirmed raids or stamp rewards.',pokemon:remaining});
 return sections;
}
export function pokemonFormLabel(p,locale='zh'){
 if(!/^toxtricity-/.test(p.variant_id??''))return '';
 if(p.variant_id.endsWith('low-key'))return locale==='en'?'Low Key Form':'低調的樣子';
 if(p.variant_id.endsWith('amped'))return locale==='en'?'Amped Form':'高調的樣子';
 return '';
}

// Preserve compact searches such as "ShinyPikachu" and let separate words match across fields.
export function normalizeSearchText(value){
 return String(value??'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC').toLowerCase().trim();
}
export function matchesSearchText(fields,query){
 const words=normalizeSearchText(query).split(/\s+/u).filter(Boolean);
 const text=normalizeSearchText(fields.join(' ')).replace(/[\s\-–—_]/gu,'');
 return words.every(word=>{const w=word.replace(/[\-–—_]/gu,'');return [w,...(SYNONYMS[w]??[])].some(v=>wordMatches(v,text))});
}
// A run-together Chinese query such as 「櫻花四季鹿」 also matches when it splits into two parts
// that both appear, so it behaves like 「櫻花 四季鹿」.
function wordMatches(word,text){
 if(text.includes(word))return true;
 if(word.length<3||word.length>16||!/\p{Script=Han}/u.test(word))return false;
 for(let i=1;i<word.length;i++)if(text.includes(word.slice(0,i))&&text.includes(word.slice(i)))return true;
 return false;
}
// Everyday alternatives people type for the same event or city.
const SYNONYMS={'世博':['萬博','expo'],'萬博':['世博','expo'],'世界博覽會':['萬博','expo'],'三藩市':['舊金山','sanfrancisco'],'舊金山':['三藩市','sanfrancisco'],'洛杉機':['洛杉磯','losangeles'],'首爾':['seoul','서울'],'漢城':['首爾','seoul']};

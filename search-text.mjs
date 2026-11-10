// Preserve compact searches such as "ShinyPikachu" and let separate words match across fields.
export function normalizeSearchText(value){
 return String(value??'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC').toLowerCase().trim();
}
export function matchesSearchText(fields,query){
 const words=normalizeSearchText(query).split(/\s+/u).filter(Boolean);
 const text=normalizeSearchText(fields.join(' ')).replace(/[\s\-–—_]/gu,'');
 return words.every(word=>wordMatches(word.replace(/[\-–—_]/gu,''),text));
}
// A run-together Chinese query such as 「櫻花四季鹿」 also matches when it splits into two parts
// that both appear, so it behaves like 「櫻花 四季鹿」.
function wordMatches(word,text){
 if(text.includes(word))return true;
 if(word.length<3||word.length>16||!/\p{Script=Han}/u.test(word))return false;
 for(let i=1;i<word.length;i++)if(text.includes(word.slice(0,i))&&text.includes(word.slice(i)))return true;
 return false;
}

// 轉給 Grok 前遮蔽：帳號／密碼／帳密、轉帳末碼、完整銀行帳號、驗證碼、付款連結、email、像帳密的英數字串。
// 規則與 CRM 匯入（PR #25 的 maskText）相同；#25 合併後可改成共用同一支。
export function maskText(s){
 let t=String(s??'');
 if(/帳號|密碼|帳密|password|passwd/i.test(t))t=t.replace(/(?<![\w.@#$%&!*?+=\/-])[A-Za-z][\w.@#$%&!*?+=\/-]{3,}/g,m=>/^(ID|OK|LINE|PTC|https?)$/i.test(m)?m:'[遮蔽]');
 return t
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'[email]')
  .replace(/https?:\/\/\S+/gi,'[連結]')
  .replace(/(?<![\w@])(?:[a-z0-9-]+\.)+(?:com|tw|me|net|io|cc|co|jp|hk|app|link|ly|gl)(?:\.[a-z]{2})?\/\S*/gi,'[連結]')
  .replace(/((?:末|後|尾)\s*[一二三四五六七八九十0-9]{1,2}\s*碼|末碼|尾碼|後碼)[\s:：是為]*([0-9]{2,8})/g,'$1 [數字遮蔽]')
  .replace(/(驗證碼|認證碼|簡訊碼|otp|code|驗證)\s*[:：是為]?\s*[A-Za-z0-9]{3,10}/gi,'$1 [遮蔽]')
  .replace(/(密碼|帳號|帳密|password|passwd|pw|pass|ID)\s*[:：]?[^\n，。,；;]*/gi,'$1 [遮蔽]')
  .replace(/(?<![\w.@#$%&!*?+=\/-])(?=[\w.@#$%&!*?+=\/-]*\d)(?=[\w.@#$%&!*?+=\/-]*[A-Za-z])[\w.@#$%&!*?+=\/-]{6,}/g,'[遮蔽]')
  .replace(/\d[\d\- ]{4,}\d/g,'[數字遮蔽]');
}

// Set only from a contact URL explicitly confirmed by the owner.
export const LINE_CONTACT_URL='https://lin.ee/pdZpa4z';
export function validLineURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['lin.ee','line.me'].includes(u.hostname)&&u.pathname!=='/'?u.href:null}catch{return null}}
export function applyContactLink(link,label=link.dataset.contactLabel,destination=LINE_CONTACT_URL){const url=validLineURL(destination);link.dataset.contactLine='';if(label)link.dataset.contactLabel=label;if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');link.textContent=label||'聯絡 Wu Jacky'}else{link.removeAttribute('href');link.removeAttribute('target');link.removeAttribute('rel');link.setAttribute('aria-disabled','true');link.setAttribute('tabindex','-1');link.textContent='LINE 聯絡資訊更新中'}return link}
export function initContactLinks(){document.querySelectorAll('[data-contact-line]').forEach(link=>applyContactLink(link))}

// The confirmed short link redirects to this same official account.
const LINE_OFFICIAL_ID = '@128wpoft';

export function lineInquiryURL(message) {
 if (!message.trim()) return null;
 try {
  const url = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OFFICIAL_ID)}/?${encodeURIComponent(message)}`;
  // Keep the copy-and-paste path for messages likely to exceed URL limits.
  return url.length <= 2000 ? url : null;
 } catch {
  return null;
 }
}

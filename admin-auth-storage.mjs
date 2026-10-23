// Persist login only on a device the administrator chooses to remember.
export function createAuthStorage(persistent,temporary,remember){
 return {
  getItem(key){return persistent.getItem(key)??temporary.getItem(key)},
  setItem(key,value){const target=remember()?persistent:temporary,other=remember()?temporary:persistent;target.setItem(key,value);other.removeItem(key)},
  removeItem(key){persistent.removeItem(key);temporary.removeItem(key)}
 };
}

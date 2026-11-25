// Prints every public Storage thumbnail path the storefront can show, one per line.
// Used by scripts/sync-thumbnails.py so product images are served from GitHub Pages instead of Supabase.
import {loadPublicCatalog} from '../storefront-service.mjs';
const products=await loadPublicCatalog();
const paths=new Set();
for(const product of products)for(const image of product.images??[]){const path=String(image?.path??'');if(/^[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.(webp|png)$/i.test(path))paths.add(path)}
process.stdout.write([...paths].sort().join('\n')+'\n');

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expectedPages,VERSIONED_ASSETS} from '../scripts/stamp-asset-versions.mjs';

test('every page loads the current content-hash version of the atlas bundle and shared CSS (run npm run build)',()=>{
 for(const [f,html] of expectedPages())assert.equal(readFileSync(new URL('../'+f,import.meta.url),'utf8'),html,`${f} has a stale ?v= — run npm run build`);
 assert.ok(VERSIONED_ASSETS['assets/backgrounds.bundle.js'].includes('backgrounds.html'));
});

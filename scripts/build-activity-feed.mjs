// Derive the compact event feed used by the home page from data/backgrounds.json.
// The atlas builds the same model in the browser, so both pages share one source and one status logic.
import {readFileSync,writeFileSync} from 'node:fs';
import {buildActivityFeed} from '../activity-feed-service.mjs';
const root=new URL('../',import.meta.url);
const data=JSON.parse(readFileSync(new URL('data/backgrounds.json',root),'utf8'));
writeFileSync(new URL('data/activity-feed.json',root),JSON.stringify(buildActivityFeed(data))+'\n');
console.log('activity feed: '+data.records.length+' records → data/activity-feed.json');

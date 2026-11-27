// Single cache-busting URL for the public background catalog; bump this when data/backgrounds.json changes.
export const BACKGROUNDS_DATA_URL='data/backgrounds.json?v=20261127-preview-art-inteleon';
// Generated from data/backgrounds.json by scripts/build-activity-feed.mjs (npm run build); shares its version.
export const ACTIVITY_FEED_URL='data/activity-feed.json?'+BACKGROUNDS_DATA_URL.split('?')[1];
export const BACKGROUND_LOCATIONS_URL='data/background-locations.json?v=20261123-prototype';
export const WORLD_LAND_URL='data/world-land.json?v=20261123-natural-earth';

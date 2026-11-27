MELBOURNE WEATHER MONITOR
=========================

This dashboard is designed to run as a Cloudflare Worker with static assets
and supports older Safari versions, including iOS 9.3.6.

WEATHER SOURCES
---------------

- Melbourne (Olympic Park): Bureau of Meteorology (BOM). The Worker retrieves
  the live station observation, BOM daily observations, and the Victorian
  précis forecast feed.
- Additional saved locations: Open-Meteo.
- City search: Open-Meteo geocoding.

The dashboard refreshes hourly while it is open. The 15-day chart shows seven
past days, today, and seven future days. BOM does not publish every chart
measurement for every day; unavailable BOM values are left blank rather than
filled from another provider.

DEPLOYMENT
----------

The active dashboard is public/index.html and the API routes are in
src/index.js. Deploy the repository through the existing Cloudflare Workers
& Pages Git integration. Keep wrangler.jsonc at the repository root.

The root-level index.html is a legacy standalone copy and is not the active
Cloudflare asset.

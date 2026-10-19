# ThymeToEat

End dinner indecision — pick a home recipe or a nearby restaurant.

## Features

- **Cook at Home** — weighted recipe picks with favorites, dislikes, cooking log, and serving scaler.
- **Nearby Restaurants** — discover restaurants, cafes, fast food, and food courts near you using free public APIs (no API keys), optimized for faster loads.

## Free public APIs used

| Purpose | API | Cost / key | CORS |
| --- | --- | --- | --- |
| Nearby food places | [OpenStreetMap Overpass](https://overpass-api.de/) mirrors (`overpass-api.de`, `lz4.overpass-api.de`, `overpass.kumi.systems`) | Free, no key | Browser-friendly |
| IP location fallback | [GeoJS](https://www.geojs.io/) | Free, no key | Browser-friendly |
| Precise location | Browser Geolocation API | N/A | N/A |

Place data is © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

### Speed optimizations

- Prefetch location when switching to **Nearby Restaurants**
- Race device GPS vs IP geolocation (first usable fix wins; soft 1.2s GPS preference)
- Race multiple Overpass mirrors in parallel with 2-minute client timeouts (free mirrors can be busy)
- Lean Overpass query (`node` + `out tags`, 120s server timeout, default 1 km radius)
- 5-minute in-memory result cache for repeated searches

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Project layout

- `index.html` — UI shell (Tailwind CDN)
- `app.js` — recipe engine + nearby restaurant integration
- `recipes.json` — local recipe dataset

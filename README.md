# ThymeToEat

End dinner indecision — pick a home recipe or a nearby restaurant.

## Features

- **Cook at Home** — filter prestored recipes by cuisine, protein, style, difficulty, and mood.
- **Nearby Restaurants** — discover restaurants, cafes, fast food, and food courts near you using free public APIs (no API keys).

## Free public APIs used

| Purpose | API | Cost / key | CORS |
| --- | --- | --- | --- |
| Nearby food places | [OpenStreetMap Overpass API](https://overpass-api.de/) (`overpass-api.de`, `lz4.overpass-api.de`) | Free, no key | Browser-friendly |
| IP location fallback | [GeoJS](https://www.geojs.io/) (`get.geojs.io/v1/ip/geo.json`) | Free, no key | Browser-friendly |
| Precise location | Browser [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) | N/A | N/A |

Place data is © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

### Why Overpass?

Commercial restaurant APIs (Google Places, Yelp, Foursquare) require paid keys and are not ideal for a static front-end demo. Overpass exposes OSM POIs (`amenity=restaurant|fast_food|cafe|food_court`) with radius search, works from the browser without a backend proxy, and needs no registration.

## Run locally

Serve the folder over HTTP (required for `fetch` and geolocation):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Or use any static file server / VS Code Live Server.

## Project layout

- `index.html` — UI shell (Tailwind CDN)
- `app.js` — recipe matcher + nearby restaurant integration
- `recipes.json` — local recipe dataset

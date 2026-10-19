/**
 * ThymeToEat - Application Logic
 *
 * Home recipes: local recipes.json
 * Nearby restaurants: free OpenStreetMap Overpass API (CORS-friendly, no API key)
 * Location fallback: GeoJS IP geolocation (free, CORS-friendly, no API key)
 */

let recipes = [];
let activeTab = 'ingredients';
/** @type {'recipes' | 'restaurants'} */
let appMode = 'recipes';
let userLocation = null; // { lat, lon, source }
let lastRestaurants = [];

// Free public APIs (no keys required; CORS-enabled for browser use)
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter'
];
const GEOJS_URL = 'https://get.geojs.io/v1/ip/geo.json';

// Map app cuisine filters to OpenStreetMap cuisine tag keywords
const CUISINE_KEYWORD_MAP = {
    Asian: ['asian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'indian', 'sushi', 'ramen', 'noodle', 'malaysian', 'indonesian', 'filipino', 'taiwanese'],
    Western: ['american', 'burger', 'steak', 'bbq', 'barbecue', 'british', 'french', 'german', 'italian', 'pizza', 'european', 'diner', 'western'],
    Mediterranean: ['mediterranean', 'greek', 'turkish', 'lebanese', 'middle_eastern', 'falafel', 'kebab', 'spanish', 'portuguese', 'moroccan'],
    Mexican: ['mexican', 'tex-mex', 'taco', 'burrito', 'latin', 'latin_american']
};

// DOM Controls
const cuisineSelect = document.getElementById('cuisineSelect');
const proteinSelect = document.getElementById('proteinSelect');
const styleSelect = document.getElementById('styleSelect');
const difficultySelect = document.getElementById('difficultySelect');
const moodSelect = document.getElementById('moodSelect');
const placeTypeSelect = document.getElementById('placeTypeSelect');
const radiusSelect = document.getElementById('radiusSelect');
const findMealBtn = document.getElementById('findMealBtn');
const surpriseBtn = document.getElementById('surpriseBtn');
const resultContainer = document.getElementById('resultContainer');
const modeRecipesBtn = document.getElementById('modeRecipesBtn');
const modeRestaurantsBtn = document.getElementById('modeRestaurantsBtn');
const controlsSubtitle = document.getElementById('controlsSubtitle');
const findMealBtnLabel = document.getElementById('findMealBtnLabel');
const surpriseBtnLabel = document.getElementById('surpriseBtnLabel');
const locationStatusText = document.getElementById('locationStatusText');

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Allow only safe http(s) URLs for external links from OSM tags. */
function safeHttpUrl(value) {
    if (!value) return '';
    const trimmed = String(value).trim();
    try {
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const url = new URL(withProtocol);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return url.href;
    } catch {
        return '';
    }
}

function setLocationStatus(message, isError = false) {
    if (!locationStatusText) return;
    locationStatusText.textContent = message;
    locationStatusText.parentElement.classList.toggle('border-red-200', isError);
    locationStatusText.parentElement.classList.toggle('bg-red-50', isError);
    locationStatusText.parentElement.classList.toggle('text-red-700', isError);
}

function setLoading(isLoading, label = 'Searching…') {
    findMealBtn.disabled = isLoading;
    surpriseBtn.disabled = isLoading;
    findMealBtn.classList.toggle('opacity-70', isLoading);
    surpriseBtn.classList.toggle('opacity-70', isLoading);
    if (isLoading) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-4xl mb-3"><i class="fa-solid fa-spinner fa-spin text-brand-500"></i></div>
                <h3 class="text-lg font-bold text-slate-800 mb-1">${escapeHtml(label)}</h3>
                <p class="text-sm text-slate-500">Fetching places from OpenStreetMap…</p>
            </div>
        `;
    }
}

// ── Mode switching ──────────────────────────────────────────────────────────

function setMode(mode) {
    appMode = mode;
    const isRecipes = mode === 'recipes';

    document.querySelectorAll('.recipe-only-filter').forEach(el => {
        el.classList.toggle('hidden', !isRecipes);
    });
    document.querySelectorAll('.restaurant-only-filter').forEach(el => {
        el.classList.toggle('hidden', isRecipes);
    });

    const activeClasses = 'mode-btn flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-semibold text-sm transition-all cursor-pointer bg-brand-600 text-white shadow-md shadow-brand-500/20';
    const idleClasses = 'mode-btn flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-semibold text-sm transition-all cursor-pointer bg-transparent text-slate-600 hover:bg-slate-50';

    modeRecipesBtn.className = isRecipes ? activeClasses : idleClasses;
    modeRestaurantsBtn.className = isRecipes ? idleClasses : activeClasses;
    modeRecipesBtn.setAttribute('aria-selected', String(isRecipes));
    modeRestaurantsBtn.setAttribute('aria-selected', String(!isRecipes));

    if (isRecipes) {
        controlsSubtitle.textContent = 'Set your preferences or leave any as "Any" for wildcards.';
        findMealBtnLabel.textContent = 'Find Me a Meal';
        surpriseBtnLabel.textContent = 'Surprise Me!';
        if (recipes.length > 0) {
            renderCard({ recipe: getRandomItem(recipes), isFallback: false, matchedTraits: [] });
        }
    } else {
        controlsSubtitle.textContent = 'Find free OpenStreetMap restaurant data near you — no API key required.';
        findMealBtnLabel.textContent = 'Find Nearby Places';
        surpriseBtnLabel.textContent = 'Surprise Pick';
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-5xl mb-4">📍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Hungry to go out?</h3>
                <p class="text-slate-500 max-w-md mx-auto">
                    We'll use your location (or an approximate IP location) and query the free
                    <strong>OpenStreetMap Overpass API</strong> for restaurants, cafes, and fast food nearby.
                </p>
            </div>
        `;
    }
}

// ── Recipes (existing) ──────────────────────────────────────────────────────

async function loadRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        recipes = await response.json();

        if (appMode === 'recipes' && recipes.length > 0) {
            renderCard({ recipe: getRandomItem(recipes), isFallback: false, matchedTraits: [] });
        }
    } catch (error) {
        console.error('Error fetching recipes.json:', error);
        if (appMode === 'recipes') {
            resultContainer.innerHTML = `
                <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center">
                    <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                    <p class="font-bold">Failed to load recipes dataset.</p>
                    <p class="text-xs mt-1">Make sure you are running a local server (e.g., Live Server) when serving files dynamically via fetch().</p>
                </div>
            `;
        }
    }
}

function findMeal(forceRandom = false) {
    if (forceRandom) {
        cuisineSelect.value = 'Any';
        proteinSelect.value = 'Any';
        styleSelect.value = 'Any';
        difficultySelect.value = 'Any';
        moodSelect.value = 'Any';

        return {
            recipe: getRandomItem(recipes),
            isFallback: false,
            matchedTraits: []
        };
    }

    const filters = {
        cuisine: cuisineSelect.value,
        protein: proteinSelect.value,
        baseStyle: styleSelect.value,
        difficulty: difficultySelect.value,
        mood: moodSelect.value
    };

    const activeFilters = Object.entries(filters).filter(([_, val]) => val !== 'Any');
    const totalActiveCriteria = activeFilters.length;

    const scoredRecipes = recipes.map(recipe => {
        let score = 0;
        const matchedTraits = [];

        activeFilters.forEach(([key, val]) => {
            if (recipe[key] === val) {
                score++;
                matchedTraits.push(val);
            }
        });

        return { recipe, score, matchedTraits };
    });

    const exactMatches = scoredRecipes.filter(item => item.score === totalActiveCriteria);

    if (exactMatches.length > 0) {
        const selectedMatch = getRandomItem(exactMatches);
        return {
            recipe: selectedMatch.recipe,
            isFallback: false,
            matchedTraits: []
        };
    }

    const sortedCandidates = scoredRecipes.sort((a, b) => b.score - a.score);
    const highestScore = sortedCandidates[0]?.score || 0;

    if (highestScore > 0) {
        const topCandidates = sortedCandidates.filter(item => item.score === highestScore);
        const selectedFallback = getRandomItem(topCandidates);

        return {
            recipe: selectedFallback.recipe,
            isFallback: true,
            matchedTraits: selectedFallback.matchedTraits
        };
    }

    return { recipe: null, isFallback: false, matchedTraits: [] };
}

function getDifficultyBadgeClass(difficulty) {
    switch (difficulty) {
        case 'Easy':
            return 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30';
        case 'Medium':
            return 'bg-amber-500/20 text-amber-100 border-amber-400/30';
        case 'Hard':
            return 'bg-rose-500/20 text-rose-100 border-rose-400/30';
        default:
            return 'bg-slate-500/20 text-slate-100 border-slate-400/30';
    }
}

function renderCard({ recipe, isFallback, matchedTraits }) {
    if (!recipe) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-5xl mb-4">🔍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">No match found</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-6">We couldn't find a close match for your selection combination. Try broadening your criteria!</p>
                <button id="noMatchSurpriseBtn" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all cursor-pointer">
                    Surprise Me Instead
                </button>
            </div>
        `;
        document.getElementById('noMatchSurpriseBtn').addEventListener('click', () => {
            renderCard(findMeal(true));
        });
        return;
    }

    const matchedTraitsText = matchedTraits.join(', ');

    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 animate-pop-in">
            
            ${isFallback ? `
                <!-- Fallback Banner -->
                <div class="bg-amber-500 text-slate-900 px-6 py-3 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-amber-600/20">
                    <div class="flex items-center gap-2 text-center sm:text-left">
                        <i class="fa-solid fa-circle-info text-slate-900"></i>
                        <span>No exact 5/5 match found, but here is a close match based on <strong>${escapeHtml(matchedTraitsText)}</strong>!</span>
                    </div>
                    <button id="fallbackSurpriseBtn" class="underline text-slate-900 hover:text-slate-800 font-bold whitespace-nowrap cursor-pointer">
                        Surprise Me Instead
                    </button>
                </div>
            ` : ''}

            <!-- Card Banner -->
            <div class="bg-gradient-to-r from-emerald-600 via-brand-600 to-teal-700 p-6 sm:p-8 text-white relative">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-center space-x-4">
                        <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shadow-inner shrink-0">
                            ${escapeHtml(recipe.emoji)}
                        </div>
                        <div>
                            <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">${escapeHtml(recipe.name)}</h2>
                            <p class="text-brand-100 text-sm mt-1 flex items-center gap-2">
                                <span><i class="fa-regular fa-clock"></i> ${escapeHtml(recipe.prepTime)}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Recipe Meta Tag Pills -->
                <div class="flex flex-wrap gap-2 mt-6">
                    <span class="px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyBadgeClass(recipe.difficulty)}">
                        ⚡ ${escapeHtml(recipe.difficulty)}
                    </span>
                    <span class="px-3 py-1 bg-indigo-500/20 text-indigo-100 font-semibold text-xs rounded-full border border-indigo-400/30">
                        ✨ ${escapeHtml(recipe.mood)}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🌍 ${escapeHtml(recipe.cuisine)}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🥩 ${escapeHtml(recipe.protein)}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🍽️ ${escapeHtml(recipe.baseStyle)}
                    </span>
                </div>
            </div>

            <!-- Recipe Description & Tabs -->
            <div class="p-6 sm:p-8">
                <p class="text-slate-600 leading-relaxed mb-6 font-normal">${escapeHtml(recipe.description)}</p>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 mb-6">
                    <button id="tabIngredientsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'ingredients' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} transition-all cursor-pointer">
                        <i class="fa-solid fa-basket-shopping mr-2"></i> Ingredients
                    </button>
                    <button id="tabInstructionsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'instructions' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} transition-all cursor-pointer">
                        <i class="fa-solid fa-list-check mr-2"></i> Preparation Steps
                    </button>
                </div>

                <!-- Interactive Ingredients List Panel -->
                <div id="ingredientsPanel" class="${activeTab === 'ingredients' ? 'block' : 'hidden'} space-y-3">
                    <div class="flex justify-between items-center mb-1 px-1">
                        <span class="text-xs text-slate-400 font-medium">Click ingredients to check off as you prep</span>
                        <button id="resetIngredientsBtn" class="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 cursor-pointer transition-colors">
                            <i class="fa-solid fa-arrow-rotate-left text-[10px]"></i> Reset Checklist
                        </button>
                    </div>
                    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        ${recipe.ingredients.map((ing, idx) => `
                            <li id="ing-item-${idx}" onclick="toggleIngredient(${idx})" class="ingredient-row flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs sm:text-sm text-slate-700 font-medium transition-all duration-200 cursor-pointer select-none border border-slate-200/50">
                                <input type="checkbox" id="ing-check-${idx}" class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer pointer-events-none transition-transform" onclick="event.stopPropagation()">
                                <span id="ing-text-${idx}" class="transition-all duration-200">${escapeHtml(ing)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <!-- Interactive Cooking Progress Panel -->
                <div id="instructionsPanel" class="${activeTab === 'instructions' ? 'block' : 'hidden'}">
                    <div class="mb-3 px-1">
                        <span class="text-xs text-slate-400 font-medium">Click a step to toggle its completion state</span>
                    </div>
                    <ol class="space-y-3">
                        ${recipe.instructions.map((step, idx) => `
                            <li id="step-item-${idx}" onclick="toggleStep(${idx})" class="step-row flex gap-4 p-3.5 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 transition-all duration-200 cursor-pointer select-none group">
                                <span id="step-badge-${idx}" class="flex-shrink-0 w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs transition-colors group-hover:scale-105">
                                    ${idx + 1}
                                </span>
                                <p id="step-text-${idx}" class="text-xs sm:text-sm text-slate-700 leading-relaxed pt-0.5 transition-all duration-200">
                                    ${escapeHtml(step)}
                                </p>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `;

    document.getElementById('tabIngredientsBtn').addEventListener('click', () => switchTab('ingredients'));
    document.getElementById('tabInstructionsBtn').addEventListener('click', () => switchTab('instructions'));
    document.getElementById('resetIngredientsBtn').addEventListener('click', resetIngredients);

    if (isFallback) {
        document.getElementById('fallbackSurpriseBtn').addEventListener('click', () => {
            renderCard(findMeal(true));
        });
    }
}

function toggleIngredient(index) {
    const row = document.getElementById(`ing-item-${index}`);
    const checkbox = document.getElementById(`ing-check-${index}`);
    const text = document.getElementById(`ing-text-${index}`);

    if (!checkbox || !text || !row) return;

    checkbox.checked = !checkbox.checked;

    if (checkbox.checked) {
        text.classList.add('line-through', 'text-slate-400');
        row.classList.add('opacity-50', 'bg-slate-100/60');
    } else {
        text.classList.remove('line-through', 'text-slate-400');
        row.classList.remove('opacity-50', 'bg-slate-100/60');
    }
}

function resetIngredients() {
    const checkboxes = document.querySelectorAll('[id^="ing-check-"]');
    checkboxes.forEach((cb, idx) => {
        if (cb.checked) {
            toggleIngredient(idx);
        }
    });
}

function toggleStep(index) {
    const row = document.getElementById(`step-item-${index}`);
    const badge = document.getElementById(`step-badge-${index}`);
    const text = document.getElementById(`step-text-${index}`);

    if (!row || !badge || !text) return;

    const isCompleted = row.classList.contains('bg-slate-100/70');

    if (!isCompleted) {
        row.classList.add('bg-slate-100/70', 'opacity-60', 'border-slate-300');
        text.classList.add('line-through', 'text-slate-400');
        badge.className = "flex-shrink-0 w-7 h-7 bg-slate-200 text-slate-500 font-bold rounded-full flex items-center justify-center text-xs transition-colors";
    } else {
        row.classList.remove('bg-slate-100/70', 'opacity-60', 'border-slate-300');
        text.classList.remove('line-through', 'text-slate-400');
        badge.className = "flex-shrink-0 w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs transition-colors";
    }
}

function switchTab(tabName) {
    activeTab = tabName;
    const ingredientsPanel = document.getElementById('ingredientsPanel');
    const instructionsPanel = document.getElementById('instructionsPanel');
    const tabIngredientsBtn = document.getElementById('tabIngredientsBtn');
    const tabInstructionsBtn = document.getElementById('tabInstructionsBtn');

    if (!ingredientsPanel || !instructionsPanel) return;

    if (tabName === 'ingredients') {
        ingredientsPanel.classList.remove('hidden');
        instructionsPanel.classList.add('hidden');

        tabIngredientsBtn.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 transition-all cursor-pointer";
        tabInstructionsBtn.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all cursor-pointer";
    } else {
        ingredientsPanel.classList.add('hidden');
        instructionsPanel.classList.remove('hidden');

        tabIngredientsBtn.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all cursor-pointer";
        tabInstructionsBtn.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 transition-all cursor-pointer";
    }
}

// ── Nearby restaurants (OpenStreetMap Overpass) ─────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
}

function getBrowserPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'device' }),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    });
}

async function getIpFallbackPosition() {
    const response = await fetch(GEOJS_URL);
    if (!response.ok) throw new Error(`GeoJS HTTP ${response.status}`);
    const data = await response.json();
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
        throw new Error('GeoJS returned invalid coordinates.');
    }
    const place = [data.city, data.region, data.country].filter(Boolean).join(', ');
    return { lat, lon, source: 'ip', label: place || 'approximate IP location' };
}

async function resolveUserLocation(forceRefresh = false) {
    if (userLocation && !forceRefresh) return userLocation;

    try {
        userLocation = await getBrowserPosition();
        setLocationStatus(
            `Using precise device location (${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}). Data © OpenStreetMap contributors via Overpass.`
        );
        return userLocation;
    } catch (geoError) {
        console.warn('Device geolocation unavailable, falling back to IP:', geoError);
        try {
            userLocation = await getIpFallbackPosition();
            setLocationStatus(
                `Device location unavailable — using approximate IP location${userLocation.label ? ` (${userLocation.label})` : ''}. Allow location access for better results.`
            );
            return userLocation;
        } catch (ipError) {
            console.error('IP geolocation failed:', ipError);
            setLocationStatus('Could not determine your location. Please allow location access and try again.', true);
            throw new Error('Unable to determine location from device or IP fallback.');
        }
    }
}

function buildOverpassQuery(lat, lon, radiusMeters, placeType) {
    const amenityFilter =
        placeType && placeType !== 'Any'
            ? `["amenity"="${placeType}"]`
            : '["amenity"~"restaurant|fast_food|cafe|food_court"]';

    return `
[out:json][timeout:25];
(
  node${amenityFilter}(around:${radiusMeters},${lat},${lon});
  way${amenityFilter}(around:${radiusMeters},${lat},${lon});
);
out body center 40;
`.trim();
}

async function fetchOverpass(query) {
    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: `data=${encodeURIComponent(query)}`
            });
            if (!response.ok) {
                lastError = new Error(`Overpass HTTP ${response.status} at ${endpoint}`);
                continue;
            }
            return await response.json();
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('All Overpass endpoints failed.');
}

function titleCaseAmenity(amenity) {
    return String(amenity || 'place')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function placeEmoji(amenity) {
    switch (amenity) {
        case 'cafe':
            return '☕';
        case 'fast_food':
            return '🍔';
        case 'food_court':
            return '🥡';
        case 'restaurant':
        default:
            return '🍽️';
    }
}

function normalizePlace(element, origin) {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat == null || lon == null || !tags.name) return null;

    const distanceKm = haversineKm(origin.lat, origin.lon, lat, lon);
    const addressParts = [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city'] || tags['addr:suburb']
    ].filter(Boolean);

    return {
        id: `${element.type}/${element.id}`,
        name: tags.name,
        amenity: tags.amenity || 'restaurant',
        cuisine: tags.cuisine || '',
        cuisineDisplay: tags.cuisine
            ? tags.cuisine.split(';').map((c) => c.trim().replace(/_/g, ' ')).join(', ')
            : 'Cuisine not listed',
        phone: tags.phone || tags['contact:phone'] || '',
        website: safeHttpUrl(tags.website || tags['contact:website'] || ''),
        openingHours: tags.opening_hours || '',
        address: addressParts.join(' ') || tags['addr:full'] || '',
        lat,
        lon,
        distanceKm,
        distanceLabel: formatDistance(distanceKm),
        emoji: placeEmoji(tags.amenity),
        mapsUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
    };
}

function matchesCuisineFilter(place, cuisineFilter) {
    if (!cuisineFilter || cuisineFilter === 'Any') return true;
    const keywords = CUISINE_KEYWORD_MAP[cuisineFilter] || [cuisineFilter.toLowerCase()];
    const haystack = `${place.cuisine} ${place.name}`.toLowerCase();
    return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

async function searchNearbyRestaurants({ surprise = false } = {}) {
    setLoading(true, surprise ? 'Picking a surprise spot…' : 'Finding nearby places…');

    try {
        const location = await resolveUserLocation(false);
        const radius = Number(radiusSelect.value) || 2000;
        const placeType = surprise ? 'Any' : placeTypeSelect.value;
        const cuisineFilter = surprise ? 'Any' : cuisineSelect.value;

        if (surprise) {
            cuisineSelect.value = 'Any';
            placeTypeSelect.value = 'Any';
        }

        const query = buildOverpassQuery(location.lat, location.lon, radius, placeType);
        const data = await fetchOverpass(query);
        const elements = Array.isArray(data.elements) ? data.elements : [];

        let places = elements
            .map((el) => normalizePlace(el, location))
            .filter(Boolean)
            .filter((p) => matchesCuisineFilter(p, cuisineFilter));

        const seen = new Set();
        places = places.filter((p) => {
            const key = `${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        places.sort((a, b) => a.distanceKm - b.distanceKm);
        lastRestaurants = places;

        if (places.length === 0) {
            renderRestaurantEmpty({ cuisineFilter, radius, placeType });
            return;
        }

        if (surprise) {
            renderRestaurantFocus(getRandomItem(places), places);
        } else {
            renderRestaurantList(places);
        }
    } catch (error) {
        console.error('Nearby restaurant search failed:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center animate-pop-in">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Couldn't load nearby restaurants.</p>
                <p class="text-xs mt-2 max-w-md mx-auto">${escapeHtml(error.message || 'Unknown error')}</p>
                <p class="text-xs mt-2 text-red-600/80">The free Overpass API can be busy — try again in a moment, or check your network / location permissions.</p>
            </div>
        `;
    } finally {
        setLoading(false);
    }
}

function renderRestaurantEmpty({ cuisineFilter, radius, placeType }) {
    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
            <div class="text-5xl mb-4">🗺️</div>
            <h3 class="text-xl font-bold text-slate-800 mb-2">No places found nearby</h3>
            <p class="text-slate-500 max-w-md mx-auto mb-6">
                Nothing matched within ${escapeHtml(String(radius))} m
                ${placeType && placeType !== 'Any' ? ` for <strong>${escapeHtml(titleCaseAmenity(placeType))}</strong>` : ''}
                ${cuisineFilter && cuisineFilter !== 'Any' ? ` with cuisine filter <strong>${escapeHtml(cuisineFilter)}</strong>` : ''}.
                Try a larger radius or set cuisine to Any.
            </p>
            <button id="retryWiderBtn" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all cursor-pointer">
                Expand to 5 km &amp; retry
            </button>
        </div>
    `;
    document.getElementById('retryWiderBtn').addEventListener('click', () => {
        radiusSelect.value = '5000';
        cuisineSelect.value = 'Any';
        placeTypeSelect.value = 'Any';
        searchNearbyRestaurants({ surprise: false });
    });
}

function restaurantCardHtml(place, { featured = false } = {}) {
    const typeLabel = titleCaseAmenity(place.amenity);
    return `
        <article class="bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100 ${featured ? 'animate-pop-in' : ''}">
            <div class="bg-gradient-to-r from-teal-600 via-brand-600 to-emerald-700 p-5 sm:p-6 text-white">
                <div class="flex items-start gap-4">
                    <div class="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-3xl shrink-0">${escapeHtml(place.emoji)}</div>
                    <div class="min-w-0 flex-1">
                        <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight truncate">${escapeHtml(place.name)}</h3>
                        <p class="text-brand-100 text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span><i class="fa-solid fa-person-walking mr-1"></i>${escapeHtml(place.distanceLabel)} away</span>
                            <span><i class="fa-solid fa-store mr-1"></i>${escapeHtml(typeLabel)}</span>
                        </p>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🌍 ${escapeHtml(place.cuisineDisplay)}
                    </span>
                    ${place.openingHours ? `
                        <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                            🕒 ${escapeHtml(place.openingHours)}
                        </span>
                    ` : ''}
                </div>
            </div>
            <div class="p-5 sm:p-6 space-y-3">
                ${place.address ? `
                    <p class="text-sm text-slate-600 flex items-start gap-2">
                        <i class="fa-solid fa-map-pin text-brand-500 mt-0.5"></i>
                        <span>${escapeHtml(place.address)}</span>
                    </p>
                ` : ''}
                <div class="flex flex-wrap gap-2 pt-1">
                    <a href="${escapeHtml(place.mapsUrl)}" target="_blank" rel="noopener noreferrer"
                        class="inline-flex items-center gap-2 text-sm font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 px-3 py-2 rounded-xl transition-colors">
                        <i class="fa-solid fa-map-location-dot"></i> Open in OSM
                    </a>
                    ${place.website ? `
                        <a href="${escapeHtml(place.website)}" target="_blank" rel="noopener noreferrer"
                            class="inline-flex items-center gap-2 text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-colors">
                            <i class="fa-solid fa-globe"></i> Website
                        </a>
                    ` : ''}
                    ${place.phone ? `
                        <a href="tel:${escapeHtml(place.phone)}"
                            class="inline-flex items-center gap-2 text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-colors">
                            <i class="fa-solid fa-phone"></i> ${escapeHtml(place.phone)}
                        </a>
                    ` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderRestaurantList(places) {
    const top = places.slice(0, 12);
    resultContainer.innerHTML = `
        <div class="space-y-4 animate-pop-in">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h3 class="text-lg font-bold text-slate-900">
                        <i class="fa-solid fa-store text-brand-500 mr-1"></i>
                        ${top.length} place${top.length === 1 ? '' : 's'} nearby
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5">Sorted by distance · OpenStreetMap / Overpass (free, no API key)</p>
                </div>
                <button id="restaurantSurpriseBtn" class="text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 px-4 py-2 rounded-xl cursor-pointer transition-colors">
                    <i class="fa-solid fa-dice mr-1"></i> Surprise pick from results
                </button>
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${top.map((p) => restaurantCardHtml(p)).join('')}
            </div>
        </div>
    `;
    document.getElementById('restaurantSurpriseBtn')?.addEventListener('click', () => {
        if (lastRestaurants.length) {
            renderRestaurantFocus(getRandomItem(lastRestaurants), lastRestaurants);
        }
    });
}

function renderRestaurantFocus(place, allPlaces) {
    resultContainer.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-slate-600">
                    <i class="fa-solid fa-sparkles text-brand-500 mr-1"></i> Tonight's pick
                </p>
                <button id="backToListBtn" class="text-xs font-semibold text-slate-500 hover:text-slate-700 underline cursor-pointer">
                    Back to all ${allPlaces.length} results
                </button>
            </div>
            ${restaurantCardHtml(place, { featured: true })}
            <div class="flex justify-center">
                <button id="anotherSurpriseBtn" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-5 rounded-xl cursor-pointer transition-all text-sm">
                    <i class="fa-solid fa-dice text-brand-600 mr-1"></i> Another surprise
                </button>
            </div>
        </div>
    `;
    document.getElementById('backToListBtn')?.addEventListener('click', () => renderRestaurantList(allPlaces));
    document.getElementById('anotherSurpriseBtn')?.addEventListener('click', () => {
        renderRestaurantFocus(getRandomItem(allPlaces), allPlaces);
    });
}

// ── Event listeners ─────────────────────────────────────────────────────────

modeRecipesBtn.addEventListener('click', () => setMode('recipes'));
modeRestaurantsBtn.addEventListener('click', () => setMode('restaurants'));

findMealBtn.addEventListener('click', () => {
    if (appMode === 'restaurants') {
        searchNearbyRestaurants({ surprise: false });
    } else {
        renderCard(findMeal(false));
    }
});

surpriseBtn.addEventListener('click', () => {
    if (appMode === 'restaurants') {
        searchNearbyRestaurants({ surprise: true });
    } else {
        renderCard(findMeal(true));
    }
});

// Expose checklist helpers for inline onclick handlers in recipe cards
window.toggleIngredient = toggleIngredient;
window.toggleStep = toggleStep;

// App Startup
document.addEventListener('DOMContentLoaded', () => {
    setMode('recipes');
    loadRecipes();
});

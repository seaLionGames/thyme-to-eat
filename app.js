/**
 * ThymeToEat - Application Logic & Point-Based Weighted Randomization Engine
 *
 * Nearby restaurants: free OpenStreetMap Overpass mirrors (CORS, no API key)
 * Location: browser geolocation raced with GeoJS IP fallback
 */

let recipes = [];
let activeTab = 'ingredients';
let currentServings = 2; // Default serving size
const BASE_SERVINGS = 2; // Baseline reference serving size

// LocalStorage Keys
const FAVORITES_KEY = 'thymetoeat_favorites';
const HISTORY_KEY = 'thymetoeat_history';
const DISLIKED_KEY = 'thymetoeat_disliked';

// State Management
let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
let cookingHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
let dislikedRecipes = JSON.parse(localStorage.getItem(DISLIKED_KEY)) || [];

/** @type {'recipes' | 'restaurants'} */
let appMode = 'recipes';
let userLocation = null;
let locationPromise = null;
let lastRestaurants = [];
const restaurantCache = new Map();
const RESTAURANT_CACHE_TTL_MS = 5 * 60 * 1000;

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];
const GEOJS_URL = 'https://get.geojs.io/v1/ip/geo.json';
const GEO_TIMEOUT_MS = 3500;
const OVERPASS_TIMEOUT_MS = 2 * 60 * 1000; // free mirrors can be slow/busy
const IP_TIMEOUT_MS = 2500;

const CUISINE_KEYWORD_MAP = {
    Asian: ['asian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'indian', 'sushi', 'ramen', 'noodle', 'malaysian', 'indonesian', 'filipino', 'taiwanese'],
    Western: ['american', 'burger', 'steak', 'bbq', 'barbecue', 'british', 'french', 'german', 'italian', 'pizza', 'european', 'diner', 'western'],
    Mediterranean: ['mediterranean', 'greek', 'turkish', 'lebanese', 'middle_eastern', 'falafel', 'kebab', 'spanish', 'portuguese', 'moroccan'],
    Mexican: ['mexican', 'tex-mex', 'taco', 'burrito', 'latin', 'latin_american']
};

// DOM Controls
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const courseSelect = document.getElementById('courseSelect');
const cuisineSelect = document.getElementById('cuisineSelect');
const proteinSelect = document.getElementById('proteinSelect');
const styleSelect = document.getElementById('styleSelect');
const difficultySelect = document.getElementById('difficultySelect');
const moodSelect = document.getElementById('moodSelect');

const findMealBtn = document.getElementById('findMealBtn');
const searchAllMatchesBtn = document.getElementById('searchAllMatchesBtn');
const surpriseBtn = document.getElementById('surpriseBtn');
const findMealIcon = document.getElementById('findMealIcon');
const searchAllIcon = document.getElementById('searchAllIcon');
const surpriseIcon = document.getElementById('surpriseIcon');
const findMealBtnLabel = document.getElementById('findMealBtnLabel');
const surpriseBtnLabel = document.getElementById('surpriseBtnLabel');
const resultContainer = document.getElementById('resultContainer');
const modeRecipesBtn = document.getElementById('modeRecipesBtn');
const modeRestaurantsBtn = document.getElementById('modeRestaurantsBtn');
const controlsSubtitle = document.getElementById('controlsSubtitle');
const placeTypeSelect = document.getElementById('placeTypeSelect');
const radiusSelect = document.getElementById('radiusSelect');
const locationStatusText = document.getElementById('locationStatusText');

// Inline Customization Controls
const toggleInlineFiltersBtn = document.getElementById('toggleInlineFiltersBtn');
const expandedFiltersPanel = document.getElementById('expandedFiltersPanel');
const chevronIcon = document.getElementById('chevronIcon');

// Drawer Elements
const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
const viewDislikesBtn = document.getElementById('viewDislikesBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const starredCount = document.getElementById('starredCount');
const dislikedCount = document.getElementById('dislikedCount');
const historyCount = document.getElementById('historyCount');

const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const drawerTitle = document.getElementById('drawerTitle');
const drawerContent = document.getElementById('drawerContent');
const drawerFooter = document.getElementById('drawerFooter');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const toastContainer = document.getElementById('toastContainer');

/**
 * Floating Toast Notification System (Top-Right Screen Overlay)
 * Displays toasts with an auto 3-second fade-out.
 */
function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    
    let badgeBg = 'bg-slate-900/95 text-white border-slate-700/80';
    let icon = 'fa-circle-info text-brand-400';

    if (type === 'success') {
        badgeBg = 'bg-slate-900/95 text-white border-emerald-500/50';
        icon = 'fa-circle-check text-emerald-400';
    } else if (type === 'amber') {
        badgeBg = 'bg-slate-900/95 text-white border-amber-500/50';
        icon = 'fa-star text-amber-400';
    } else if (type === 'rose') {
        badgeBg = 'bg-slate-900/95 text-white border-rose-500/50';
        icon = 'fa-thumbs-down text-rose-400';
    }

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md text-xs sm:text-sm font-semibold animate-toast-in ${badgeBg}`;
    toast.innerHTML = `
        <i class="fa-solid ${icon} text-base shrink-0"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('animate-toast-in');
        toast.classList.add('animate-toast-out');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}

/**
 * Point-Based Weight Calculation Engine
 * - Base Weight: 10 pts
 * - Direct Starred: +15 pts
 * - Shared Trait with Starred: +5 pts
 * - Cooked History: +5 pts
 * - Dislike Penalty: -8 pts (Minimum weight floor of 1)
 */
function calculateRecipeWeight(recipe) {
    let weight = 10;

    const isDirectlyStarred = favorites.includes(recipe.id);
    if (isDirectlyStarred) weight += 15;

    const starredRecipes = recipes.filter(r => favorites.includes(r.id));
    const sharesTrait = starredRecipes.some(starred => 
        starred.id !== recipe.id && (
            starred.cuisine === recipe.cuisine ||
            starred.course === recipe.course ||
            starred.baseStyle === recipe.baseStyle
        )
    );
    if (sharesTrait) weight += 5;

    const hasBeenCooked = cookingHistory.some(log => log.recipeId === recipe.id);
    if (hasBeenCooked) weight += 5;

    const isDisliked = dislikedRecipes.includes(recipe.id);
    if (isDisliked) weight -= 8;

    return Math.max(1, weight);
}

/**
 * Weighted Random Pick Function
 */
function weightedRandomChoice(candidateItems) {
    if (!candidateItems || candidateItems.length === 0) return null;

    const weightedPool = candidateItems.map(recipe => ({
        recipe,
        weight: calculateRecipeWeight(recipe)
    }));

    const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
    let randomThreshold = Math.random() * totalWeight;

    for (const item of weightedPool) {
        if (randomThreshold < item.weight) {
            return item.recipe;
        }
        randomThreshold -= item.weight;
    }

    return candidateItems[0];
}

function updateBadges() {
    if (starredCount) starredCount.textContent = favorites.length;
    if (dislikedCount) dislikedCount.textContent = dislikedRecipes.length;
    if (historyCount) historyCount.textContent = cookingHistory.length;
}

// Fetch Dataset
async function loadRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        recipes = await response.json();
        updateBadges();

        if (appMode === 'recipes' && recipes.length > 0) {
            renderCard({ recipe: weightedRandomChoice(recipes), isFallback: false, matchedTraits: [] });
        }
    } catch (error) {
        console.error('Error fetching recipes.json:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Failed to load recipe library.</p>
                <p class="text-xs mt-1">Make sure you are serving files via a local web server (e.g., Live Server).</p>
            </div>
        `;
    }
}

/**
 * Filter Matching Engine
 * Filters recipes against search bar text & active dropdown criteria.
 */
function filterRecipes({ ignoreKeyword = false } = {}) {
    const query = ignoreKeyword ? '' : (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const filters = {
        course: courseSelect.value,
        cuisine: cuisineSelect.value,
        protein: proteinSelect.value,
        baseStyle: styleSelect.value,
        difficulty: difficultySelect.value,
        mood: moodSelect.value
    };

    const activeFilters = Object.entries(filters).filter(([_, val]) => val !== 'Any');

    return recipes.filter(recipe => {
        // Keyword search matching name, description, ingredients, or tags
        if (query) {
            const nameMatch = recipe.name.toLowerCase().includes(query);
            const descMatch = recipe.description ? recipe.description.toLowerCase().includes(query) : false;
            const ingMatch = recipe.ingredients ? recipe.ingredients.some(i => i.toLowerCase().includes(query)) : false;
            const tagMatch = [recipe.course, recipe.cuisine, recipe.protein, recipe.baseStyle, recipe.mood, recipe.difficulty]
                .some(tag => tag && tag.toLowerCase().includes(query));

            if (!nameMatch && !descMatch && !ingMatch && !tagMatch) {
                return false;
            }
        }

        // Dropdown criteria matching
        for (const [key, val] of activeFilters) {
            if (recipe[key] !== val) {
                return false;
            }
        }

        return true;
    });
}

function findMeal(forceRandom = false) {
    if (forceRandom) {
        if (searchInput) searchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
        courseSelect.value = 'Any';
        cuisineSelect.value = 'Any';
        proteinSelect.value = 'Any';
        styleSelect.value = 'Any';
        difficultySelect.value = 'Any';
        moodSelect.value = 'Any';

        return {
            recipe: weightedRandomChoice(recipes),
            isFallback: false,
            matchedTraits: []
        };
    }

    const matches = filterRecipes();

    if (matches.length > 0) {
        return {
            recipe: weightedRandomChoice(matches),
            isFallback: false,
            matchedTraits: []
        };
    }

    // Fallback: Relax search criteria if no exact match is found
    const filters = {
        course: courseSelect.value,
        cuisine: cuisineSelect.value,
        protein: proteinSelect.value,
        baseStyle: styleSelect.value,
        difficulty: difficultySelect.value,
        mood: moodSelect.value
    };
    const activeFilters = Object.entries(filters).filter(([_, val]) => val !== 'Any');

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

    const sortedCandidates = scoredRecipes.sort((a, b) => b.score - a.score);
    const highestScore = sortedCandidates[0]?.score || 0;

    if (highestScore > 0) {
        const topCandidates = sortedCandidates.filter(item => item.score === highestScore);
        const candidateRecipes = topCandidates.map(c => c.recipe);
        const selectedFallback = weightedRandomChoice(candidateRecipes);
        const fallbackItem = topCandidates.find(t => t.recipe.id === selectedFallback.id);

        return {
            recipe: selectedFallback,
            isFallback: true,
            matchedTraits: fallbackItem ? fallbackItem.matchedTraits : []
        };
    }

    return { recipe: null, isFallback: false, matchedTraits: [] };
}

/**
 * Render Search Directory View
 * Displays a responsive grid of all matching recipes with summary cards.
 */
function renderSearchResults() {
    const matches = filterRecipes();

    if (matches.length === 0) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in w-full">
                <div class="text-5xl mb-4">🔍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">No matching dishes found</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-6 text-sm">We couldn't find any recipes matching your current search query or filter settings. Try broadening your keywords or clearing your filters!</p>
                <div class="flex flex-wrap justify-center gap-3">
                    <button id="clearFiltersDirectoryBtn" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-all cursor-pointer text-sm">
                        Clear Search & Filters
                    </button>
                    <button id="surpriseDirectoryBtn" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-5 rounded-xl transition-all cursor-pointer text-sm">
                        Surprise Me Instead
                    </button>
                </div>
            </div>
        `;

        document.getElementById('clearFiltersDirectoryBtn')?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
            courseSelect.value = 'Any';
            cuisineSelect.value = 'Any';
            proteinSelect.value = 'Any';
            styleSelect.value = 'Any';
            difficultySelect.value = 'Any';
            moodSelect.value = 'Any';
            renderSearchResults();
        });

        document.getElementById('surpriseDirectoryBtn')?.addEventListener('click', () => {
            triggerInteractiveLoading(surpriseBtn, surpriseIcon, () => renderCard(findMeal(true)));
        });

        return;
    }

    resultContainer.innerHTML = `
        <div class="space-y-4 animate-pop-in w-full">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-100/80 border border-slate-200/80 rounded-2xl px-5 py-3.5">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-list-check text-brand-600"></i>
                    <span class="text-sm font-bold text-slate-800">Found <span class="text-brand-700 font-extrabold">${matches.length}</span> matching meal${matches.length === 1 ? '' : 's'}</span>
                </div>
                <button id="directoryRandomPickBtn" class="text-xs font-semibold text-brand-700 bg-white hover:bg-brand-50 border border-brand-200 px-3.5 py-1.5 rounded-xl cursor-pointer transition-colors shadow-sm self-start sm:self-auto">
                    <i class="fa-solid fa-dice mr-1 text-brand-500"></i> Pick Random Match
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${matches.map(recipe => {
                    const isStarred = favorites.includes(recipe.id);
                    const isDisliked = dislikedRecipes.includes(recipe.id);
                    return `
                        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-md hover:shadow-lg transition-all flex flex-col justify-between space-y-4 relative">
                            <div>
                                <div class="flex items-start justify-between gap-3 mb-2">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                            ${recipe.emoji}
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-slate-900 text-base leading-snug">${escapeHtml(recipe.name)}</h4>
                                            <p class="text-xs text-slate-400 mt-0.5"><i class="fa-regular fa-clock mr-1"></i>${recipe.prepTime}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        ${isStarred ? '<i class="fa-solid fa-star text-amber-400 text-xs" title="Starred"></i>' : ''}
                                        ${isDisliked ? '<i class="fa-solid fa-thumbs-down text-rose-400 text-xs" title="Disliked"></i>' : ''}
                                    </div>
                                </div>
                                <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">${escapeHtml(recipe.description)}</p>
                                <div class="flex flex-wrap gap-1.5">
                                    <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold text-[10px] rounded-md">
                                        🍽 ${recipe.course}
                                    </span>
                                    <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold text-[10px] rounded-md">
                                        🌍 ${recipe.cuisine}
                                    </span>
                                    <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold text-[10px] rounded-md">
                                        ⚡ ${recipe.difficulty}
                                    </span>
                                </div>
                            </div>
                            <button onclick="viewDetailedRecipe(${recipe.id})" class="w-full bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs py-2.5 px-4 rounded-xl border border-brand-200/60 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                                <span>View Recipe</span>
                                <i class="fa-solid fa-arrow-right text-[10px]"></i>
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    document.getElementById('directoryRandomPickBtn')?.addEventListener('click', () => {
        const randomPick = weightedRandomChoice(matches);
        if (randomPick) renderCard({ recipe: randomPick, isFallback: false, matchedTraits: [] });
    });
}

window.viewDetailedRecipe = function(recipeId) {
    const selected = recipes.find(r => r.id === recipeId);
    if (selected) {
        renderCard({ recipe: selected, isFallback: false, matchedTraits: [] });
    }
};

function getDifficultyBadgeClass(difficulty) {
    switch (difficulty) {
        case 'Easy': return 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30';
        case 'Medium': return 'bg-amber-500/20 text-amber-100 border-amber-400/30';
        case 'Hard': return 'bg-rose-500/20 text-rose-100 border-rose-400/30';
        default: return 'bg-slate-500/20 text-slate-100 border-slate-400/30';
    }
}

/**
 * Ingredient Quantity Scaling Helper
 * Parses numeric values/fractions in ingredient strings and scales them by multiplier.
 */
function scaleIngredientText(ingredientStr, multiplier) {
    if (multiplier === 1) return ingredientStr;

    return ingredientStr.replace(/\b(\d+\/\d+|\d+\.\d+|\d+)\b/g, (match) => {
        let val;
        if (match.includes('/')) {
            const [num, den] = match.split('/');
            val = parseFloat(num) / parseFloat(den);
        } else {
            val = parseFloat(match);
        }

        const scaled = val * multiplier;
        return parseFloat(scaled.toFixed(2)).toString();
    });
}

/**
 * Dynamic Prep & Cook Time Scaler
 * Calculates scaled preparation time based on portion count with a clear batch note.
 */
function calculateScaledTime(basePrepTime, servings) {
    if (servings === BASE_SERVINGS) return basePrepTime;

    const match = basePrepTime.match(/(\d+)/);
    if (!match) return basePrepTime;

    const baseMins = parseInt(match[1], 10);
    // Scaling time slightly with servings (square root factor prevents unrealistically high cooking times)
    const scaleFactor = Math.sqrt(servings / BASE_SERVINGS);
    const scaledMins = Math.round(baseMins * scaleFactor);

    return `${scaledMins} mins <span class="text-[11px] font-normal opacity-85">(scaled for ${servings} servings; base recipe: ${BASE_SERVINGS} servings)</span>`;
}

// Render Recipe Card View
function renderCard({ recipe, isFallback, matchedTraits }) {
    if (!recipe) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-5xl mb-4">🔍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">No match found</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-6 text-sm">Try relaxing your filter selections or search terms!</p>
                <button id="noMatchSurpriseBtn" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all cursor-pointer">
                    Surprise Me Instead
                </button>
            </div>
        `;
        document.getElementById('noMatchSurpriseBtn').addEventListener('click', () => {
            triggerInteractiveLoading(surpriseBtn, surpriseIcon, () => renderCard(findMeal(true)));
        });
        return;
    }

    const isStarred = favorites.includes(recipe.id);
    const isDisliked = dislikedRecipes.includes(recipe.id);
    const multiplier = currentServings / BASE_SERVINGS;

    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 animate-pop-in w-full">
            ${isFallback ? `
                <div class="bg-amber-500 text-slate-900 px-6 py-3 font-medium text-xs sm:text-sm flex items-center justify-between gap-2 border-b border-amber-600/20">
                    <span>No exact match found, but here is a close match based on <strong>${matchedTraits.join(', ')}</strong>!</span>
                    <button id="fallbackSurpriseBtn" class="underline font-bold whitespace-nowrap cursor-pointer hover:text-white transition-colors">Surprise Me</button>
                </div>
            ` : ''}

            <!-- Recipe Hero Banner -->
            <div class="bg-gradient-to-r from-emerald-600 via-brand-600 to-teal-700 p-6 sm:p-8 text-white relative">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-center space-x-4">
                        <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shrink-0 transition-transform hover:scale-105 duration-200">
                            ${recipe.emoji}
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">${recipe.name}</h2>
                                <button id="starBtn" class="text-2xl cursor-pointer transition-all active:scale-75 ${isStarred ? 'text-amber-300 scale-110' : 'text-white/40 hover:text-white'}" title="${isStarred ? 'Remove from favorites' : 'Add to favorites'}">
                                    <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                                </button>
                                <button id="dislikeBtn" class="text-xl cursor-pointer transition-all active:scale-75 ${isDisliked ? 'text-rose-300 scale-110' : 'text-white/40 hover:text-rose-200'}" title="${isDisliked ? 'In Dislike List (-8 pts)' : 'Dislike dish (-8 pts penalty)'}">
                                    <i class="fa-solid fa-thumbs-down"></i>
                                </button>
                            </div>
                            <p class="text-brand-100 text-sm mt-1 flex items-center gap-1.5 flex-wrap">
                                <i class="fa-regular fa-clock"></i>
                                <span>${calculateScaledTime(recipe.prepTime, currentServings)}</span>
                            </p>
                        </div>
                    </div>

                    <!-- Mark as Cooked Action -->
                    <button id="markCookedBtn" class="w-full sm:w-auto px-4 py-2.5 bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md text-white border border-white/30 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer">
                        <i class="fa-solid fa-circle-check text-emerald-300"></i>
                        <span>Mark as Cooked</span>
                    </button>
                </div>

                <!-- Meta Tags -->
                <div class="flex flex-wrap gap-2 mt-6">
                    <span class="px-3 py-1 bg-purple-500/20 text-purple-100 font-semibold text-xs rounded-full border border-purple-400/30">
                        🍽 ${recipe.course}
                    </span>
                    <span class="px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyBadgeClass(recipe.difficulty)}">
                        ⚡ ${recipe.difficulty}
                    </span>
                    <span class="px-3 py-1 bg-indigo-500/20 text-indigo-100 font-semibold text-xs rounded-full border border-indigo-400/30">
                        ✨ ${recipe.mood}
                    </span>
                    <span class="px-3 py-1 bg-white/20 text-white font-medium text-xs rounded-full border border-white/20">
                        🌍 ${recipe.cuisine}
                    </span>
                    <span class="px-3 py-1 bg-white/20 text-white font-medium text-xs rounded-full border border-white/20">
                        🥩 ${recipe.protein}
                    </span>
                    <span class="px-3 py-1 bg-white/20 text-white font-medium text-xs rounded-full border border-white/20">
                        🥢 ${recipe.baseStyle}
                    </span>
                </div>
            </div>

            <!-- Recipe Details Body -->
            <div class="p-6 sm:p-8">
                <p class="text-slate-600 leading-relaxed mb-6 font-normal text-sm sm:text-base">${recipe.description}</p>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 mb-6">
                    <button id="tabIngredientsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-all duration-200 ${activeTab === 'ingredients' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} cursor-pointer">
                        <i class="fa-solid fa-basket-shopping mr-2"></i> Ingredients
                    </button>
                    <button id="tabInstructionsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 transition-all duration-200 ${activeTab === 'instructions' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} cursor-pointer">
                        <i class="fa-solid fa-list-check mr-2"></i> Preparation Steps
                    </button>
                </div>

                <!-- Serving Size Scaler Bar (Above Ingredients) -->
                <div id="ingredientsPanel" class="${activeTab === 'ingredients' ? 'block' : 'hidden'} space-y-4">
                    <div class="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-3">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-users text-slate-500 text-sm"></i>
                            <span class="text-xs sm:text-sm font-bold text-slate-700">Serving Size:</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <button id="decreaseServingsBtn" class="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-sm">
                                <i class="fa-solid fa-minus text-xs"></i>
                            </button>
                            <span id="servingsDisplay" class="text-sm font-extrabold text-brand-700 min-w-[3rem] text-center bg-brand-100/60 px-2.5 py-1 rounded-lg">
                                ${currentServings} ${currentServings === 1 ? 'person' : 'people'}
                            </span>
                            <button id="increaseServingsBtn" class="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-sm">
                                <i class="fa-solid fa-plus text-xs"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Scaled Ingredients List -->
                    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        ${recipe.ingredients.map((ing, idx) => `
                            <li id="ing-item-${idx}" onclick="toggleIngredient(${idx})" class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs sm:text-sm text-slate-700 font-medium cursor-pointer select-none border border-slate-200/50 transition-all duration-150">
                                <input type="checkbox" id="ing-check-${idx}" class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 pointer-events-none transition-transform duration-150" onclick="event.stopPropagation()">
                                <span id="ing-text-${idx}">${scaleIngredientText(ing, multiplier)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <!-- Instructions Steps -->
                <div id="instructionsPanel" class="${activeTab === 'instructions' ? 'block' : 'hidden'}">
                    <ol class="space-y-3">
                        ${recipe.instructions.map((step, idx) => `
                            <li id="step-item-${idx}" onclick="toggleStep(${idx})" class="flex gap-4 p-3.5 rounded-xl border border-slate-200/60 hover:bg-slate-50 cursor-pointer select-none transition-all duration-150">
                                <span id="step-badge-${idx}" class="w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs shrink-0 transition-colors duration-150">
                                    ${idx + 1}
                                </span>
                                <p id="step-text-${idx}" class="text-xs sm:text-sm text-slate-700 leading-relaxed pt-0.5 transition-colors duration-150">${step}</p>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `;

    // Event Listeners for Recipe Card Actions
    document.getElementById('tabIngredientsBtn').addEventListener('click', () => switchTab('ingredients'));
    document.getElementById('tabInstructionsBtn').addEventListener('click', () => switchTab('instructions'));
    document.getElementById('starBtn').addEventListener('click', () => toggleFavorite(recipe));
    document.getElementById('markCookedBtn').addEventListener('click', () => logCookedMeal(recipe));
    document.getElementById('dislikeBtn').addEventListener('click', () => toggleDislike(recipe));

    // Serving Stepper Event Listeners
    document.getElementById('decreaseServingsBtn').addEventListener('click', () => {
        if (currentServings > 1) {
            currentServings--;
            renderCard({ recipe, isFallback, matchedTraits });
        }
    });

    document.getElementById('increaseServingsBtn').addEventListener('click', () => {
        if (currentServings < 20) {
            currentServings++;
            renderCard({ recipe, isFallback, matchedTraits });
        }
    });

    if (isFallback) {
        document.getElementById('fallbackSurpriseBtn').addEventListener('click', () => {
            triggerInteractiveLoading(surpriseBtn, surpriseIcon, () => renderCard(findMeal(true)));
        });
    }
}

/**
 * Interactive Loading Animation Helper
 * Triggers a complete 360-degree rotation over 400ms on action button icons.
 */
function triggerInteractiveLoading(buttonEl, iconEl, callback) {
    if (!buttonEl || !iconEl) {
        callback();
        return;
    }

    buttonEl.classList.add('opacity-80', 'pointer-events-none');
    iconEl.classList.add('animate-spin-full');

    setTimeout(() => {
        buttonEl.classList.remove('opacity-80', 'pointer-events-none');
        iconEl.classList.remove('animate-spin-full');
        callback();
    }, 400);
}

// Search Input Listener
if (searchInput) {
    searchInput.addEventListener('input', () => {
        const value = searchInput.value.trim();
        if (clearSearchBtn) {
            if (value.length > 0) {
                clearSearchBtn.classList.remove('hidden');
            } else {
                clearSearchBtn.classList.add('hidden');
            }
        }
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
    });
}

// Inline Expandable Custom Filters Toggle
if (toggleInlineFiltersBtn) {
    toggleInlineFiltersBtn.addEventListener('click', () => {
        const isHidden = expandedFiltersPanel.classList.contains('hidden');
        if (isHidden) {
            expandedFiltersPanel.classList.remove('hidden');
            if (chevronIcon) chevronIcon.classList.add('rotate-180');
        } else {
            expandedFiltersPanel.classList.add('hidden');
            if (chevronIcon) chevronIcon.classList.remove('rotate-180');
        }
    });
}

// Main Action Buttons
findMealBtn.addEventListener('click', () => {
    if (appMode === 'restaurants') {
        searchNearbyRestaurants({ surprise: false });
        return;
    }
    triggerInteractiveLoading(findMealBtn, findMealIcon, () => renderCard(findMeal(false)));
});

if (searchAllMatchesBtn) {
    searchAllMatchesBtn.addEventListener('click', () => {
        triggerInteractiveLoading(searchAllMatchesBtn, searchAllIcon, () => renderSearchResults());
    });
}

surpriseBtn.addEventListener('click', () => {
    if (appMode === 'restaurants') {
        searchNearbyRestaurants({ surprise: true });
        return;
    }
    triggerInteractiveLoading(surpriseBtn, surpriseIcon, () => renderCard(findMeal(true)));
});

if (modeRecipesBtn) modeRecipesBtn.addEventListener('click', () => setMode('recipes'));
if (modeRestaurantsBtn) modeRestaurantsBtn.addEventListener('click', () => setMode('restaurants'));

// Helper User Actions
function toggleFavorite(recipe) {
    const recipeId = recipe.id;
    if (favorites.includes(recipeId)) {
        favorites = favorites.filter(id => id !== recipeId);
        showToast(`Removed "${recipe.name}" from Starred`, 'info');
    } else {
        favorites.push(recipeId);
        showToast(`Starred "${recipe.name}"! (+15 points)`, 'amber');
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    updateBadges();

    renderCard({ recipe, isFallback: false, matchedTraits: [] });
}

function toggleDislike(recipe) {
    const recipeId = recipe.id;
    if (dislikedRecipes.includes(recipeId)) {
        dislikedRecipes = dislikedRecipes.filter(id => id !== recipeId);
        localStorage.setItem(DISLIKED_KEY, JSON.stringify(dislikedRecipes));
        updateBadges();
        showToast(`Removed "${recipe.name}" from Dislikes`, 'info');
        renderCard({ recipe, isFallback: false, matchedTraits: [] });
    } else {
        dislikedRecipes.push(recipeId);
        localStorage.setItem(DISLIKED_KEY, JSON.stringify(dislikedRecipes));
        updateBadges();
        showToast(`Disliked "${recipe.name}" (-8 pts penalty applied)`, 'rose');

        // Pick a new surprise dish automatically
        triggerInteractiveLoading(surpriseBtn, surpriseIcon, () => renderCard(findMeal(true)));
    }
}

function logCookedMeal(recipe) {
    cookingHistory.unshift({
        recipeId: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji,
        timestamp: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(cookingHistory));
    updateBadges();

    showToast(`Logged "${recipe.name}" to cooking history!`, 'success');

    const btn = document.getElementById('markCookedBtn');
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-check text-emerald-300"></i><span>Logged!</span>`;
        setTimeout(() => {
            if (btn) btn.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-300"></i><span>Mark as Cooked</span>`;
        }, 2000);
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

function toggleStep(index) {
    const row = document.getElementById(`step-item-${index}`);
    const badge = document.getElementById(`step-badge-${index}`);
    const text = document.getElementById(`step-text-${index}`);
    if (!row || !badge || !text) return;

    const isCompleted = row.classList.contains('bg-slate-100/70');
    if (!isCompleted) {
        row.classList.add('bg-slate-100/70', 'opacity-60');
        text.classList.add('line-through', 'text-slate-400');
        badge.className = "w-7 h-7 bg-slate-200 text-slate-500 font-bold rounded-full flex items-center justify-center text-xs shrink-0 transition-colors duration-150";
    } else {
        row.classList.remove('bg-slate-100/70', 'opacity-60');
        text.classList.remove('line-through', 'text-slate-400');
        badge.className = "w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs shrink-0 transition-colors duration-150";
    }
}

function switchTab(tabName) {
    activeTab = tabName;
    const ingPanel = document.getElementById('ingredientsPanel');
    const instPanel = document.getElementById('instructionsPanel');
    const tabIng = document.getElementById('tabIngredientsBtn');
    const tabInst = document.getElementById('tabInstructionsBtn');

    if (tabName === 'ingredients') {
        ingPanel.classList.remove('hidden');
        instPanel.classList.add('hidden');
        tabIng.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 cursor-pointer transition-all duration-200";
        tabInst.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer transition-all duration-200";
    } else {
        ingPanel.classList.add('hidden');
        instPanel.classList.remove('hidden');
        tabIng.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer transition-all duration-200";
        tabInst.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 cursor-pointer transition-all duration-200";
    }
}

// Side Drawer Operations
function openDrawer(title, contentHtml, footerHtml = '') {
    drawerTitle.textContent = title;
    drawerContent.innerHTML = contentHtml;
    drawerFooter.innerHTML = footerHtml;
    drawerOverlay.classList.remove('hidden');
    drawer.classList.remove('translate-x-full');
}

function closeDrawer() {
    drawer.classList.add('translate-x-full');
    drawerOverlay.classList.add('hidden');
}

// Drawer Event Listeners
if (viewFavoritesBtn) {
    viewFavoritesBtn.addEventListener('click', () => {
        const favoriteRecipes = recipes.filter(r => favorites.includes(r.id));
        let contentHtml = favoriteRecipes.length === 0 
            ? `<div class="text-center py-12 text-slate-400"><p class="font-semibold text-slate-600">No starred recipes yet!</p></div>`
            : favoriteRecipes.map(r => `
                <div onclick="selectRecipeFromDrawer(${r.id})" class="p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 flex items-center justify-between cursor-pointer transition-colors">
                    <div class="flex items-center space-x-3">
                        <span class="text-2xl">${r.emoji}</span>
                        <div><h4 class="font-bold text-slate-800 text-sm">${r.name}</h4><p class="text-xs text-slate-400">${r.course}</p></div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
                </div>
            `).join('');

        openDrawer('Starred Dishes', contentHtml);
    });
}

if (viewDislikesBtn) {
    viewDislikesBtn.addEventListener('click', () => {
        const dislikedList = recipes.filter(r => dislikedRecipes.includes(r.id));
        let contentHtml = dislikedList.length === 0 
            ? `<div class="text-center py-12 text-slate-400"><p class="font-semibold text-slate-600">No disliked dishes!</p></div>`
            : dislikedList.map(r => `
                <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div onclick="selectRecipeFromDrawer(${r.id})" class="flex items-center space-x-3 cursor-pointer flex-1">
                        <span class="text-2xl">${r.emoji}</span>
                        <div><h4 class="font-bold text-slate-800 text-sm">${r.name}</h4><p class="text-xs text-slate-400">${r.course}</p></div>
                    </div>
                    <button onclick="removeDislikeFromDrawer(event, ${r.id})" class="text-xs text-rose-500 font-semibold px-2.5 py-1.5 hover:bg-rose-100/60 rounded-lg transition-colors cursor-pointer" title="Remove from dislike list">
                        Remove
                    </button>
                </div>
            `).join('');

        const footerHtml = dislikedList.length > 0 ? `
            <button id="clearDislikesBtn" class="w-full py-2.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl border border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors">Clear All Dislikes</button>
        ` : '';

        openDrawer('Disliked Dishes', contentHtml, footerHtml);

        const clearBtn = document.getElementById('clearDislikesBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                dislikedRecipes = [];
                localStorage.setItem(DISLIKED_KEY, JSON.stringify([]));
                updateBadges();
                closeDrawer();
                showToast('Cleared all disliked dishes!', 'info');
                renderCard(findMeal(true));
            });
        }
    });
}

if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => {
        let contentHtml = cookingHistory.length === 0
            ? `<div class="text-center py-12 text-slate-400"><p class="font-semibold text-slate-600">No cooking log history</p></div>`
            : cookingHistory.map(entry => `
                <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <span class="text-2xl">${entry.emoji}</span>
                        <div><h4 class="font-bold text-slate-800 text-sm">${entry.name}</h4><p class="text-[11px] text-slate-400">${entry.timestamp}</p></div>
                    </div>
                </div>
            `).join('');

        const footerHtml = cookingHistory.length > 0 ? `
            <button id="clearHistoryBtn" class="w-full py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-200 cursor-pointer hover:bg-red-100 transition-colors">Clear History</button>
        ` : '';

        openDrawer('Cooking Log', contentHtml, footerHtml);

        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                cookingHistory = [];
                localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
                updateBadges();
                closeDrawer();
                showToast('Cleared cooking log history!', 'info');
            });
        }
    });
}

window.removeDislikeFromDrawer = function(event, recipeId) {
    event.stopPropagation();
    const recipe = recipes.find(r => r.id === recipeId);
    dislikedRecipes = dislikedRecipes.filter(id => id !== recipeId);
    localStorage.setItem(DISLIKED_KEY, JSON.stringify(dislikedRecipes));
    updateBadges();
    showToast(`Removed "${recipe ? recipe.name : 'dish'}" from Dislikes`, 'info');
    
    // Re-render Dislikes Drawer
    if (viewDislikesBtn) viewDislikesBtn.click();
};

window.selectRecipeFromDrawer = function(recipeId) {
    const selected = recipes.find(r => r.id === recipeId);
    if (selected) {
        renderCard({ recipe: selected, isFallback: false, matchedTraits: [] });
        closeDrawer();
    }
};

if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

// ── Nearby restaurants (fast path) ──────────────────────────────────────────

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    const parent = locationStatusText.parentElement;
    if (!parent) return;
    parent.classList.toggle('border-red-200', isError);
    parent.classList.toggle('bg-red-50', isError);
    parent.classList.toggle('text-red-700', isError);
}

function setRestaurantLoading(isLoading, label = 'Searching…', detail = 'Talking to OpenStreetMap mirrors…') {
    findMealBtn.disabled = isLoading;
    surpriseBtn.disabled = isLoading;
    findMealBtn.classList.toggle('opacity-70', isLoading);
    surpriseBtn.classList.toggle('opacity-70', isLoading);
    if (isLoading) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in w-full">
                <div class="text-4xl mb-3"><i class="fa-solid fa-spinner fa-spin text-brand-500"></i></div>
                <h3 class="text-lg font-bold text-slate-800 mb-1">${escapeHtml(label)}</h3>
                <p id="restaurantLoadingDetail" class="text-sm text-slate-500">${escapeHtml(detail)}</p>
            </div>
        `;
    }
}

function updateRestaurantLoadingDetail(detail) {
    const el = document.getElementById('restaurantLoadingDetail');
    if (el) el.textContent = detail;
}

function setMode(mode) {
    appMode = mode;
    const isRecipes = mode === 'recipes';

    document.querySelectorAll('.recipe-only-filter').forEach((el) => {
        el.classList.toggle('hidden', !isRecipes);
    });
    document.querySelectorAll('.restaurant-only-filter').forEach((el) => {
        el.classList.toggle('hidden', isRecipes);
    });

    if (!isRecipes && expandedFiltersPanel && !expandedFiltersPanel.classList.contains('hidden')) {
        expandedFiltersPanel.classList.add('hidden');
        if (chevronIcon) chevronIcon.classList.remove('rotate-180');
    }

    const activeClasses = 'mode-btn flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-semibold text-sm transition-all cursor-pointer bg-brand-600 text-white shadow-md shadow-brand-500/20';
    const idleClasses = 'mode-btn flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-semibold text-sm transition-all cursor-pointer bg-transparent text-slate-600 hover:bg-slate-50';

    if (modeRecipesBtn) {
        modeRecipesBtn.className = isRecipes ? activeClasses : idleClasses;
        modeRecipesBtn.setAttribute('aria-selected', String(isRecipes));
    }
    if (modeRestaurantsBtn) {
        modeRestaurantsBtn.className = isRecipes ? idleClasses : activeClasses;
        modeRestaurantsBtn.setAttribute('aria-selected', String(!isRecipes));
    }

    if (isRecipes) {
        if (controlsSubtitle) controlsSubtitle.textContent = 'Select a quick preference or let us pick a random meal!';
        if (findMealBtnLabel) findMealBtnLabel.textContent = 'Find Me a Meal';
        if (surpriseBtnLabel) surpriseBtnLabel.textContent = 'Surprise Me!';
        if (findMealIcon) findMealIcon.className = 'fa-solid fa-utensils';
        if (recipes.length > 0) {
            renderCard({ recipe: weightedRandomChoice(recipes), isFallback: false, matchedTraits: [] });
        }
    } else {
        if (controlsSubtitle) controlsSubtitle.textContent = 'Find nearby places fast via free OpenStreetMap Overpass mirrors — no API key.';
        if (findMealBtnLabel) findMealBtnLabel.textContent = 'Find Nearby Places';
        if (surpriseBtnLabel) surpriseBtnLabel.textContent = 'Surprise Pick';
        if (findMealIcon) findMealIcon.className = 'fa-solid fa-location-dot';
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in w-full">
                <div class="text-5xl mb-4">📍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Hungry to go out?</h3>
                <p class="text-slate-500 max-w-md mx-auto text-sm">
                    We prefetch your location in the background, then race multiple free Overpass mirrors so results show up faster.
                </p>
            </div>
        `;
        resolveUserLocation(false).catch(() => {});
    }
}

function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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

function getBrowserPosition(timeoutMs = GEO_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'device' }),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 }
        );
    });
}

async function getIpFallbackPosition() {
    const response = await fetchWithTimeout(GEOJS_URL, {}, IP_TIMEOUT_MS);
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
    if (locationPromise && !forceRefresh) return locationPromise;

    locationPromise = (async () => {
        updateRestaurantLoadingDetail('Getting your location…');

        const deviceAttempt = getBrowserPosition(GEO_TIMEOUT_MS)
            .then((loc) => ({ ok: true, loc }))
            .catch((err) => ({ ok: false, err }));

        const ipAttempt = getIpFallbackPosition()
            .then((loc) => ({ ok: true, loc }))
            .catch((err) => ({ ok: false, err }));

        const earlyDevice = await Promise.race([
            deviceAttempt,
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, err: new Error('geo-soft-timeout') }), 1200))
        ]);

        if (earlyDevice.ok) {
            userLocation = earlyDevice.loc;
            setLocationStatus(
                `Using device location (${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}). Data © OpenStreetMap / Overpass.`
            );
            return userLocation;
        }

        const [deviceResult, ipResult] = await Promise.all([deviceAttempt, ipAttempt]);

        if (deviceResult.ok) {
            userLocation = deviceResult.loc;
            setLocationStatus(
                `Using device location (${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}). Data © OpenStreetMap / Overpass.`
            );
            return userLocation;
        }

        if (ipResult.ok) {
            userLocation = ipResult.loc;
            setLocationStatus(
                `Using approximate IP location${userLocation.label ? ` (${userLocation.label})` : ''}. Allow location access for better accuracy.`
            );
            return userLocation;
        }

        setLocationStatus('Could not determine your location. Please allow location access and try again.', true);
        throw new Error('Unable to determine location from device or IP fallback.');
    })();

    try {
        return await locationPromise;
    } catch (err) {
        locationPromise = null;
        throw err;
    }
}

function buildOverpassQuery(lat, lon, radiusMeters, placeType) {
    const amenityFilter =
        placeType && placeType !== 'Any'
            ? `["amenity"="${placeType}"]`
            : '["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]';

    return `
[out:json][timeout:10];
node${amenityFilter}(around:${radiusMeters},${lat},${lon});
out tags 30;
`.trim();
}

async function fetchOverpass(query) {
    const body = `data=${encodeURIComponent(query)}`;
    const errors = [];

    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body
            },
            OVERPASS_TIMEOUT_MS
        );
        if (!response.ok) {
            throw new Error(`Overpass HTTP ${response.status} at ${endpoint}`);
        }
        const data = await response.json();
        return { endpoint, data };
    });

    return await new Promise((resolve, reject) => {
        let remaining = attempts.length;
        let settled = false;

        attempts.forEach((p) => {
            p.then((result) => {
                if (!settled) {
                    settled = true;
                    resolve(result);
                }
            }).catch((err) => {
                errors.push(err);
                remaining -= 1;
                if (remaining === 0 && !settled) {
                    reject(errors[errors.length - 1] || new Error('All Overpass mirrors failed.'));
                }
            });
        });
    });
}

function titleCaseAmenity(amenity) {
    return String(amenity || 'place')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function placeEmoji(amenity) {
    switch (amenity) {
        case 'cafe': return '☕';
        case 'fast_food': return '🍔';
        case 'food_court': return '🥡';
        case 'restaurant':
        default: return '🍽️';
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

function cacheKey(lat, lon, radius, placeType, cuisineFilter) {
    return [lat.toFixed(3), lon.toFixed(3), radius, placeType || 'Any', cuisineFilter || 'Any'].join('|');
}

function getCachedPlaces(key) {
    const hit = restaurantCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > RESTAURANT_CACHE_TTL_MS) {
        restaurantCache.delete(key);
        return null;
    }
    return hit.places;
}

function setCachedPlaces(key, places) {
    restaurantCache.set(key, { ts: Date.now(), places });
}

async function searchNearbyRestaurants({ surprise = false } = {}) {
    setRestaurantLoading(true, surprise ? 'Picking a surprise spot…' : 'Finding nearby places…', 'Resolving location…');

    try {
        const location = await resolveUserLocation(false);
        const radius = Number(radiusSelect?.value) || 1000;
        const placeType = surprise ? 'Any' : (placeTypeSelect?.value || 'Any');
        const cuisineFilter = surprise ? 'Any' : (cuisineSelect?.value || 'Any');

        if (surprise) {
            if (cuisineSelect) cuisineSelect.value = 'Any';
            if (placeTypeSelect) placeTypeSelect.value = 'Any';
        }

        const key = cacheKey(location.lat, location.lon, radius, placeType, cuisineFilter);
        let places = getCachedPlaces(key);

        if (places) {
            updateRestaurantLoadingDetail('Loaded from recent cache…');
        } else {
            updateRestaurantLoadingDetail('Racing free Overpass mirrors…');
            const query = buildOverpassQuery(location.lat, location.lon, radius, placeType);
            const { data, endpoint } = await fetchOverpass(query);
            updateRestaurantLoadingDetail(`Got response from ${endpoint.replace('https://', '').split('/')[0]}…`);

            const elements = Array.isArray(data.elements) ? data.elements : [];
            places = elements
                .map((el) => normalizePlace(el, location))
                .filter(Boolean)
                .filter((p) => matchesCuisineFilter(p, cuisineFilter));

            const seen = new Set();
            places = places.filter((p) => {
                const dedupe = `${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
                if (seen.has(dedupe)) return false;
                seen.add(dedupe);
                return true;
            });

            places.sort((a, b) => a.distanceKm - b.distanceKm);
            setCachedPlaces(key, places);
        }

        lastRestaurants = places;

        if (places.length === 0) {
            renderRestaurantEmpty({ cuisineFilter, radius, placeType });
            return;
        }

        if (surprise) {
            renderRestaurantFocus(places[Math.floor(Math.random() * places.length)], places);
        } else {
            renderRestaurantList(places);
        }
    } catch (error) {
        console.error('Nearby restaurant search failed:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center animate-pop-in w-full">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Couldn't load nearby restaurants.</p>
                <p class="text-xs mt-2 max-w-md mx-auto">${escapeHtml(error.message || 'Unknown error')}</p>
                <p class="text-xs mt-2 text-red-600/80">Free Overpass mirrors can be busy — try again, or allow location access.</p>
            </div>
        `;
    } finally {
        setRestaurantLoading(false);
    }
}

function renderRestaurantEmpty({ cuisineFilter, radius, placeType }) {
    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in w-full">
            <div class="text-5xl mb-4">🗺️</div>
            <h3 class="text-xl font-bold text-slate-800 mb-2">No places found nearby</h3>
            <p class="text-slate-500 max-w-md mx-auto mb-6 text-sm">
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
    document.getElementById('retryWiderBtn')?.addEventListener('click', () => {
        if (radiusSelect) radiusSelect.value = '5000';
        if (cuisineSelect) cuisineSelect.value = 'Any';
        if (placeTypeSelect) placeTypeSelect.value = 'Any';
        searchNearbyRestaurants({ surprise: false });
    });
}

function restaurantCardHtml(place, { featured = false } = {}) {
    const typeLabel = titleCaseAmenity(place.amenity);
    return `
        <article class="bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100 w-full ${featured ? 'animate-pop-in' : ''}">
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
        <div class="space-y-4 animate-pop-in w-full">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h3 class="text-lg font-bold text-slate-900">
                        <i class="fa-solid fa-store text-brand-500 mr-1"></i>
                        ${top.length} place${top.length === 1 ? '' : 's'} nearby
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5">Sorted by distance · cached for 5 min · free Overpass mirrors</p>
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
            renderRestaurantFocus(lastRestaurants[Math.floor(Math.random() * lastRestaurants.length)], lastRestaurants);
        }
    });
}

function renderRestaurantFocus(place, allPlaces) {
    resultContainer.innerHTML = `
        <div class="space-y-4 w-full">
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
        renderRestaurantFocus(allPlaces[Math.floor(Math.random() * allPlaces.length)], allPlaces);
    });
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    updateBadges();
    setMode('recipes');
    loadRecipes();
});

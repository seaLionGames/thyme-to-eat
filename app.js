/**
 * ThymeToEat Application Logic
 */

let recipes = [];
let activeTab = 'ingredients';

// DOM Elements
const cuisineSelect = document.getElementById('cuisineSelect');
const proteinSelect = document.getElementById('proteinSelect');
const styleSelect = document.getElementById('styleSelect');
const findMealBtn = document.getElementById('findMealBtn');
const surpriseBtn = document.getElementById('surpriseBtn');
const resultContainer = document.getElementById('resultContainer');

// Utility Helper
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// 1. Fetch JSON dataset on application startup
async function loadRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        recipes = await response.json();
        
        // Render initial random meal on load
        if (recipes.length > 0) {
            renderCard({ recipe: getRandomItem(recipes), isFallback: false, matchedTraits: [] });
        }
    } catch (error) {
        console.error('Error loading recipes dataset:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Failed to load recipe library.</p>
                <p class="text-xs mt-1">Please ensure you are serving files via a local server (e.g. Live Server) when using dynamic fetch().</p>
            </div>
        `;
    }
}

// 2. Smart Fallback Search Logic
function findMeal(forceRandom = false) {
    if (forceRandom) {
        cuisineSelect.value = 'Any';
        proteinSelect.value = 'Any';
        styleSelect.value = 'Any';
        return {
            recipe: getRandomItem(recipes),
            isFallback: false,
            matchedTraits: []
        };
    }

    const selectedCuisine = cuisineSelect.value;
    const selectedProtein = proteinSelect.value;
    const selectedStyle = styleSelect.value;

    // Step 1: Exact Match (Matches all active criteria)
    const exactMatches = recipes.filter(recipe => {
        const matchCuisine = selectedCuisine === 'Any' || recipe.cuisine === selectedCuisine;
        const matchProtein = selectedProtein === 'Any' || recipe.protein === selectedProtein;
        const matchStyle = selectedStyle === 'Any' || recipe.style === selectedStyle;
        return matchCuisine && matchProtein && matchStyle;
    });

    if (exactMatches.length > 0) {
        return {
            recipe: getRandomItem(exactMatches),
            isFallback: false,
            matchedTraits: []
        };
    }

    // Step 2: Fallback Logic - Search for dishes matching 2 out of 3 criteria
    // Only runs if at least 2 or 3 non-"Any" dropdowns were explicitly set
    const activeFiltersCount = [selectedCuisine, selectedProtein, selectedStyle].filter(val => val !== 'Any').length;

    if (activeFiltersCount >= 2) {
        const fallbackCandidates = [];

        recipes.forEach(recipe => {
            const matches = [];
            if (selectedCuisine !== 'Any' && recipe.cuisine === selectedCuisine) matches.push(recipe.cuisine);
            if (selectedProtein !== 'Any' && recipe.protein === selectedProtein) matches.push(recipe.protein);
            if (selectedStyle !== 'Any' && recipe.style === selectedStyle) matches.push(recipe.style);

            // Exactly 2 out of 3 matches found
            if (matches.length === 2) {
                fallbackCandidates.push({
                    recipe,
                    matchedTraits: matches
                });
            }
        });

        if (fallbackCandidates.length > 0) {
            const pickedFallback = getRandomItem(fallbackCandidates);
            return {
                recipe: pickedFallback.recipe,
                isFallback: true,
                matchedTraits: pickedFallback.matchedTraits
            };
        }
    }

    // Step 3: No exact or partial match found
    return { recipe: null, isFallback: false, matchedTraits: [] };
}

// 3. Card Template Renderer
function renderCard({ recipe, isFallback, matchedTraits }) {
    if (!recipe) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-5xl mb-4">🔍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">No match found</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-6">We couldn't find a meal matching your combination of choices. Try broadening your selections!</p>
                <button id="noMatchSurpriseBtn" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all">
                    Surprise Me Instead
                </button>
            </div>
        `;
        document.getElementById('noMatchSurpriseBtn').addEventListener('click', () => {
            renderCard(findMeal(true));
        });
        return;
    }

    const matchedTraitsText = matchedTraits.join(' & ');

    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 animate-pop-in">
            
            ${isFallback ? `
                <!-- Smart Fallback Banner -->
                <div class="bg-amber-500 text-slate-900 px-6 py-3 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-amber-600/20">
                    <div class="flex items-center gap-2 text-center sm:text-left">
                        <i class="fa-solid fa-circle-info text-slate-900"></i>
                        <span>No exact match found for all filters, but here is a close match based on <strong>${matchedTraitsText}</strong>!</span>
                    </div>
                    <button id="fallbackSurpriseBtn" class="underline text-slate-900 hover:text-slate-800 font-bold whitespace-nowrap cursor-pointer">
                        Surprise Me Instead
                    </button>
                </div>
            ` : ''}

            <!-- Top Card Hero Banner -->
            <div class="bg-gradient-to-r from-emerald-500 via-brand-500 to-teal-600 p-6 sm:p-8 text-white relative">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-center space-x-4">
                        <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shadow-inner shrink-0">
                            ${recipe.emoji}
                        </div>
                        <div>
                            <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">${recipe.name}</h2>
                            <p class="text-brand-100 text-sm mt-1 flex items-center gap-2">
                                <span><i class="fa-regular fa-clock"></i> ${recipe.prepTime}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Recipe Meta Tag Pills -->
                <div class="flex flex-wrap gap-2 mt-6">
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🌍 ${recipe.cuisine}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🥩 ${recipe.protein}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🍽️️ ${recipe.style}
                    </span>
                </div>
            </div>

            <!-- Description & Tab Controls -->
            <div class="p-6 sm:p-8">
                <p class="text-slate-600 leading-relaxed mb-6 font-normal">${recipe.description}</p>

                <!-- Toggle Navigation Tabs -->
                <div class="flex border-b border-slate-200 mb-6">
                    <button id="tabIngredientsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'ingredients' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} transition-all cursor-pointer">
                        <i class="fa-solid fa-basket-shopping mr-2"></i> Ingredients
                    </button>
                    <button id="tabInstructionsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'instructions' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} transition-all cursor-pointer">
                        <i class="fa-solid fa-list-check mr-2"></i> Preparation Steps
                    </button>
                </div>

                <!-- Ingredients List Panel -->
                <div id="ingredientsPanel" class="${activeTab === 'ingredients' ? 'block' : 'hidden'} space-y-2">
                    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        ${recipe.ingredients.map(ing => `
                            <li class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-xs sm:text-sm text-slate-700 font-medium">
                                <i class="fa-solid fa-check text-brand-500 text-xs"></i>
                                <span>${ing}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <!-- Instructions Panel -->
                <div id="instructionsPanel" class="${activeTab === 'instructions' ? 'block' : 'hidden'}">
                    <ol class="space-y-4">
                        ${recipe.instructions.map((step, idx) => `
                            <li class="flex gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                <span class="flex-shrink-0 w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs">
                                    ${idx + 1}
                                </span>
                                <p class="text-xs sm:text-sm text-slate-700 leading-relaxed pt-0.5">${step}</p>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `;

    // Attach dynamic listeners inside rendered card
    document.getElementById('tabIngredientsBtn').addEventListener('click', () => switchTab('ingredients'));
    document.getElementById('tabInstructionsBtn').addEventListener('click', () => switchTab('instructions'));

    if (isFallback) {
        document.getElementById('fallbackSurpriseBtn').addEventListener('click', () => {
            renderCard(findMeal(true));
        });
    }
}

// Tab Switching Handler
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

// Event Listeners
findMealBtn.addEventListener('click', () => {
    const result = findMeal(false);
    renderCard(result);
});

surpriseBtn.addEventListener('click', () => {
    const result = findMeal(true);
    renderCard(result);
});

// Initialize application
document.addEventListener('DOMContentLoaded', loadRecipes);

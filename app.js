/**
 * ThymeToEat - Application Logic
 */

let recipes = [];
let activeTab = 'ingredients';

const FAVORITES_KEY = 'thymetoeat_favorites';
const HISTORY_KEY = 'thymetoeat_history';

let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
let cookingHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];

// DOM Controls
const courseSelect = document.getElementById('courseSelect');
const cuisineSelect = document.getElementById('cuisineSelect');
const proteinSelect = document.getElementById('proteinSelect');
const styleSelect = document.getElementById('styleSelect');
const difficultySelect = document.getElementById('difficultySelect');
const moodSelect = document.getElementById('moodSelect');

const findMealBtn = document.getElementById('findMealBtn');
const surpriseBtn = document.getElementById('surpriseBtn');
const resultContainer = document.getElementById('resultContainer');

// Inline Customization Controls
const toggleInlineFiltersBtn = document.getElementById('toggleInlineFiltersBtn');
const expandedFiltersPanel = document.getElementById('expandedFiltersPanel');
const chevronIcon = document.getElementById('chevronIcon');

// Drawer Elements
const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const starredCount = document.getElementById('starredCount');
const historyCount = document.getElementById('historyCount');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const drawerTitle = document.getElementById('drawerTitle');
const drawerContent = document.getElementById('drawerContent');
const drawerFooter = document.getElementById('drawerFooter');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

// Weighted Choice Engine
function weightedRandomChoice(candidateItems) {
    if (!candidateItems || candidateItems.length === 0) return null;

    const weightedPool = candidateItems.map(recipe => {
        let weight = 1.0;

        // Boost dishes sharing Cuisine/Style with starred recipes
        const starredRecipes = recipes.filter(r => favorites.includes(r.id));
        starredRecipes.forEach(starred => {
            if (starred.cuisine === recipe.cuisine) weight += 0.8;
            if (starred.baseStyle === recipe.baseStyle) weight += 0.5;
        });

        // Boost Cuisines not cooked recently
        const recentCooks = cookingHistory.slice(0, 5);
        const recentCuisines = recentCooks.map(log => {
            const match = recipes.find(r => r.id === log.recipeId);
            return match ? match.cuisine : null;
        });

        if (!recentCuisines.includes(recipe.cuisine)) {
            weight += 0.9;
        }

        return { recipe, weight };
    });

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
    starredCount.textContent = favorites.length;
    historyCount.textContent = cookingHistory.length;
}

// Fetch Dataset
async function loadRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        recipes = await response.json();
        updateBadges();

        if (recipes.length > 0) {
            renderCard({ recipe: weightedRandomChoice(recipes), isFallback: false, matchedTraits: [] });
        }
    } catch (error) {
        console.error('Error fetching recipes.json:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Failed to load recipe library.</p>
                <p class="text-xs mt-1">Make sure you are serving files via a local web server.</p>
            </div>
        `;
    }
}

// Filter Engine
function findMeal(forceRandom = false) {
    if (forceRandom) {
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

    const filters = {
        course: courseSelect.value,
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
        const candidateRecipes = exactMatches.map(m => m.recipe);
        return {
            recipe: weightedRandomChoice(candidateRecipes),
            isFallback: false,
            matchedTraits: []
        };
    }

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

function getDifficultyBadgeClass(difficulty) {
    switch (difficulty) {
        case 'Easy': return 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30';
        case 'Medium': return 'bg-amber-500/20 text-amber-100 border-amber-400/30';
        case 'Hard': return 'bg-rose-500/20 text-rose-100 border-rose-400/30';
        default: return 'bg-slate-500/20 text-slate-100 border-slate-400/30';
    }
}

// Render Card
function renderCard({ recipe, isFallback, matchedTraits }) {
    if (!recipe) {
        resultContainer.innerHTML = `
            <div class="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg animate-pop-in">
                <div class="text-5xl mb-4">🔍</div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">No match found</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-6">Try relaxing your filter selections!</p>
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

    const isStarred = favorites.includes(recipe.id);

    resultContainer.innerHTML = `
        <div class="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 animate-pop-in w-full">
            ${isFallback ? `
                <div class="bg-amber-500 text-slate-900 px-6 py-3 font-medium text-xs sm:text-sm flex items-center justify-between gap-2 border-b border-amber-600/20">
                    <span>No exact match found, but here is a close match based on <strong>${matchedTraits.join(', ')}</strong>!</span>
                    <button id="fallbackSurpriseBtn" class="underline font-bold whitespace-nowrap cursor-pointer">Surprise Me</button>
                </div>
            ` : ''}

            <!-- Recipe Hero Banner -->
            <div class="bg-gradient-to-r from-emerald-600 via-brand-600 to-teal-700 p-6 sm:p-8 text-white relative">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-center space-x-4">
                        <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shrink-0">
                            ${recipe.emoji}
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">${recipe.name}</h2>
                                <button id="starBtn" class="text-2xl cursor-pointer ${isStarred ? 'text-amber-300' : 'text-white/40 hover:text-white'}">
                                    <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                                </button>
                            </div>
                            <p class="text-brand-100 text-sm mt-1 flex items-center gap-2">
                                <span><i class="fa-regular fa-clock"></i> ${recipe.prepTime}</span>
                            </p>
                        </div>
                    </div>

                    <button id="markCookedBtn" class="w-full sm:w-auto px-4 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/30 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer">
                        <i class="fa-solid fa-circle-check text-emerald-300"></i>
                        <span>Mark as Cooked</span>
                    </button>
                </div>

                <!-- Tags -->
                <div class="flex flex-wrap gap-2 mt-6">
                    <span class="px-3 py-1 bg-purple-500/20 text-purple-100 font-semibold text-xs rounded-full border border-purple-400/30">
                        🍽️️ ${recipe.course}
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

            <!-- Details -->
            <div class="p-6 sm:p-8">
                <p class="text-slate-600 leading-relaxed mb-6 font-normal text-sm sm:text-base">${recipe.description}</p>

                <!-- Navigation Tabs -->
                <div class="flex border-b border-slate-200 mb-6">
                    <button id="tabIngredientsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'ingredients' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} cursor-pointer">
                        <i class="fa-solid fa-basket-shopping mr-2"></i> Ingredients
                    </button>
                    <button id="tabInstructionsBtn" class="flex-1 pb-3 text-sm font-bold text-center border-b-2 ${activeTab === 'instructions' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'} cursor-pointer">
                        <i class="fa-solid fa-list-check mr-2"></i> Preparation Steps
                    </button>
                </div>

                <!-- Ingredients -->
                <div id="ingredientsPanel" class="${activeTab === 'ingredients' ? 'block' : 'hidden'} space-y-3">
                    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        ${recipe.ingredients.map((ing, idx) => `
                            <li id="ing-item-${idx}" onclick="toggleIngredient(${idx})" class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs sm:text-sm text-slate-700 font-medium cursor-pointer select-none border border-slate-200/50">
                                <input type="checkbox" id="ing-check-${idx}" class="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 pointer-events-none" onclick="event.stopPropagation()">
                                <span id="ing-text-${idx}">${ing}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <!-- Instructions -->
                <div id="instructionsPanel" class="${activeTab === 'instructions' ? 'block' : 'hidden'}">
                    <ol class="space-y-3">
                        ${recipe.instructions.map((step, idx) => `
                            <li id="step-item-${idx}" onclick="toggleStep(${idx})" class="flex gap-4 p-3.5 rounded-xl border border-slate-200/60 hover:bg-slate-50 cursor-pointer select-none">
                                <span id="step-badge-${idx}" class="w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs shrink-0">
                                    ${idx + 1}
                                </span>
                                <p id="step-text-${idx}" class="text-xs sm:text-sm text-slate-700 leading-relaxed pt-0.5">${step}</p>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `;

    document.getElementById('tabIngredientsBtn').addEventListener('click', () => switchTab('ingredients'));
    document.getElementById('tabInstructionsBtn').addEventListener('click', () => switchTab('instructions'));
    document.getElementById('starBtn').addEventListener('click', () => toggleFavorite(recipe.id));
    document.getElementById('markCookedBtn').addEventListener('click', () => logCookedMeal(recipe));

    if (isFallback) {
        document.getElementById('fallbackSurpriseBtn').addEventListener('click', () => renderCard(findMeal(true)));
    }
}

// Inline Expandable Custom Filters Toggle
toggleInlineFiltersBtn.addEventListener('click', () => {
    const isHidden = expandedFiltersPanel.classList.contains('hidden');
    if (isHidden) {
        expandedFiltersPanel.classList.remove('hidden');
        chevronIcon.classList.add('rotate-180');
    } else {
        expandedFiltersPanel.classList.add('hidden');
        chevronIcon.classList.remove('rotate-180');
    }
});

findMealBtn.addEventListener('click', () => {
    renderCard(findMeal(false));
});

surpriseBtn.addEventListener('click', () => {
    renderCard(findMeal(true));
});

// Helper Actions
function toggleFavorite(recipeId) {
    if (favorites.includes(recipeId)) {
        favorites = favorites.filter(id => id !== recipeId);
    } else {
        favorites.push(recipeId);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    updateBadges();

    const currentRecipe = recipes.find(r => r.id === recipeId);
    if (currentRecipe) renderCard({ recipe: currentRecipe, isFallback: false, matchedTraits: [] });
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
        badge.className = "w-7 h-7 bg-slate-200 text-slate-500 font-bold rounded-full flex items-center justify-center text-xs shrink-0";
    } else {
        row.classList.remove('bg-slate-100/70', 'opacity-60');
        text.classList.remove('line-through', 'text-slate-400');
        badge.className = "w-7 h-7 bg-brand-100 text-brand-700 font-bold rounded-full flex items-center justify-center text-xs shrink-0";
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
        tabIng.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 cursor-pointer";
        tabInst.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer";
    } else {
        ingPanel.classList.add('hidden');
        instPanel.classList.remove('hidden');
        tabIng.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer";
        tabInst.className = "flex-1 pb-3 text-sm font-bold text-center border-b-2 border-brand-500 text-brand-600 cursor-pointer";
    }
}

// Drawer Drawer Methods
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

viewFavoritesBtn.addEventListener('click', () => {
    const favoriteRecipes = recipes.filter(r => favorites.includes(r.id));
    let contentHtml = favoriteRecipes.length === 0 
        ? `<div class="text-center py-12 text-slate-400"><p class="font-semibold text-slate-600">No starred recipes yet!</p></div>`
        : favoriteRecipes.map(r => `
            <div onclick="selectRecipeFromDrawer(${r.id})" class="p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border flex items-center justify-between cursor-pointer">
                <div class="flex items-center space-x-3">
                    <span class="text-2xl">${r.emoji}</span>
                    <div><h4 class="font-bold text-slate-800 text-sm">${r.name}</h4><p class="text-xs text-slate-400">${r.course}</p></div>
                </div>
            </div>
        `).join('');

    openDrawer('Starred Dishes', contentHtml);
});

viewHistoryBtn.addEventListener('click', () => {
    let contentHtml = cookingHistory.length === 0
        ? `<div class="text-center py-12 text-slate-400"><p class="font-semibold text-slate-600">No cooking log history</p></div>`
        : cookingHistory.map(entry => `
            <div class="p-3.5 bg-slate-50 rounded-2xl border flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <span class="text-2xl">${entry.emoji}</span>
                    <div><h4 class="font-bold text-slate-800 text-sm">${entry.name}</h4><p class="text-[11px] text-slate-400">${entry.timestamp}</p></div>
                </div>
            </div>
        `).join('');

    const footerHtml = cookingHistory.length > 0 ? `
        <button id="clearHistoryBtn" class="w-full py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-200 cursor-pointer">Clear History</button>
    ` : '';

    openDrawer('Cooking Log', contentHtml, footerHtml);

    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            cookingHistory = [];
            localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
            updateBadges();
            closeDrawer();
        });
    }
});

window.selectRecipeFromDrawer = function(recipeId) {
    const selected = recipes.find(r => r.id === recipeId);
    if (selected) {
        renderCard({ recipe: selected, isFallback: false, matchedTraits: [] });
        closeDrawer();
    }
};

closeDrawerBtn.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

document.addEventListener('DOMContentLoaded', loadRecipes);

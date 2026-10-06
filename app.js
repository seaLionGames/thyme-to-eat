/**
 * ThymeToEat - Application Logic
 */

let recipes = [];
let activeTab = 'ingredients';

// DOM Controls
const cuisineSelect = document.getElementById('cuisineSelect');
const proteinSelect = document.getElementById('proteinSelect');
const styleSelect = document.getElementById('styleSelect');
const difficultySelect = document.getElementById('difficultySelect');
const moodSelect = document.getElementById('moodSelect');
const findMealBtn = document.getElementById('findMealBtn');
const surpriseBtn = document.getElementById('surpriseBtn');
const resultContainer = document.getElementById('resultContainer');

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// 1. Asynchronous Dataset Fetch
async function loadRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        recipes = await response.json();
        
        if (recipes.length > 0) {
            renderCard({ recipe: getRandomItem(recipes), isFallback: false, matchedTraits: [] });
        }
    } catch (error) {
        console.error('Error fetching recipes.json:', error);
        resultContainer.innerHTML = `
            <div class="bg-red-50 text-red-700 rounded-2xl p-6 border border-red-200 text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="font-bold">Failed to load recipes dataset.</p>
                <p class="text-xs mt-1">Make sure you are running a local server (e.g., Live Server) when serving files dynamically via fetch().</p>
            </div>
        `;
    }
}

// 2. Scoring & Matching Filter Engine
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

// Helper: Difficulty Badge Styling
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

// 3. UI Template Card Renderer
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
                        <span>No exact 5/5 match found, but here is a close match based on <strong>${matchedTraitsText}</strong>!</span>
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
                    <span class="px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyBadgeClass(recipe.difficulty)}">
                        ⚡ ${recipe.difficulty}
                    </span>
                    <span class="px-3 py-1 bg-indigo-500/20 text-indigo-100 font-semibold text-xs rounded-full border border-indigo-400/30">
                        ✨ ${recipe.mood}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🌍 ${recipe.cuisine}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🥩 ${recipe.protein}
                    </span>
                    <span class="px-3 py-1 bg-white/20 backdrop-blur-md text-white font-medium text-xs rounded-full border border-white/20">
                        🍽️ ${recipe.baseStyle}
                    </span>
                </div>
            </div>

            <!-- Recipe Description & Tabs -->
            <div class="p-6 sm:p-8">
                <p class="text-slate-600 leading-relaxed mb-6 font-normal">${recipe.description}</p>

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
                                <span id="ing-text-${idx}" class="transition-all duration-200">${ing}</span>
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
                                    ${step}
                                </p>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
        </div>
    `;

    // Tab Listeners
    document.getElementById('tabIngredientsBtn').addEventListener('click', () => switchTab('ingredients'));
    document.getElementById('tabInstructionsBtn').addEventListener('click', () => switchTab('instructions'));
    document.getElementById('resetIngredientsBtn').addEventListener('click', resetIngredients);

    if (isFallback) {
        document.getElementById('fallbackSurpriseBtn').addEventListener('click', () => {
            renderCard(findMeal(true));
        });
    }
}

// 4. Interactive Checklist Logic
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

// 5. Interactive Step Progress Logic
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

// Tab Switching
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

// App Startup
document.addEventListener('DOMContentLoaded', loadRecipes);

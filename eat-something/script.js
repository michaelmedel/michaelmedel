const apiKey = window.EAT_SOMETHING_GOOGLE_MAPS_API_KEY;
const mealButtons = document.querySelectorAll('[data-meal]');
const locationStatus = document.getElementById('location-status');
const results = document.getElementById('results');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const newSearch = document.getElementById('new-search');
const resultsToolbar = document.getElementById('results-toolbar');
const newPicks = document.getElementById('new-picks');
const cuisineFilters = document.querySelectorAll('[data-cuisine]');

const labels = { breakfast: 'breakie', lunch: 'lunchy', dinner: 'dins' };
const SEARCH_RADIUS_METERS = 16093;
const SEARCH_RADII_METERS = [16093, 24140, 32187, 40234, 48280, 64374, 80467];
let selectedMeal = '';
let selectedCuisine = '';
let activeSearchId = 0;
let activeSearchController = null;
const seenPlaceIds = new Set();

mealButtons.forEach((button) => {
  button.addEventListener('click', () => {
    cuisineFilters.forEach((filter) => filter.setAttribute('aria-pressed', 'false'));
    findRestaurants(button.dataset.meal);
  });
});

newPicks.addEventListener('click', () => {
  if (selectedMeal) findRestaurants(selectedMeal, selectedCuisine);
});

cuisineFilters.forEach((button) => {
  button.addEventListener('click', () => {
    cuisineFilters.forEach((filter) => filter.setAttribute('aria-pressed', String(filter === button)));
    if (selectedMeal) findRestaurants(selectedMeal, button.dataset.cuisine);
  });
});

async function findRestaurants(meal, cuisine = '') {
  const searchId = ++activeSearchId;
  activeSearchController?.abort();
  const searchController = new AbortController();
  activeSearchController = searchController;
  selectedMeal = meal;
  selectedCuisine = cuisine.trim();
  mealButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.meal === meal));
    button.disabled = true;
  });
  results.hidden = true;
  emptyState.hidden = true;
  loadingState.hidden = false;
  locationStatus.classList.remove('visually-hidden');
  const cuisineLabel = selectedCuisine;
  locationStatus.textContent = `finding ${cuisineLabel ? `${cuisineLabel} ` : ''}${labels[meal]} near you...`;

  try {
    if (!apiKey) throw new Error('a Google Places API key has not been configured.');
    const location = await getLocation();
    let picks = [];
    let searchRadius = SEARCH_RADIUS_METERS;
    for (const radius of SEARCH_RADII_METERS) {
      searchRadius = radius;
        const places = await searchPlaces(meal, cuisineLabel, location.coords.latitude, location.coords.longitude, radius, searchController.signal);
        if (searchId !== activeSearchId) return;
      picks = choosePicks(places, seenPlaceIds);
      if (picks.length > 0) break;
    }
    if (picks.length === 0) throw new Error('no matching restaurants were found nearby. try another cuisine.');
    if (searchId !== activeSearchId) return;
    renderPicks(picks);
    loadingState.hidden = true;
    picks.forEach((place) => seenPlaceIds.add(place.id));
    locationStatus.textContent = '';
    newSearch.hidden = false;
    resultsToolbar.hidden = false;
  } catch (error) {
    if (searchId !== activeSearchId || error.name === 'AbortError') return;
    loadingState.hidden = true;
    locationStatus.textContent = error.message || 'unable to find restaurants right now.';
    emptyState.hidden = false;
  } finally {
    if (searchId === activeSearchId) {
      loadingState.hidden = true;
      mealButtons.forEach((button) => { button.disabled = false; });
      activeSearchController = null;
    }
  }
}

async function getLocation() {
  try {
    return await getPreciseLocation();
  } catch {
    throw new Error('allow location access for accurate picks near you.');
  }
}

function getPreciseLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('location is not available in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000
  }));
}

async function searchPlaces(meal, cuisine, latitude, longitude, searchRadius, signal) {
  const mealQuery = cuisine === 'Coffee shops' ? 'coffee shops' : cuisine ? `${cuisine} ${meal} restaurants` : `${meal} restaurants`;
  const cuisineQuery = cuisine === 'Coffee shops' ? 'coffee shops' : `${cuisine} restaurants`;
  const queries = [mealQuery];
  if (cuisine) queries.push(cuisineQuery);
  const places = (await Promise.all(queries.map((query) => placesForQuery(query, signal))))
    .flat()
    .reduce((unique, place) => unique.set(place.id, place), new Map());
  const searches = [{ tier: null, places: [...places.values()] }];

  return cuisine ? filterCuisineMatches(searches, cuisine) : searches;

  async function filterCuisineMatches(tieredSearches, selectedCuisine) {
    const uniquePlaces = new Map();
    tieredSearches.forEach(({ tier, places }) => places.forEach((place) => {
      if (!uniquePlaces.has(place.id)) uniquePlaces.set(place.id, { place, tier });
    }));
    const candidates = [...uniquePlaces.values()]
      .sort((first, second) => (second.place.rating - first.place.rating) || ((second.place.userRatingCount || 0) - (first.place.userRatingCount || 0)))
      .slice(0, 12)
      .map(({ place }) => ({
        id: place.id,
        name: place.displayName?.text,
        types: place.types,
        address: place.formattedAddress,
        description: place.editorialSummary?.text
      }));
    try {
      const classifierController = new AbortController();
      const timeout = setTimeout(() => classifierController.abort(), 4000);
      const response = await fetch('/api/classify-cuisine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuisine: selectedCuisine, places: candidates }),
        signal: classifierController.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return tieredSearches;
      const { matches } = await response.json();
      if (!Array.isArray(matches) || matches.length === 0) return tieredSearches;
      const confidenceById = new Map(matches.filter((match) => match.confidence >= 0.58).map((match) => [match.id, match.confidence]));
      return tieredSearches.map(({ tier, places }) => ({
        tier,
        places: places.filter((place) => confidenceById.has(place.id)).map((place) => ({
          ...place,
          cuisineConfidence: confidenceById.get(place.id)
        }))
      }));
    } catch {
      return tieredSearches;
    }
  }

  async function placesForQuery(textQuery, requestSignal) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.editorialSummary'
      },
      signal: requestSignal,
      body: JSON.stringify({
        textQuery,
        locationRestriction: locationRestriction(latitude, longitude, searchRadius),
        maxResultCount: 20
      })
    });
    if (!response.ok) throw new Error('restaurant search is unavailable. check the Google Places API key.');
    const data = await response.json();
    return (data.places || []).filter((place) => place.rating && place.location && distanceInMeters(latitude, longitude, place.location.latitude, place.location.longitude) <= searchRadius);
  }
}

function distanceInMeters(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(firstLatitude)) * Math.cos(toRadians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function locationRestriction(latitude, longitude, searchRadius) {
  const latitudeOffset = searchRadius / 111320;
  const longitudeOffset = searchRadius / (111320 * Math.cos(latitude * Math.PI / 180));
  return {
    rectangle: {
      low: { latitude: latitude - latitudeOffset, longitude: longitude - longitudeOffset },
      high: { latitude: latitude + latitudeOffset, longitude: longitude + longitudeOffset }
    }
  };
}

function priceGroup(place) {
  const level = place.priceLevel || 'PRICE_LEVEL_UNSPECIFIED';
  if (['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE'].includes(level)) return '$';
  if (level === 'PRICE_LEVEL_MODERATE') return '$$';
  return '$$$';
}

function choosePicks(tieredSearches, excludedIds) {
  const rankedByTier = tieredSearches.map(({ tier, places }) => {
    const ranked = [...places].sort((first, second) => (second.rating - first.rating) || ((second.userRatingCount || 0) - (first.userRatingCount || 0)));
    return ranked.filter((place) => !excludedIds.has(place.id)).map((place) => ({ ...place, selectedTier: tier || priceGroup(place) }));
  });
  const allPlaces = rankedByTier.flat();
  const picks = [];
  const selectedIds = new Set();

  ['$', '$$', '$$$'].forEach((tier) => {
    const pick = allPlaces.find((place) => place.selectedTier === tier && !selectedIds.has(place.id));
    if (pick) {
      picks.push(pick);
      selectedIds.add(pick.id);
    }
  });

  allPlaces
    .filter((place) => !selectedIds.has(place.id))
    .sort((first, second) => (second.rating - first.rating) || ((second.userRatingCount || 0) - (first.userRatingCount || 0)))
    .slice(0, 5 - picks.length)
    .forEach((place) => picks.push(place));

  return picks.sort((first, second) => (second.rating - first.rating) || ((second.userRatingCount || 0) - (first.userRatingCount || 0)));
}

function renderPicks(picks) {
  results.dataset.count = String(picks.length);
  results.replaceChildren(...picks.map((place) => {
    const button = document.createElement('button');
    button.className = 'restaurant';
    button.type = 'button';
    button.innerHTML = `<span class="price">${place.selectedTier || priceGroup(place)}</span><span><strong class="restaurant-name"></strong><span class="restaurant-meta"></span></span>`;
    button.querySelector('.restaurant-name').textContent = place.displayName.text;
    button.querySelector('.restaurant-meta').textContent = `${place.rating.toFixed(1)} stars · ${place.formattedAddress}`;
    button.addEventListener('click', () => openMap(place));
    return button;
  }));
  results.hidden = false;
}

function openMap(place) {
  const { latitude, longitude } = place.location;
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${encodeURIComponent(place.id)}`;
  window.open(url, '_blank', 'noopener');
}
const apiKey = window.EAT_SOMETHING_GOOGLE_MAPS_API_KEY;
const mealButtons = document.querySelectorAll('[data-meal]');
const locationStatus = document.getElementById('location-status');
const results = document.getElementById('results');
const emptyState = document.getElementById('empty-state');

const labels = { breakfast: 'breakie', lunch: 'lunchy', dinner: 'dins' };
const SEARCH_RADIUS_METERS = 16093;

mealButtons.forEach((button) => {
  button.addEventListener('click', () => findRestaurants(button.dataset.meal));
});

async function findRestaurants(meal) {
  mealButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.meal === meal));
    button.disabled = true;
  });
  results.hidden = true;
  emptyState.hidden = true;
  locationStatus.classList.remove('visually-hidden');
  locationStatus.textContent = `finding ${labels[meal]} near you...`;

  try {
    if (!apiKey) throw new Error('a Google Places API key has not been configured.');
    const location = await getLocation();
    const places = await searchPlaces(meal, location.coords.latitude, location.coords.longitude);
    const picks = choosePicks(places);
    if (picks.length < 3) throw new Error('not enough rated restaurants were found nearby. try another meal.');
    renderPicks(picks);
    locationStatus.textContent = `three highly rated ${labels[meal]} spots near you.`;
  } catch (error) {
    locationStatus.textContent = error.message || 'unable to find restaurants right now.';
    emptyState.hidden = false;
  } finally {
    mealButtons.forEach((button) => { button.disabled = false; });
  }
}

function getLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('location is not available in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => {
    reject(new Error('allow location access to get accurate picks within 10 miles.'));
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }));
}

async function searchPlaces(meal, latitude, longitude) {
  const tiers = {
    '$$$': ['PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'],
    '$$': ['PRICE_LEVEL_MODERATE'],
    '$': ['PRICE_LEVEL_INEXPENSIVE']
  };
  const searches = await Promise.all(Object.entries(tiers).map(async ([tier, priceLevels]) => {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel'
      },
      body: JSON.stringify({
        textQuery: `best rated ${meal} restaurants`,
        locationRestriction: locationRestriction(latitude, longitude),
        priceLevels,
        maxResultCount: 20
      })
    });
    if (!response.ok) throw new Error('restaurant search is unavailable. check the Google Places API key.');
    const data = await response.json();
    return { tier, places: (data.places || []).filter((place) => place.rating && place.location && distanceInMeters(latitude, longitude, place.location.latitude, place.location.longitude) <= SEARCH_RADIUS_METERS) };
  }));
  return searches;
}

function distanceInMeters(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(firstLatitude)) * Math.cos(toRadians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function locationRestriction(latitude, longitude) {
  const latitudeOffset = SEARCH_RADIUS_METERS / 111320;
  const longitudeOffset = SEARCH_RADIUS_METERS / (111320 * Math.cos(latitude * Math.PI / 180));
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

function choosePicks(tieredSearches) {
  return tieredSearches.map(({ tier, places }) => {
    const ranked = [...places].sort((first, second) => (second.rating - first.rating) || ((second.userRatingCount || 0) - (first.userRatingCount || 0)));
    return ranked[0] && { ...ranked[0], selectedTier: tier };
  }).filter(Boolean);
}

function renderPicks(picks) {
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
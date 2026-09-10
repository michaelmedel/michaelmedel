const apiKey = window.EAT_SOMETHING_GOOGLE_MAPS_API_KEY;
const mealButtons = document.querySelectorAll('[data-meal]');
const locationStatus = document.getElementById('location-status');
const results = document.getElementById('results');
const emptyState = document.getElementById('empty-state');

const labels = { breakfast: 'Breakie', lunch: 'Lunchy', dinner: 'Dins' };

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
  locationStatus.textContent = `Finding ${labels[meal].toLowerCase()} near you...`;

  try {
    if (!apiKey) throw new Error('A Google Places API key has not been configured.');
    const position = await getLocation();
    const places = await searchPlaces(meal, position.coords.latitude, position.coords.longitude);
    const picks = choosePicks(places);
    if (picks.length < 3) throw new Error('Not enough rated restaurants were found nearby. Try another meal.');
    renderPicks(picks);
    locationStatus.textContent = `Three highly rated ${labels[meal].toLowerCase()} spots near you.`;
  } catch (error) {
    locationStatus.textContent = error.message || 'Unable to find restaurants right now.';
    emptyState.hidden = false;
  } finally {
    mealButtons.forEach((button) => { button.disabled = false; });
  }
}

function getLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('Location is not available in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => {
    reject(new Error('Location permission is needed to find restaurants near you.'));
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }));
}

async function searchPlaces(meal, latitude, longitude) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel'
    },
    body: JSON.stringify({
      textQuery: `best rated ${meal} restaurants`,
      locationBias: { circle: { center: { latitude, longitude }, radius: 5000 } },
      maxResultCount: 20
    })
  });
  if (!response.ok) throw new Error('Restaurant search is unavailable. Check the Google Places API key.');
  const data = await response.json();
  return (data.places || []).filter((place) => place.rating && place.location);
}

function priceGroup(place) {
  const level = place.priceLevel || 'PRICE_LEVEL_UNSPECIFIED';
  if (['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE'].includes(level)) return 'Low';
  if (level === 'PRICE_LEVEL_MODERATE') return 'Medium';
  return 'High';
}

function choosePicks(places) {
  const ranked = [...places].sort((first, second) => (second.rating - first.rating) || ((second.userRatingCount || 0) - (first.userRatingCount || 0)));
  const selected = [];
  ['Low', 'Medium', 'High'].forEach((group) => {
    const match = ranked.find((place) => priceGroup(place) === group && !selected.includes(place));
    if (match) selected.push(match);
  });
  return selected;
}

function renderPicks(picks) {
  results.replaceChildren(...picks.map((place) => {
    const button = document.createElement('button');
    button.className = 'restaurant';
    button.type = 'button';
    button.innerHTML = `<span class="price">${priceGroup(place)}</span><span><strong class="restaurant-name"></strong><span class="restaurant-meta"></span></span><span class="map-cue" aria-hidden="true">&#8599;</span>`;
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
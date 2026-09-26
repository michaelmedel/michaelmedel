const MODEL_URL = 'https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli';

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method not allowed' });
  if (!process.env.HUGGINGFACE_API_TOKEN) return response.status(503).json({ error: 'cuisine classifier is not configured' });

  const { cuisine, places } = request.body || {};
  if (!cuisine || !Array.isArray(places) || places.length === 0) {
    return response.status(400).json({ error: 'cuisine and places are required' });
  }

  const candidates = places.slice(0, 30);
  const labels = [`${cuisine} cuisine`, 'other cuisine'];
  const inputs = candidates.map((place) => [place.name, ...(place.types || []), place.address, place.description]
    .filter(Boolean)
    .join('. '));
  const classifierResponse = await fetch(MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inputs, parameters: { candidate_labels: labels, multi_label: false } })
  });
  if (!classifierResponse.ok) return response.status(200).json({ matches: [] });
  const prediction = await classifierResponse.json();
  const results = candidates.map((place, index) => {
    const item = prediction[index];
    const predictionList = Array.isArray(item) ? item : null;
    const cuisinePrediction = predictionList?.find((entry) => entry.label === labels[0]);
    const cuisineIndex = item?.labels?.indexOf(labels[0]);
    const confidence = cuisinePrediction?.score ?? (cuisineIndex >= 0 ? item.scores[cuisineIndex] : 0);
    return Number.isFinite(confidence) ? { id: place.id, confidence } : null;
  });

  const matches = results.filter(Boolean);
  return response.status(200).json({ matches });
}

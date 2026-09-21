/**
 * Shape that the object returned from this file
 * @typedef {Object} ResolvedPlace
 * @property {string} placeID - Google's permanent ID for the place
 * @property {string} name - The place's official name on Google
 * @property {string} address - Formatted address
 * @property {string} mapsUrl - Link that opens the place in Google Maps
 */

//Address of Text Search
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

//Which fields Google sends back. Google bills by the fields you ask for and is required which decides the price too. 
const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.googleMapsUri',
].join(',');

const TIMEOUT_MS = 10000;

/**
 * Find the real Google place that best matches an extracted place. 
 * @param {{placeName: string, area: string}} place
 * @returns {Promise<ResolvedPlace|null>} null when Google has no match
 */

async function resolvePlace({placeName, area, address = ''}){
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if(!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY in .env');

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
            textQuery: [placeName, address, area].filter(Boolean).join(' '),
            pageSize: 1,
            //Asks google for only its single best match
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    //False when any kind of error happens: throw error 
    if(!response.ok){
        const body = await response.json().catch(() => ({})); //Covers any odd case where the error body isn't JSON at all
        const reason = body.error?.message || response.statusText;
        throw new Error(`Google Places ${response.status}: ${reason}`);
    }

    const data = await response.json();
    const top = data.places?.[0];
    if (!top) return null; //If no matches return null

    return{
        placeId: top.id,
        name:top.displayName?.text ?? placeName,
        address:top.formattedAddress ?? '',
        mapsUrl: top.googleMapsUri,
    };
}

module.exports = {resolvePlace};
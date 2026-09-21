const Anthropic = require('@anthropic-ai/sdk');

/**
 * @typedef {Object} ExtractedPlace
 * @property {string} placeName  What the text calls the place
 * @property {string} area       Neighbourhood or city, if the text says so (else '')
 * @property {string} address    Street address, if the text gives one (else '')
 * @property {string} category   One of the categories in PLACES_SCHEMA
 */

const MODEL = 'claude-sonnet-5';
const MAX_PLACES = 10;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You extract real-world places from a social media caption or chat message, and from any images that come with it: screenshots of a post, or frames taken at intervals from a screen recording.

Rules:
- Return every specific, named place the text recommends or points to, in the order they appear. A list or itinerary gives several places; a single mention gives one.
- Use only what the text or the images actually state. Never guess a place from a URL, a hashtag mood, how a building looks, or your own knowledge.
- Read the words visible in images the same way as written text: on-screen captions, text overlays, location tags (a pin icon and a place name, usually under the poster's username), map labels, and comments that name the place.
- Several frames from one video often show the same place. List each place once.
- Ignore the app's own interface: usernames, buttons, ads and recommendations.
- If there is no specific named place (chatter, a bare link, a general vibe, or only a city or neighbourhood name), return an empty list.
- Skip any place the text says is closed.
- "area" is the neighbourhood or city stated in the text. If it is given once for the whole list, such as in a title or a location hashtag like #dtla, use it for every place. If the text doesn't say, leave it empty.
- "address" is the street address the text gives for that place. If it gives none, leave it empty.
- Pick the closest category; use "other" if unsure.`;

const PLACES_SCHEMA = {
  type: 'object',
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          place_name: { type: 'string' },
          area: { type: 'string' },
          address: { type: 'string' },
          category: {
            type: 'string',
            enum: ['restaurant', 'cafe', 'bar', 'attraction', 'shop', 'other'],
          },
        },
        required: ['place_name', 'area', 'address', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['places'],
  additionalProperties: false,
};

/**
 * @typedef {Object} ImageInput
 * @property {string} mediaType  'image/jpeg', 'image/png', 'image/gif' or 'image/webp'
 * @property {Buffer} data       The image file's bytes
 */

// The API rejects an empty text block, so an upload with no caption gets a stand-in sentence.
const NO_TEXT_NOTE = 'There is no message text. Read the place names from the images.';

/**
 * Find the places a piece of text, and any images with it, name.
 * @param {string} text
 * @param {ImageInput[]} [images]
 * @returns {Promise<ExtractedPlace[]>} an empty list when nothing names a place
 */
async function extractPlaces(text, images = []) {
  // Claude reads images best when they come before the text.
  const content = [
    ...images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data.toString('base64') },
    })),
    { type: 'text', text: text.trim() || NO_TEXT_NOTE },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: {
      format: { type: 'json_schema', schema: PLACES_SCHEMA },
    },
  });

  const block = response.content.find((b) => b.type === 'text');
  const result = JSON.parse(block.text);

  return result.places.slice(0, MAX_PLACES).map((p) => ({
    placeName: p.place_name,
    area: p.area,
    address: p.address,
    category: p.category,
  }));
}

module.exports = { extractPlaces };
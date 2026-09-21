const { cleanSlackText, mightContainPlace } = require('./text');
const { addLinkCaptions } = require('./links');
const { toImages } = require('./media');
const { extractPlaces } = require('./extract');
const { resolvePlace } = require('./resolve');
const {apifyEnabled, fetchPosts} = require('./apify');

/**
 * @typedef {import('./resolve').ResolvedPlace} ResolvedPlace
 *
 * @typedef {(
 *   { status: 'found', places: ResolvedPlace[], missing: string[] } |
 *   { status: 'not_found', missing: string[] } |
 *   { status: 'needs_text' } |
 *   { status: 'ignored' }
 * )} PipelineResult
 */

//The ceap check, then Claude: skip the paid call only when there is neither readable text nor an image. 
async function findPlaces(text, images){
    const worthAsking = mightContainPlace(text) || images.length > 0;
    return worthAsking ? extractPlaces(text, images):[];
}

/**
 * Everything between "Slack gave us a message" and "here is what to say back".
 * Knows nothing about Slack. Throws if Claude, Google, ffmpeg or the network fails;
 * the caller decides what the channel sees.
 * @param {string} rawText  message.text exactly as Slack sent it
 * @param {{ name: string, mediaType: string, data: Buffer }[]} [files]  downloaded images and videos
 * @returns {Promise<PipelineResult>}
 */
async function processMessage(rawText = '', files = [], notify = async()=>{}) {
  const cleaned = cleanSlackText(rawText);
  const { text, socialLinks } = await addLinkCaptions(cleaned);
  const uploaded = await toImages(files);

  //First try only what costs nothing: the message, TikTOk captions, and uploaded images. 
  let extracted = await findPlaces(text, uploaded);

  //Only if that found nothing, fetch the post itself from its link. 
  if (extracted.length === 0 && socialLinks.length > 0 && apifyEnabled()) {
    // A link or an upload with no usable place is worth a reply; chatter is not.
    await notify('Reading that link. This can take up to a minute.');
    const posts = await fetchPosts(socialLinks);

    if(posts.length > 0){
        const fromLinks = await toImages(posts.flatMap((post) => post.files));
        const fuller = [text, ...posts.map((post) => post.text)].filter(Boolean).join('\n\n');
        extracted = await findPlaces(fuller, [...uploaded, ...fromLinks]);
    }
    }

  const results = await Promise.all(extracted.map(resolvePlace));
  const places = results.filter(Boolean);
  const missing = extracted.filter((_, i) => !results[i]).map((p) => p.placeName);

  if (places.length === 0) return { status: 'not_found', missing };
  return { status: 'found', places, missing };
}

module.exports = { processMessage };
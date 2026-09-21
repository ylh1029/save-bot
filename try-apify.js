require('dotenv').config();
const fs = require('fs');
const { apifyEnabled, fetchRawItem, fetchPosts } = require('./apify');
const { toImages, DEFAULTS } = require('./media');
const { extractPlaces } = require('./extract');

// Options that override how a video is cut, so you can experiment without editing media.js.
const FLAGS = { '--every': 'secondsPerFrame', '--min': 'minFrames', '--max': 'maxFrames', '--edge': 'maxEdge' };

const options = {};
const words = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (FLAGS[args[i]]) {
    const value = Number(args[++i]);
    if (!(value > 0)) {
      console.log(`${args[i - 1]} needs a number above 0`);
      process.exit(1);
    }
    options[FLAGS[args[i - 1]]] = value;
  } else {
    words.push(args[i]);
  }
}

const [url] = words;
if (!url) {
  console.log('Usage: node try-apify.js "https://www.instagram.com/reel/..." [--every 1.5] [--min 4] [--max 30] [--edge 1024]');
  process.exit(1);
}
if (!apifyEnabled()) {
  console.log('APIFY_TOKEN is missing from .env');
  process.exit(1);
}

// Shorten long values (signed links, long lists) so the printout stays readable.
function preview(value) {
  if (typeof value === 'string') return value.length > 110 ? `${value.slice(0, 110)}... (${value.length} characters)` : value;
  if (Array.isArray(value)) return value.length > 4 ? [...value.slice(0, 4).map(preview), `... (${value.length} items)`] : value.map(preview);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, preview(v)]));
  return value;
}

(async () => {
  console.log('\n1. WHAT APIFY RETURNED (raw, shortened)');
  const item = await fetchRawItem(url);
  console.log(item ? JSON.stringify(preview(item), null, 2) : '(nothing)');

  console.log('\n2. WHAT MAPBOT MAKES OF IT');
  const [post] = await fetchPosts([url]);
  if (!post) return console.log('(nothing usable)');
  console.log('text:\n' + (post.text || '(none)'));
  for (const file of post.files) console.log(`file: ${file.mediaType}, ${(file.data.length / 1024).toFixed(0)} KB`);

  const settings = { ...DEFAULTS, ...options };
  console.log('\nframe settings:', JSON.stringify(settings));
  const images = await toImages(post.files, options);

  // Claude reads an image in 28 by 28 pixel patches, one token each. This assumes a 9:16 phone video.
  const edge = Math.min(settings.maxEdge, 1568);
  const perFrame = Math.ceil((edge * 9) / 16 / 28) * Math.ceil(edge / 28);
  fs.rmSync('frames-preview', { recursive: true, force: true }); // so frames from an earlier run don't linger
  fs.mkdirSync('frames-preview', { recursive: true });
  images.forEach((image, i) => {
    const extension = image.mediaType.split('/')[1].replace('jpeg', 'jpg');
    fs.writeFileSync(`frames-preview/link-${String(i + 1).padStart(2, '0')}.${extension}`, image.data);
  });
  console.log(`${images.length} image(s) would be sent to Claude, roughly ${perFrame} tokens each if they are frames of a 9:16 video; saved in frames-preview as link-01, link-02, ...`);

  console.log('\n3. WHAT CLAUDE FINDS IN THE CAPTION AND THE FRAMES');
  const places = await extractPlaces(post.text, images);
  if (places.length === 0) return console.log('places: (none named)');
  for (const place of places) console.log(' -', place.placeName, '|', place.area, '|', place.address);
})().catch((error) => console.error('ERROR:', error.message));

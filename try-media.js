
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { toImages, DEFAULTS } = require('./media');
const { extractPlaces } = require('./extract');

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

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

const [file, note = ''] = words;
if (!file) {
  console.log('Usage: node try-media.js path/to/file ["optional message text"] [--every 1.5] [--min 4] [--max 30] [--edge 1024]');
  process.exit(1);
}

(async () => {
  const mediaType = TYPES[path.extname(file).toLowerCase()];
  if (!mediaType) throw new Error(`Don't know the file type of ${file}`);

  const settings = { ...DEFAULTS, ...options };
  console.log('settings:', JSON.stringify(settings));

  const images = await toImages([{ name: path.basename(file), mediaType, data: fs.readFileSync(file) }], options);

  // Claude reads an image in 28 by 28 pixel patches, one token each. This assumes a 9:16 phone video.
  const edge = Math.min(settings.maxEdge, 1568);
  const perFrame = Math.ceil((edge * 9) / 16 / 28) * Math.ceil(edge / 28);
  console.log(`${images.length} image(s) will be sent to Claude`);
  if (mediaType.startsWith('video/')) console.log(`roughly ${perFrame} tokens per frame, ${images.length * perFrame} in all (assuming a 9:16 video)`);

  // Save what Claude will see, so you can look at the same pictures.
  fs.rmSync('frames-preview', { recursive: true, force: true }); // so frames from an earlier run don't linger
  fs.mkdirSync('frames-preview', { recursive: true });
  images.forEach((image, i) => {
    const extension = image.mediaType.split('/')[1].replace('jpeg', 'jpg');
    fs.writeFileSync(path.join('frames-preview', `${String(i + 1).padStart(2, '0')}.${extension}`), image.data);
  });
  console.log('Saved to the frames-preview folder');

  const places = await extractPlaces(note, images);
  if (places.length === 0) return console.log('places: (none named)');
  for (const place of places) console.log(' -', place.placeName, '|', place.area, '|', place.address);
})().catch((error) => console.error('ERROR:', error.message));
require('dotenv').config();
const fs = require('fs');
const { addLinkCaptions } = require('./links');
const { extractPlaces } = require('./extract');

const urls = fs.readFileSync('links.txt', 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);

(async () => {
  let readable = 0;
  let withPlaces = 0;

  for (const url of urls) {
    console.log('\nLINK:', url);
    const { text } = await addLinkCaptions(url);
    const caption = text.slice(url.length).trim();

    if (!caption) {
      console.log('  caption: (could not read)');
      continue;
    }
    readable += 1;
    console.log('  caption:', caption);

    const places = await extractPlaces(text);
    if (places.length === 0) {
      console.log('  places:  (none named)');
      continue;
    }
    withPlaces += 1;
    console.log(`  places:  ${places.length} found`);
    for (const place of places) console.log('   -', place.placeName, '|', place.area, '|', place.address);
  }

  console.log(`\n${urls.length} links, ${readable} readable, ${withPlaces} name at least one place`);
})();
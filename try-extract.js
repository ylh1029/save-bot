require('dotenv').config();
const { extractPlaces } = require('./extract');

const captions = [
  "Katz's Delicatessen on the Lower East Side is worth the line. Get the pastrami. #nyc",
  'Kyoto trip: matcha at Ippodo Tea, then sunrise at Fushimi Inari',
  'Walkable Date Idea in DTLA: -Tilt Coffee -Scandal Clay (Update: they are closed so you can visit Pottery Studio 1 nearby instead for a class) -Yuko Kitchen -The Last Bookstore #thingstodoinla #ladateideas #dtla',
  'this sunset though 😍 #vibes',
  '<https://www.instagram.com/reel/abc123/>',
];

(async () => {
  for (const caption of captions) {
    console.log('\nCAPTION:', caption);
    console.log(await extractPlaces(caption));
  }
})();
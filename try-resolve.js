require('dotenv').config();
const { resolvePlace } = require('./resolve');

const places = [
  { placeName: "Katz's Delicatessen", area: 'Lower East Side' },
  { placeName: 'Ippodo Tea', area: 'Kyoto' },
  { placeName: 'Katz Deli', area: 'New York' },
  { placeName: "Joe's Pizza", area: '' },
  { placeName: 'Blorptastic Noodle Emporium', area: 'Springfield' },
];

(async () => {
  for (const place of places) {
    console.log('\nLOOKING UP:', place.placeName, '|', place.area || '(no area)');
    console.log(await resolvePlace(place));
  }
})();
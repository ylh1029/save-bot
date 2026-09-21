const { formatReply } = require('./replies');

const katz = {
  placeId: 'a',
  name: "Katz's Delicatessen",
  address: '205 E Houston St, New York, NY 10002, USA',
  mapsUrl: 'https://maps.google.com/?cid=1',
};
const benJerry = { placeId: 'b', name: "Ben & Jerry's <Original>", address: '', mapsUrl: 'https://maps.google.com/?cid=2' };

const samples = [
  ['one place', { status: 'found', places: [katz], missing: [] }],
  ['two places, one not matched', { status: 'found', places: [katz, benJerry], missing: ['Fushimi Inari'] }],
  ['nothing matched', { status: 'not_found', missing: ['Blorptastic Noodle Emporium'] }],
  ['a link with no place', { status: 'needs_text' }],
  ['chatter', { status: 'ignored' }],
];

for (const [label, result] of samples) {
  console.log(`\n--- ${label} (${result.status}) ---`);
  console.log(formatReply(result) ?? '(no reply)');
}
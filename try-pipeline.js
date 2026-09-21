require('dotenv').config();
const { processMessage } = require('./pipeline');

// Each sample is written the way Slack really sends it: links wrapped in < >.
const samples = [
  ["Katz's Delicatessen on the Lower East Side is unreal", 'a place in plain text'],
  ['Ippodo Tea in Kyoto, then Fushimi Inari the next morning', 'two places in one message'],
  ['<https://www.instagram.com/reel/C1abc23xyz/>', 'a bare Instagram link'],
  ['<https://www.instagram.com/reel/C1abc23xyz/|this cafe> Blue Bottle Coffee in Kyoto', 'an Instagram link with a note'],
  ['lol', 'chatter'],
  ['<@U01ABCDEF> lunch tomorrow?', 'chatter with a mention'],
  ['Blorptastic Noodle Emporium in Springfield', 'a place that does not exist'],
];

// Optional: node try-pipeline.js "https://vt.tiktok.com/..." adds a real link
if (process.argv[2]) samples.push([`<${process.argv[2]}>`, 'your real link']);

(async () => {
  for (const [message, label] of samples) {
    console.log(`\n${label.toUpperCase()}\n  in:     ${message}`);
    try {
      const result = await processMessage(message);
      console.log('  status: ', result.status);
      for (const p of result.places ?? []) console.log('   +', p.name, '|', p.address, '\n    ', p.mapsUrl);
      if (result.missing?.length) console.log('   not matched:', result.missing.join(', '));
    } catch (error) {
      console.log('  ERROR:  ', error.message);
    }
  }
})();
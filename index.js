require('dotenv').config();
const { App } = require('@slack/bolt');
const { processMessage } = require('./pipeline');
const { formatReply } = require('./replies');
const { downloadSlackFiles } = require('./slackFiles');
const {apifyEnabled} = require('./apify');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.message(async ({ message, say }) => {
  // Ignore the bot's own replies (otherwise it would answer itself forever) and
  // system messages such as edits and joins. A message with a file has the
  // 'file_share' subtype, which we do want.
  if (message.bot_id) return;
  if (message.subtype && message.subtype !== 'file_share') return;

  const text = message.text ?? '';
  const attached = message.files ?? [];
  if (!text && attached.length === 0) return;

  const threadTs = message.thread_ms ?? message.ts;
  const post = (reply) => say({text: reply, thread_ts: threadTs, unfurl_links: false, unfurl_media: false});

  try {
    const files = await downloadSlackFiles(attached, process.env.SLACK_BOT_TOKEN);
    const result = await processMessage(text, files, post);
    console.log(`[${result.status}]`, files.length ? `(+${files.length} file)` : '', text.slice(0, 80));

    const reply = formatReply(result);
    if (!reply) return;

    await post(reply);
  } catch (error) {
    // A failure goes in the terminal, not the channel.
    console.error('Could not process message:', error);
  }
});

(async () => {
  await app.start();
  console.log('MapBot is connected (Socket Mode)');
  console.log(`Reading posts from links: ${apifyEnabled() ? 'on' : 'off (no APIFY_TOKEN in .env'}`);
})();
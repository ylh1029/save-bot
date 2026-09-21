/**
 * Turn Slack's message markup into plain text. 
 * Slack wraps links, mentions and channels in <> and escapes & <>.
 * @param {string} raw message.text exactly as Slack sent it
 * @returns {string}
 */

function cleanSlackText(raw){
    return raw
    .replace(/<@[^>]+>/g, '') // <@U123> user mention
    .replace(/<#[^>|]+\|([^>]+)>/g, '#$1') // <#C123|general> channel with name
    .replace(/<#[^>|]+>/g, '') // <#C123> channel without name
    .replace(/<!subteam\^[^>|]+\|([^>]+)>/g, '$1') // <!subteam^S123|@team> user group
    .replace(/<![^>]*>/g, '') // <!here>, <!channel>, <!everyone>
    .replace(/<([^>|]+)\|([^>]+)>/g, (_, url, label) => (label === url ? url : `${label} ${url}`)) // <url|label>
    .replace(/<([^>]+)>/g, '$1') // <url>
    .replace(/&lt;/g, '<') // Slack escapes these three characters
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // must be last, or "&amp;lt;" would double-decode
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const MIN_LETTERS = 4;

/**
 * A cheap, deliberately loose check that runs before any paid call. It only
 * rejects text with almost no words in it once links are removed ("lol", "ok", 
 * or a bare link whose caption couldn't be read). Anything else goes to Claude, 
 * whieh is the real judge. A wrongly rejected message is a place silently missed;
 * a wrongly accepted one costs a fraction of a cent. 
 * @param {string} text Cleaned text
 * @returns {boolean}
 */

function mightContainPlace(text){
    const withoutLinks = text.replace(/https?:\/\/\S+/gi, '');
    const letters = withoutLinks.match(/\p{L}/gu) ?? [];
    return letters.length >= MIN_LETTERS;
}

module.exports = {cleanSlackText, mightContainPlace};
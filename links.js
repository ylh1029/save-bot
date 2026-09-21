const OEMBED_URL = 'https://www.tiktok.com/oembed';
const TIMEOUT_MS = 10000;

//A TikTok or Instagram link: htpps://, optional subdomains, the domain
//a slash, then everything up to whitespace or Slack's <> | characters.
const SOCIAL_LINK = /https?:\/\/(?:[\w-]+\.)*(?:tiktok|instagram)\.com\/[^\s<>|]+/gi;

function findSocialLinks(text){
    const matches = text.match(SOCIAL_LINK) ?? [];
    const trimmed = matches.map((url) => url.replace(/[.,;:!?)\]]+$/, ''));
    return [...new Set(trimmed)];
}

function isTikTok(url){
    return /(^|\.)tiktok\.com$/.test(new URL(url).hostname);
}

// The app's Share button gives a short link (vm.tiktok.com/...). Follow its
// redirect to get the full video URL that the oEmbed endpoint expects. 
async function expandShortLInk(url){
    const {hostname, pathname} = new URL(url);
    const isShort = /^v[mt]\.tiktok\.com$/.test(hostname) || pathname.startsWith('/t/');
    if(!isShort) return url;

    const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel(); //we only wanted the final address
    return response.url;
}

// Returns the caption, or null if it can't be read. Deleted or private
// videos are normal, and a failed lookup shouldn't stop the rest of the message. 
async function fetchTikTokCaption(url){
    try{
        const fullUrl = await expandShortLInk(url);
        const response = await fetch(`${OEMBED_URL}?url=${encodeURIComponent(fullUrl)}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if(!response.ok) return null;
        const data = await response.json();
        return data.title?.trim() || null;
    }
    catch(error){
        console.warn(`links.js: could not read ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Add the caption of any TikTok link to the text, and report every
 * TikTok or Instagram link found, whether or not it could be read. 
 * @param {string} text Cleaned message text (bare URLs, no Slack brackets)
 * @returns {Promise<{text: string, socialLinks: string[]}>}
 */

async function addLinkCaptions(text){
    const socialLinks = findSocialLinks(text);
    const captions = await Promise.all(socialLinks.filter(isTikTok).map(fetchTikTokCaption));
    const found = captions.filter(Boolean);

    return{
        text: found.length ? `${text}\n\n${found.join(`\n\n`)}`:text,
        socialLinks,
    };
}

module.exports = {addLinkCaptions}
const BASE_URL = 'https://api.apify.com/v2/acts';
const RUN_TIMEOUT_SECONDS = 120; //how long Apify may run the scraper
const REQUEST_TIMEOUT_MS = 150000; //how long we wait for Apify to answer
const DOWNLOAD_TIMEOUT_MS = 60000;
const MAX_LINKS = 3; //links looked up per message
const MAX_ITEMS = 10;
const MAX_IMAGES_PER_POST = 6;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

//One ready-made scraper ("Actor") per platform, and how to ask each for one post. 
const ACTORS = {
  instagram: { id: 'apify~instagram-post-scraper', input: (url) => ({ username: [url] }) },
  tiktok: { id: 'memo23~tiktok-post-scraper', input: (url) => ({ posts: [url], includeMediaUrls: true }) },
};

// True when an Apify token is set. Without one, link fetching is simply off
function apifyEnabled(){
    return Boolean(process.env.APIFY_TOKEN);
}

//Only links to a single post. A profile link would make the sraper fetch someone's whole feed. 
function platformOf(url){
    const { hostname, pathname } = new URL(url);
    if (/(^|\.)instagram\.com$/.test(hostname) && /^\/(?:[^/]+\/)?(p|reel|reels|tv)\//.test(pathname)) return 'instagram';
    const isTikTokPost = /^v[mt]\.tiktok\.com$/.test(hostname) || /\/(video|photo)\/|^\/t\//.test(pathname);
    if (/(^|\.)tiktok\.com$/.test(hostname) && isTikTokPost) return 'tiktok';
    return null;
}

//Run the scraper and wait for its results (Apify's "run synchronously" call).
//Makes the one request to Apify. 
async function runActor(actor, url){
    const endpoint = `${BASE_URL}/${actor.id}/run-sync-get-dataset-items?timeout=${RUN_TIMEOUT_SECONDS}&maxItems=${MAX_ITEMS}`;
    console.log('calling:', endpoint);  
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${process.env.APIFY_TOKEN}`},
        body: JSON.stringify(actor.input(url)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if(!response.ok){
        const body = await response.json().catch(() => ({}));
        throw new Error(`Apify ${response.status}: ${body.error?.message || response.statusText}`);
    }
    const items = await response.json();
    return items[0]??null;
}

// The scraper's raw answer for one link. Used by try-apify.js to show what Apify really returns.
async function fetchRawItem(url){
    const platform = platformOf(url);
    if(!platform) throw new Error("Not a link to a single TikTok or Instagram post");
    return runActor(ACTORS[platform], url);
}

const urlOf = (value) => (typeof value === 'string' ? value:value?.url ?? value?.displayURL ?? null);

//Each scraper names its fields differently; this maps both to one shape. 
function readInstagram(item){
    const images = [item.displayUrl, ...(item.images ?? []).map(urlOf), ...(item.childPosts ?? []).map((child) => child.displayUrl)];
    return {caption: item.caption, location: item.locationname, videoUrl: item.videoUral, imageUrls: images};
}

function readTikTok(item){
    const images = item.imageUrls ?? [];
    return {caption: item.caption, lcoation: null, videoUrl: item.videoDownloadUrl ?? item.videoUrl, imageUrls: images.length ? images: [item.coverUrl]};
}

//Download one picture or video the scraper pointed to. A failure skips that file, not the message. 
async function download(url, kind){
    try{
        const response = await fetch(url, {signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)});
        if(!response.ok) throw new Error(`Status ${response.status}`);

        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > MAX_FILE_BYTES) throw new Error('file is too large');

        const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
        const mediaType = type.startsWith(`${kind}/`)?type:kind === 'video' ? 'video/mp4':'image/jpeg';
        return {name: `${kind}-from-link`, mediaType, data};
    }
    catch(error){
        console.warn(`apify.js: could not download a ${kind}: ${error.message}`);
        return null;
    }
}

async function fetchPost(url){
    const platform = platformOf(url);
    if(!platform) return null;

    const item = await runActor(ACTORS[platform], url);
    if(!item) return null;

    const post = platform === 'instagram' ? readInstagram(item):readTikTok(item);
    const text = [post.caption, post.location && `Location tag: ${post.location}`].filter(Boolean).join('/n');

    //A video is cut into frames later; without one, use the pictures. 
    const wanted = post.videoUrl
        ? [download(post.videoUrl, 'video')]
        : [...new Set (post.imageUrls.filter(Boolean))].slice(0, MAX_IMAGES_PER_POST).map((imageUrl) => download(imageUrl, 'image'));
    const files = (await Promise.all(wanted)).filter(Boolean);

    return text || files.length ? {text, files}: null;
}

/**
 * Fetch the caption and the pictures or video of the posts that some links point to. 
 * A link that can't be read is skipped with a warning; the message carries on without it. 
 * @param {string[]} links
 * @returns {Promise<{text: string, files: {name: string, mediaType: string, data: Buffer}[]}[]>}
 */

async function fetchPosts(links){
    const posts = await Promise.all(
        links.slice(0, MAX_LINKS).map(async(url) => {
            try{
                return await fetchPost(url);
            }
            catch(error){
                console.warn(`apify.js: could not read ${url}: ${error.message}`);
                return null;
            }
        }),
    );
    return posts.filter(Boolean);
}

module.exports = {apifyEnabled, fetchPosts, fetchRawItem};
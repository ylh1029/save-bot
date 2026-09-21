const MAX_FILES = 3;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 60000;

async function downloadOne(file, token){
    if(file.size > MAX_FILE_BYTES){
        console.warn(`slackFiles.js: skipped ${file.name}, it is larger than ${MAX_FILE_BYTES / 1024/1024} MB`);
        return null;
    }

    const response = await fetch(file.url_private_download, {
        headers: {Authorization: `Bearer ${token}`},
        sigal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if(!response.ok) throw new Error(`Slack file download failed: ${response.status}`);

    //Without permission, Slack answers with a normal-looking web page, not an error. 
    if((response.headers.get('content-type') ?? '').startsWith('text/html')){
        throw new Error('Slack returned a web page instead of the file. Check that the app has the files: read scope and has been reinstalled.');
    }

    return {name: file.name, mediaType: file.mimetype, data: Buffer.from(await response.arrayBuffer())};
}

/**
 * Download the images and videos attached to a Slack message. Other file types are ignored. 
 * @param {object[]} files message.files, exactly as Slack sent it. 
 * @param {strong} token The bot token
 * @returns {Promise<{name: string, mediaType: string. data: Buffer}[]>}
 */

async function downloadSlackFiles(files, token){
    const media = files
    .filter((file) => /^(image|video)\//.test(file.mimetype ?? '') && file.url_private_download)
    .slice(0, MAX_FILES);

    const downloaded = await Promise.all(media.map((file) => downloadOne(file, token)));
    return downloaded.filter(Boolean);
}

module.exports = {downloadSlackFiles};


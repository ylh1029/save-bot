const {execFile} = require('child_process'); //To run another programme
const {promisify} = require('util');
const fs = require('fs/promises'); //To read and write files, and work well with await command
const os = require('os');
const path = require("path");

const run = promisify(execFile); //Node's way of running another programme, in this case, running ffmpeg. 

//Decides which ffmpeg to run: prefers the ffmpeg that the ffmpeg-static package downloads into node_modules (no system install needed)
//Otherwise use an ffmpeg that is installed on the computer. 
function findFfmpeg(){
    try{
        return require("ffmpeg-static") ?? "ffmpeg";
    }
    catch{
        return "ffmpeg";
    }
}
// Try catch is here for cases when the module isn't installed

const FFMPEG = findFfmpeg();

//Settings
const DEFAULTS = {
    secondsPerFrame: 1.5,
    minFrames: 4,
    maxFrames: 30,
    maxEdge: 1024,
}
const HARD_MAX_EDGE = 1568;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 60000; //How long we left ffmpeg run before giving up on it
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']); //Set to check the image type

//Run ffmpeg, and turn "not found" into a message that says what to do. 
async function runFfmpeg(args){
    try{
        return await run(FFMPEG, args, {timeout: FFMPEG_TIMEOUT_MS});
    }
    catch(error){
        //ENOENT is short for "no such file or entry"
        if(error.code === "ENOENT") throw new Error('ffmpeg was not found. In the project folder run: npm install ffmpeg-static');
        throw error;
    }
}

// With no output file, ffmpeg prints the file's details (including things like duration)
// to stderr and then stops with an error. The details are all we want, so the error is expected. 
// We need to get the video's length to spread eight frames evenly. 
async function videoDuration(file){
    let details;
    try{
        await runFfmpeg(['-hide_banner', '-i', file]);
        return 0; //FFmpeg always complains about the missing output. 
    }
    catch(error){
        if(!error.stderr) throw error;
        details = error.stderr
    }

    const match = details.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if(!match) throw new Error('media.js: could not read the length of the video');
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if(!(seconds > 0 )) throw new Error('media.js: could not read the length of the video');
    return seconds;
}

function frameCount(duration, {secondsPerFrame, minFrames, maxFrames}){
    return Math.min(maxFrames, Math.max(minFrames, Math.ceil(duration / secondsPerFrame)));
}

async function videoToFrames(data, settings){
    const edge = Math.min(settings.maxEdge, HARD_MAX_EDGE);
    const resize = `scale='if(gt(iw,ih),min(${edge},iw),-2)':'if(gt(iw,ih),-2,min(${edge},ih))'`;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mapbot-'));
    //mkdtemp makes a fresh temporary folder with random name, and the video is written into it as a file
    try{
        const input = path.join(dir, 'input');
        await fs.writeFile(input, data);

        const duration = await videoDuration(input);
        const count = frameCount(duration, settings);
        for(let i = 0; i < count; i++){
            //THe middle of each of "count" equal parts of the video.
            const seconds = ((i+0.5)*duration)/count;
            await runFfmpeg([
                '-v', 'error',
                '-ss', String(seconds), '-i', input,
                '-frames:v', '1',
                '-vf', resize,
                '-q:v', '3',
                path.join(dir, `frame_${String(i + 1).padStart(2, '0')}.jpg`),
            ]);
        }

        const names = (await fs.readdir(dir)).filter((name) => name.startsWith('frame_')).sort();
        return await Promise.all(
            names.map(async (name) => ({mediaType: 'image/jpeg', data: await fs.readFile(path.join(dir, name)) })),
        );
    } finally{
        //Deletes the files that was made in this process
        await fs.rm(dir, {recursive:true, force:true});
    }
}

/**
 * Turn downloaded filed into images Claude can read. Images pass through;
 * a video is cut into few still frames, because Claude reads images, not video. 
 * @param {{name: string, mediaType: string, data: Buffer}[]} files
 * @param {Partial<typeof DEFAULTS>} [options] overrides for how videos are cut (used by try-media.js)
 * @returns {Promise{<mediaType: string, data: Buffer}[]>}
 */

async function toImages(files, options = {}){
    const settings = {...DEFAULTS, ...options};
    const images = [];
    for (const file of files){
        if(IMAGE_TYPES.has(file.mediaType)){
            if(file.data.length <= MAX_IMAGE_BYTES) images.push({mediaType: file.mediaType, data: file.data});
            else console.warn(`media.js: skipped ${file.name}, the image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
        }
        else if(file.mediaType.startsWith('video/')){
            images.push(...(await videoToFrames(file.data, settings)));
        }
        else{
            console.warn(`media.js: skipped ${file.name}, ${file.mediaType} is not an image or video `);
        }
    }
    return images;
}

module.exports = {toImages, DEFAULTS}


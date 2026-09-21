/**
 * Slack requires these three characters to be escaped in message text. 
 * Otherwise a place called "Ben & Jerry's <Original>" would be read as markup
 */

function escapeSlack(text){
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

//One place as one bullet: the name is the Maps link, the address follows it
// so a person can spot a wrong match at a glance. 
function placeLine(place){
    const link = `<${place.mapsUrl}|${escapeSlack(place.name)}>`;
    return place.address ? `・ ${link}, ${escapeSlack(place.address)}` : `・ ${link}`;
}

/**
 * Turn a pipeline result into the text the bot posts, or null for "say nothing".
 * @param {import('./pipeline').PipelineResult} result
 * @returns {string|null}
 */
function formatReply(result){
    switch(result.status){
        case 'found': {
            const count = result.places.length;
            const intro = count === 1? 'Found it:' : `Found ${count} places`;
            let reply = `${intro}\n${result.places.map(placeLine).join('\n')}`;
            if(result.missing.length > 0){
                reply += `\n\nCouldn't find: ${result.missing.map(escapeSlack).join(', ')}. Reply here with a fuller name or the address and I'll try again.`;
            }  
            return reply;
        }
        case 'not_found':
            return `I couldn't find ${result.missing.map(escapeSlack).join(', ')} on Google Maps. Reply here with a fuller name or the address and I'll try again.`;
        case 'needs_text':
            return "I couldn't find a place in that. Reply here with the place name (and the city if you can) and I'll look it up.";
        default: 
            return null; //Ignored" ordinary chatter, no reply
    }
}

module.exports = {formatReply};
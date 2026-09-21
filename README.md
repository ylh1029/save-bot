# MapBot

A Slack bot that turns a place someone shares in a channel into a tappable Google Maps link. Post a caption, a message, or a TikTok link that mentions a restaurant, cafe or landmark, and the bot replies in-thread with a link that opens that exact place in Google Maps, one tap away from saving it.

The channel itself acts as the shared, searchable record: everyone in it sees every place anyone posts. There is no database and no separate app.

## How it works

```
Slack channel message
        │
        ▼
   index.js        Slack only: ignores bot and system messages, passes the text on
     └─ slackFiles.js  downloads any images or videos attached to the message
        │  raw text, downloaded files
        ▼
   pipeline.js     runs the stages in order and returns a status object
     ├─ text.js      clean Slack formatting; skip messages unlikely to contain a place
     ├─ links.js     TikTok oEmbed: replace a shared TikTok link with its caption
     ├─ apify.js     if nothing was found: the post's caption, location tag and video or pictures, fetched from its link
     ├─ media.js     images pass through; a video is cut into still frames with ffmpeg
     ├─ extract.js   Claude API: text and images → a list of places, each { placeName, area, address, category }
     └─ resolve.js   Google Places API (New): each place → verified place, or null
        │  { status, ... }
        ▼
   replies.js      turns the status into the text of the reply
        │  reply text, or nothing
        ▼
   index.js        posts it in-thread
```

The pipeline returns one of four statuses, and `replies.js` decides what each one means for the channel:

| Status | Meaning | Reply |
|---|---|---|
| `found` | At least one real place was verified | Each place's name, address and Maps link, plus any that could not be matched |
| `not_found` | Claude named places but Google matched none of them | A short note that no match was found |
| `needs_text` | The message has a TikTok or Instagram link, or an uploaded image or video, but no place could be found in it (an unreadable Instagram link, a caption that names no place, or a screenshot showing none) | A request for the place name |
| `ignored` | Ordinary chatter with no place | Nothing |

The design rests on one split: **Claude proposes, Google verifies.** A language model is good at reading a messy caption and naming the place it is about, but it can produce a plausible place that does not exist. Google Places either returns a real place with an ID and address or it does not, so it acts as the fact-check.

## Tech stack

| Layer | Choice | Role |
|---|---|---|
| Runtime | Node.js (CommonJS modules) | Runs the bot; no build step |
| Bot framework | Slack Bolt (`@slack/bolt`) | Receives events, acknowledges them, routes them to handlers |
| Connection | Socket Mode | The bot opens an outbound websocket to Slack, so no public URL, port or web server is needed |
| Link reading | TikTok oEmbed (plain `fetch`) | Reads the caption of a shared TikTok link; needs no key |
| Post reading (optional) | Apify Actors | Fetches the caption, location tag and video or pictures of an Instagram or TikTok post from its link, when the free routes found no place |
| Video frames | ffmpeg, via the `ffmpeg-static` package | Cuts a video into still images, because Claude reads images, not video |
| Extraction | Claude API (`@anthropic-ai/sdk`) | Turns text and images into structured place data using a JSON schema |
| Resolution | Google Places API (New), Text Search | Turns a fuzzy place name into a real place and returns its Maps link |
| Output | Google Maps link (`googleMapsUri`) | Opens the exact place in the Google Maps app |
| Configuration | `dotenv` | Loads secrets from `.env` |

There is no web framework such as Express, because the bot only makes outbound connections and never receives HTTP requests. There is no storage layer: the Slack channel is the record.

## Project structure

```
save-bot/
├── index.js            Slack only: listens, ignores bots, calls the pipeline, posts the reply
├── replies.js          turns a pipeline status into the text of the reply
├── pipeline.js         the Slack-free flow: clean → read links → check → extract → resolve
├── text.js             text helpers: clean Slack formatting, decide if a message is worth checking
├── links.js            TikTok oEmbed: turn a shared link into its caption
├── slackFiles.js       downloads the images and videos attached to a Slack message
├── media.js            turns downloaded files into images Claude can read (ffmpeg for video)
├── apify.js            Apify: fetches the caption, location tag and video or pictures of a post from its link
├── extract.js          Claude API: text → list of { placeName, area, address, category }
├── resolve.js          Google Places: place → { placeId, name, address, mapsUrl }
├── try-extract.js      throwaway script for testing extract.js with sample captions
├── try-resolve.js      throwaway script for testing resolve.js with sample places
├── try-links.js        throwaway script: reads links.txt, prints each link's caption and the place found
├── try-pipeline.js     throwaway script: runs sample messages through the whole pipeline
├── try-replies.js      throwaway script: prints the reply for each status, with no Slack
├── try-apify.js        throwaway script: shows what Apify returns for a link, the frames the bot would send, and the places Claude finds
├── try-media.js        throwaway script: runs an image or recording through media.js and Claude, and saves the frames
├── package.json        dependencies and the `npm start` script
├── package-lock.json   generated by npm; pins exact dependency versions
├── node_modules/       generated by npm; never edited or committed
├── .env                real secrets; never shared or committed
├── .env.example        template listing the required variables, placeholders only
└── .gitignore          keeps node_modules/ and .env out of Git
```

### What each code file is responsible for

**`index.js`** connects to Slack, listens for messages, ignores the bot's own messages, system messages (edits, joins, file uploads) and messages with no text, hands the message text to the pipeline, and posts the reply in a thread under the message. If something fails, it logs the error in the terminal and posts nothing. It knows nothing about prompts, Google endpoints or JSON parsing.

**`replies.js`** holds the wording of every reply as one function: a status in, the reply text (or nothing) out. Each place is a line with its name linked to Google Maps followed by its address, so a wrong match is easy to spot. It knows Slack's text formatting but never calls Slack.

**`pipeline.js`** exposes one function: text (and any files) in, status object out. It cleans the text, replaces readable links with their captions, checks that the result is worth the cost of an API call, extracts a place, and, only if none was found and the message has a post link, fetches that post through `apify.js` and tries again with its caption and pictures. It then resolves the places and reports what happened. It never touches Slack, so it can be tested with a plain string or fed by something other than Slack.

**`text.js`** holds small pure functions that work on text only: removing Slack's formatting (links and mentions wrapped in angle brackets) and a cheap check for whether a message could contain a place at all.

**`links.js`** is the only file that reads content from a shared link. It finds TikTok URLs in the text, asks TikTok's public oEmbed endpoint for each caption, and adds the caption to the text. It reports every TikTok and Instagram link it finds, whether or not it could read the caption, so the pipeline can ask for the place name when nothing usable was found.

**`extract.js`** is the only file that talks to Claude. It holds the prompt, the output schema and the model name. It takes the text and any images, and returns a list of `{ placeName, area, address, category }`, one per place named (at most ten), or an empty list when none is. Places the text says are closed are skipped, and it is told never to guess a place from how something looks.

**`slackFiles.js`** downloads the images and videos attached to a Slack message, using the bot token (the `files:read` permission). It skips other file types, caps a message at three files and each file at 50 MB, and throws a clear error if Slack answers with a web page instead of the file.

**`media.js`** is the only file that runs ffmpeg. It passes supported images (JPEG, PNG, GIF, WebP, up to 5 MB) through unchanged, and cuts a video into frames, about one every 1.5 seconds (at least 4 and at most 30), taken from the middle of equal parts of the video and resized so the longest side is at most 1024 pixels. These settings are in one place in `media.js` and can be tuned with `try-media.js`. Anything else is skipped with a warning.

**`apify.js`** is the only file that talks to Apify, and it is optional: with no `APIFY_TOKEN`, link reading is off. It runs only when the free routes (the message text, the TikTok caption, uploaded images) found no place, and only for links to a single Instagram or TikTok post. It asks a hosted scraper for the post's caption, location tag and video or pictures, downloads them, and hands them on in the same shape as an upload. A failed lookup is a warning, and the message carries on.

**`resolve.js`** is the only file that talks to Google Places. It sends one extracted place (its name, plus the address and area when the text gave them) to Text Search and returns `{ placeId, name, address, mapsUrl }` for the best match, or `null` when nothing matches. The Maps link is the `googleMapsUri` Google returns, not one the bot builds.

**`try-extract.js`** feeds sample captions to `extract.js` so extraction can be tested without Slack. It can be deleted once it is no longer useful.

### Design rules

- **One job per file.** Each file's purpose should be stateable in one sentence without "and".
- **One outside service per file.** Slack is known only to `index.js`, Anthropic only to `extract.js`, Google only to `resolve.js`, TikTok only to `links.js`, Apify only to `apify.js`, ffmpeg only to `media.js`. The one exception is Slack, which `index.js` uses for events and replies and `slackFiles.js` uses only for downloads. Swapping one service touches one file.
- **Dependencies point one way.** `index.js` requires `pipeline.js` and `replies.js`; `pipeline.js` requires `text.js`, `links.js`, `apify.js`, `media.js`, `extract.js` and `resolve.js`. Nothing requires a file above it, and the four service files at the bottom never require each other.
- **Each secret is read in exactly one file**, the one that talks to that service.
- **Cheap checks before paid calls.** Text cleanup and the "could this contain a place" check run before any request to Claude or Google.
- **Functions throw, the handler decides.** Errors travel up to `index.js`, which is the one place that decides what, if anything, the channel should see.

## Setup

### Prerequisites

- Node.js 18 or newer
- A Slack workspace where you can create an app
- An Anthropic API key
- Nothing extra for video: `npm install` also installs the `ffmpeg-static` package, which downloads a copy of ffmpeg for your computer. (If you already have ffmpeg installed, the bot uses that when the package is absent.)
- A Google Cloud project with billing enabled, the Places API (New) turned on, and an API key restricted to that API

### Slack app

1. Create an app at api.slack.com/apps, from scratch.
2. Turn on **Socket Mode** and generate an app-level token with the `connections:write` scope (starts with `xapp-`).
3. Under **OAuth & Permissions**, add the bot scopes `channels:history`, `chat:write` and `files:read` (to download screenshots and recordings). For a private channel, use `groups:history` as well.
4. Under **Event Subscriptions**, enable events and subscribe to the bot event `message.channels` (`message.groups` for a private channel).
5. Install the app to the workspace and copy the Bot User OAuth Token (starts with `xoxb-`).
6. Invite the bot to the channel it should watch. A bot only receives messages from channels it has joined.

After changing scopes or events, reinstall the app for the change to take effect.

### Google Places

1. In Google Cloud Console, create or select a project and enable billing. The Places API (New) has a free monthly allowance, but it requires a billing account.
2. Enable **Places API (New)** under APIs & Services.
3. Create an API key and restrict it to the Places API (New).

The bot requests only the fields it needs (`places.id`, `places.displayName`, `places.formattedAddress`, `places.googleMapsUri`). Google bills by the fields requested, so this keeps each lookup in the lower-cost tier.

### Install and run

```
npm install
npm start
```

The bot works only while this process is running. To keep a record of what it did, and stop a Mac sleeping while it runs:

```
caffeinate -i npm start 2>&1 | tee -a mapbot.log
```

### Configuration

Copy `.env.example` to `.env` and fill in the values.

| Variable | Read in | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | `index.js` | Posting replies as the bot (`xoxb-`) |
| `SLACK_APP_TOKEN` | `index.js` | Opening the Socket Mode websocket (`xapp-`) |
| `ANTHROPIC_API_KEY` | `extract.js` | Calling the Claude API |
| `GOOGLE_PLACES_API_KEY` | `resolve.js` | Calling the Google Places API (New) |
| `APIFY_TOKEN` | `apify.js` | Optional. Fetching Instagram and TikTok posts from their links |

TikTok's oEmbed endpoint is public and needs no key.

`require('dotenv').config()` must be the first line of every entry file. Requiring a file runs it immediately, and `extract.js` reads its key at load time, so the variables have to be loaded before any other file is required.

## What is sent where

Links to Instagram and TikTok posts, when the free routes find no place, are sent to Apify, a third-party service, which fetches the public post; the caption and its pictures or video then go to Claude as below. Message text that could contain a place (anything with a few words in it once links are removed) is sent to Anthropic's Claude API, and so is any screenshot or screen recording someone uploads (a recording as still frames). A screenshot can show more than the place, so people should post ones they are happy to share. The place names Claude finds are sent to Google Places to be looked up. For a TikTok link, the bot also asks TikTok's public oEmbed endpoint for the video's caption. Nothing is stored by the bot apart from the local `mapbot.log` if you choose to keep one, which holds the first part of each message.

## Scope and limitations

- The bot reads text, TikTok captions, and images. A person can upload a screenshot or screen recording to Slack, and the bot reads it as images (a recording is cut into a frame about every 1.5 seconds). This is the dependable route for Instagram, because the bot never has to fetch anything from the platform. It can only read what is visible: a place that is only spoken in a video, text too small to read, or an overlay that appears between two of the sampled frames will be missed.
- Reading a post from its link depends on Apify's scrapers, which read public, logged-out pages. It cannot read private accounts, deleted posts or stories, and a community-run scraper can stop working when TikTok or Instagram change something. When a link cannot be read, the bot asks for the place name or a screenshot.
- A message can yield several places, such as an itinerary or a "top 5" list, up to ten. Each is looked up separately, and the reply lists the matches. Places that only appear in a video's images or speech are not found from the caption; upload a screenshot or recording for the images.
- **TikTok links** are read through TikTok's public oEmbed endpoint, which returns the video's caption. Many captions do not name the place (it may only be on screen or spoken), in which case the bot asks for the place name instead of guessing. Reading a TikTok video's frames or a photo slideshow from its link does not work yet (see Project status).
- **Instagram links** have no official way to retrieve a caption. With an Apify token, the bot fetches the post through Apify's Instagram scraper; without one, a message that is only an Instagram link gets a reply asking for the place name. A link with a note beside it (for example, "this cafe in Kyoto") is processed from the note.
- Slack apps receive the URL in a message but not the link preview Slack displays, so the bot cannot borrow captions from previews.
- Edited messages are not reprocessed. Uploads other than images and videos are ignored, as are files beyond the third in a message and videos over 50 MB.
- Google returns the closest real place to what the bot searched for, so an unusual name can match a similar-looking place. The reply shows the address so this can be spotted.
- The bot runs only while the process is running. Hosting it continuously is not part of this version.
- Google does not offer a public API for adding to a user's Saved Lists, so the bot links to the place and the user saves it themselves in Google Maps.
- Instagram does not expose a personal user's Saved collections through a supported API, so places come from what people share into the channel.
- Single workspace, single channel; access control is "is a member of the channel".

## Project status

Last updated 20 September 2026.

**Tested and working**

- Instagram posts and reels, read from their link through Apify: the caption, the location tag, and the video cut into frames. On a real reel whose places were shown only as on-screen text, Claude named ten places.
- TikTok captions, read through TikTok's public oEmbed endpoint.
- Screenshots and screen recordings uploaded to Slack, read as images (a recording as frames).

**Not working yet**

- TikTok photo slideshows.
- Reading a TikTok video's frames from its link. When a TikTok caption does not name the place, upload a screen recording or a screenshot instead; that route works.

**Built, not yet tested end to end**

- Google's verification of the places found from an Instagram link, and the in-thread reply in Slack for a link. Each piece has been run on its own with the `try-*.js` scripts.

**In progress:** a trial in the group's channel, to measure how many real shares get the right link and to decide what to add next.

**Under consideration, depending on the trial:** finding out why TikTok links do not work through Apify and, if it cannot be fixed, trying a different scraper; a stricter check that Google's match is the intended place; and hosting the bot so it runs without a laptop.

**Not included by design:** a database, a web frontend, and multi-workspace support. These would only be added if the channel proves insufficient as a shared record.
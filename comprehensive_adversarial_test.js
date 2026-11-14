const fs = require('fs');
const vm = require('vm');
const path = require('path');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${testName}`);
        throw new Error(`Assertion failed: ${testName}`);
    }
}

console.log('=== RUNNING ADVERSARIAL TEST SUITE ===\n');

// 1. Environment Simulation Setup
const mockLocalStorage = {
    _data: {},
    getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
};

const domElements = {};
function createMockElement(id, tag = 'div') {
    const el = {
        id,
        tagName: tag.toUpperCase(),
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        },
        style: {},
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        querySelector(sel) {
            if (sel === 'iframe') {
                const match = this.innerHTML.match(/<iframe\s+([^>]+)>/i);
                if (match) {
                    const attrs = match[1];
                    const srcMatch = attrs.match(/src="([^"]+)"/i);
                    const allowMatch = attrs.match(/allow="([^"]+)"/i);
                    const hasSandbox = /sandbox/i.test(attrs);
                    return {
                        src: srcMatch ? srcMatch[1] : '',
                        allow: allowMatch ? allowMatch[1] : '',
                        hasSandbox: hasSandbox,
                        allowfullscreen: /allowfullscreen/i.test(attrs)
                    };
                }
            }
            if (sel === '#player-server-select' || sel === '.player-server-select') {
                const match = this.innerHTML.match(/<select[^>]*id="player-server-select"[^>]*>([\s\S]*?)<\/select>/i);
                if (match) {
                    return {
                        innerHTML: match[1],
                        value: (match[1].match(/<option[^>]+value="([^"]+)"[^>]*selected/i) || [])[1]
                    };
                }
            }
            return null;
        },
        querySelectorAll(sel) {
            return [];
        },
        remove() {}
    };
    return el;
}

const sandbox = {
    window: {
        location: { href: 'http://localhost/' },
        open: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: () => {}
    },
    document: {
        addEventListener: () => {},
        documentElement: { classList: { add() {}, remove() {} }, style: {} },
        body: { classList: { add() {}, remove() {} }, style: {} },
        getElementById(id) {
            if (!domElements[id]) domElements[id] = createMockElement(id);
            return domElements[id];
        },
        querySelector(sel) {
            if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
            return createMockElement('generic');
        },
        querySelectorAll() { return []; },
        createElement(tag) { return createMockElement('created_' + Date.now(), tag); }
    },
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    history: { pushState() {}, state: null },
    console: { log: console.log, error: console.error, warn: () => {} },
    fetch: typeof fetch !== 'undefined' ? fetch : () => Promise.resolve({ ok: false }),
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: () => {},
    alert: (msg) => { console.log('   [Alert called]:', msg); }
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;

vm.createContext(sandbox);

// 2. Load initialContent and script.js
const initialContentCode = fs.readFileSync(path.join(__dirname, 'initialContent.js'), 'utf8');
vm.runInContext(initialContentCode, sandbox);
assert(Array.isArray(sandbox.window.NETFLIX_INITIAL_CONTENT), 'initialContent.js loaded successfully');

const scriptCode = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8') + '\n; sandbox_app = app;';
vm.runInContext(scriptCode, sandbox);
const app = sandbox.sandbox_app;
assert(typeof app === 'object' && app !== null, 'script.js parsed and app loaded');

app.state.customContent = sandbox.window.NETFLIX_INITIAL_CONTENT;

// 3. Verify Server 1 (VidLink Pro) URL Generation
console.log('\n--- 1. Testing VidLink Server 1 Primary Streaming URLs ---');
const s1Movie = app.services.getServerUrl(1, '550', false);
assert(s1Movie.includes('vidlink.pro/movie/550'), 'Server 1 Movie routes to vidlink.pro/movie/550');
assert(s1Movie.includes('primaryColor=E50914'), 'Server 1 Movie has red primaryColor=E50914');
assert(s1Movie.includes('autoplay=true'), 'Server 1 Movie has autoplay=true');
assert(!s1Movie.includes('nextbutton='), 'Server 1 Movie does NOT have nextbutton parameter');

const s1Tv = app.services.getServerUrl(1, '1396', true, 2, 4);
assert(s1Tv.includes('vidlink.pro/tv/1396/2/4'), 'Server 1 TV routes to vidlink.pro/tv/1396/2/4');
assert(s1Tv.includes('primaryColor=E50914'), 'Server 1 TV has red primaryColor=E50914');
assert(s1Tv.includes('autoplay=true'), 'Server 1 TV has autoplay=true');
assert(s1Tv.includes('nextbutton=true'), 'Server 1 TV has nextbutton=true');

// 4. Verify Server 2 (AutoEmbed) and Server 3 (2Embed) Fallbacks
console.log('\n--- 2. Testing Server 2 (AutoEmbed) & Server 3 (2Embed) Fallbacks ---');
const s2Movie = app.services.getServerUrl(2, '550', false);
assert(s2Movie === 'https://autoembed.me/movie/tmdb/550', 'Server 2 Movie routes to autoembed.me/movie/tmdb/550');

const s2Tv = app.services.getServerUrl(2, '1396', true, 2, 4);
assert(s2Tv === 'https://autoembed.me/tv/tmdb/1396-2-4', 'Server 2 TV routes to autoembed.me/tv/tmdb/1396-2-4');

const s3Movie = app.services.getServerUrl(3, '550', false);
assert(s3Movie === 'https://www.2embed.cc/embed/550', 'Server 3 Movie routes to 2embed.cc/embed/550');

const s3Tv = app.services.getServerUrl(3, '1396', true, 2, 4);
assert(s3Tv === 'https://www.2embed.cc/embedtv/1396&s=2&e=4', 'Server 3 TV routes to 2embed.cc/embedtv/1396&s=2&e=4');

// Default fallback
const sDefault = app.services.getServerUrl(99, '550', false);
assert(sDefault.includes('vidlink.pro/movie/550'), 'Unknown server falls back to Server 1 (VidLink)');

// 5. Verify Unconstrained Iframe Playback (No Sandbox)
console.log('\n--- 3. Testing Iframe Attributes (No Sandbox, Full Permissions) ---');
app.router.openPlayer(null, null, '550', null, 1);
const playerContainer = domElements['player-container'];
assert(playerContainer !== undefined, 'Player container exists');
const iframe = playerContainer.querySelector('iframe');
assert(iframe !== null, 'Player iframe is rendered');
assert(iframe.hasSandbox === false, 'CRITICAL: Iframe does NOT contain sandbox attribute ("Please Disable Sandbox" eliminated)');
assert(iframe.allow.includes('autoplay') && iframe.allow.includes('fullscreen') && iframe.allow.includes('encrypted-media'), 'Iframe has unconstrained media permissions');
assert(iframe.allowfullscreen === true, 'Iframe has allowfullscreen enabled');
assert(iframe.src.includes('vidlink.pro/movie/550'), 'Iframe src is VidLink movie URL');

// 6. Verify Server Dropdown & Button UI
console.log('\n--- 4. Testing Server Dropdown & Switching UI ---');
const selectEl = playerContainer.querySelector('#player-server-select');
assert(selectEl !== null, 'Server dropdown #player-server-select is present in player top bar');
assert(selectEl.innerHTML.includes('value="1"') && selectEl.innerHTML.includes('Server 1 (VidLink)'), 'Server dropdown includes Server 1 (VidLink)');
assert(selectEl.innerHTML.includes('value="2"') && selectEl.innerHTML.includes('Server 2 (AutoEmbed)'), 'Server dropdown includes Server 2 (AutoEmbed)');
assert(selectEl.innerHTML.includes('value="3"') && selectEl.innerHTML.includes('Server 3 (2Embed)'), 'Server dropdown includes Server 3 (2Embed)');
assert(playerContainer.innerHTML.includes('Server 1') && playerContainer.innerHTML.includes('Server 2') && playerContainer.innerHTML.includes('Server 3'), 'Top bar buttons include Server 1, Server 2, Server 3');

// 7. Verify Switching Servers via switchPlayerServer
console.log('\n--- 5. Testing Dynamic Server Switching ---');
app.handlers.switchPlayerServer(2);
const s2Iframe = playerContainer.querySelector('iframe');
assert(s2Iframe.src === 'https://autoembed.me/movie/tmdb/550', 'switchPlayerServer(2) switches stream to AutoEmbed');

app.handlers.switchPlayerServer(3);
const s3Iframe = playerContainer.querySelector('iframe');
assert(s3Iframe.src === 'https://www.2embed.cc/embed/550', 'switchPlayerServer(3) switches stream to 2Embed');

app.handlers.switchPlayerServer(1);
const s1Iframe = playerContainer.querySelector('iframe');
assert(s1Iframe.src.includes('vidlink.pro/movie/550'), 'switchPlayerServer(1) restores VidLink stream');

// 8. Custom Google Drive Content Integration
console.log('\n--- 6. Testing Custom Google Drive Content Playback ---');
// A. Custom movie: Voicemails For Isabelle
const isabelleItem = app.state.customContent.find(i => i.id === 'voicemails_for_isabelle');
assert(isabelleItem !== undefined, 'Voicemails For Isabelle exists in custom content');
app.router.openPlayer(isabelleItem.video_url, null, isabelleItem.id, null);
const isabelleIframe = playerContainer.querySelector('iframe');
assert(isabelleIframe.src.includes('drive.google.com/file/d/1HEayTEGOote01WKCjCxfmqk0zS_ViMWf/preview'), 'Voicemails For Isabelle opens Google Drive preview stream by default');

// Verify switching Voicemails to Server 1 / 2 / 3 uses TMDB ID 614945
app.handlers.switchPlayerServer(1);
const isabelleS1Iframe = playerContainer.querySelector('iframe');
assert(isabelleS1Iframe.src.includes('vidlink.pro/movie/614945'), 'Voicemails switched to Server 1 uses mapped TMDB ID 614945');

app.handlers.switchPlayerServer(2);
const isabelleS2Iframe = playerContainer.querySelector('iframe');
assert(isabelleS2Iframe.src === 'https://autoembed.me/movie/tmdb/614945', 'Voicemails switched to Server 2 uses mapped TMDB ID 614945');

app.handlers.switchPlayerServer('drive');
const isabelleDriveIframe = playerContainer.querySelector('iframe');
assert(isabelleDriveIframe.src.includes('drive.google.com'), 'Voicemails switched back to Drive restores Google Drive stream');

// B. Custom series: Friends (Season 1 & Season 2)
console.log('\n--- 7. Testing Custom TV Series Playback (Friends) ---');
const friendsItem = app.state.customContent.find(i => i.id === 'friends_s1_full');
assert(friendsItem !== undefined, 'Friends exists in custom content');

// Episode 1
app.router.openPlayer(null, null, 'friends_s1_full', null, 'drive', 1, 1);
const friendsS1E1 = playerContainer.querySelector('iframe');
assert(friendsS1E1.src.includes('1R1cL3aSf51FzzeSkw0EsucTg9GBOEuWY/preview'), 'Friends S1E1 plays Episode 1 Google Drive preview URL');

// Episode 2
app.router.openPlayer(null, null, 'friends_s1_full', null, 'drive', 1, 2);
const friendsS1E2 = playerContainer.querySelector('iframe');
assert(friendsS1E2.src.includes('1YOUpq_kzTzE6OfyDIO6TGGg--X1bzSS_/preview'), 'Friends S1E2 plays Episode 2 Google Drive preview URL');

// Season 2 Episode 1
app.router.openPlayer(null, null, 'friends_s1_full', null, 'drive', 2, 1);
const friendsS2E1 = playerContainer.querySelector('iframe');
assert(friendsS2E1.src.includes('1ckdMduXojbMZ1Huai5tIjiAGb74iHhhk/preview'), 'Friends S2E1 plays Season 2 Episode 1 Google Drive preview URL');

// Fallback switching for Friends
app.handlers.switchPlayerServer(2);
const friendsS2 = playerContainer.querySelector('iframe');
assert(friendsS2.src === 'https://autoembed.me/tv/tmdb/1668-2-1', 'Friends switched to Server 2 uses TMDB ID 1668 with season 2 and episode 1');

// 9. Continue Watching & isTvItem Robustness
console.log('\n--- 8. Testing Continue Watching & TV vs Movie Classification ---');

// Movie recording
const movieItem = { id: 550, title: 'Fight Club', release_date: '1999-10-15' };
app.continueWatching.record(movieItem, null, null, 120, 8000);
const cwList1 = app.continueWatching.get();
const savedMovie = cwList1.find(i => i.id == 550);
assert(savedMovie !== undefined, 'Fight Club recorded in Continue Watching');
assert(savedMovie.isTv === false, 'Fight Club recorded with isTv: false');
assert(savedMovie.media_type === 'movie', 'Fight Club recorded with media_type: movie');
assert(savedMovie.season === null && savedMovie.episode === null, 'Fight Club has season: null and episode: null');

// TV series recording
const tvItem = { id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' };
app.continueWatching.record(tvItem, 3, 5, 300, 3000);
const cwList2 = app.continueWatching.get();
const savedTv = cwList2.find(i => i.id == 1396);
assert(savedTv !== undefined, 'Breaking Bad recorded in Continue Watching');
assert(savedTv.isTv === true, 'Breaking Bad recorded with isTv: true');
assert(savedTv.media_type === 'tv', 'Breaking Bad recorded with media_type: tv');
assert(savedTv.season === 3 && savedTv.episode === 5, 'Breaking Bad has season: 3 and episode: 5');

// Test isTvItem across all scenarios
assert(app.services.isTvItem(null, savedTv) === true, 'isTvItem(null, savedTv) correctly identifies TV series from saved progress');
assert(app.services.isTvItem(null, savedMovie) === false, 'isTvItem(null, savedMovie) correctly identifies Movie from saved progress');
assert(app.services.isTvItem({ id: 550, title: 'Fight Club', release_date: '1999-10-15' }, { id: 550, isTv: true }) === false, 'isTvItem overrides corrupted isTv:true when item is known movie');

// Resuming movie from Continue Watching
app.continueWatching.resume(550);
const resumedMovieIframe = playerContainer.querySelector('iframe');
assert(resumedMovieIframe.src.includes('vidlink.pro/movie/550'), 'Resumed Fight Club requests movie endpoint (not TV endpoint)');
assert(!playerContainer.innerHTML.includes('Season 1 • Ep 1'), 'Resumed Fight Club does not display Season/Episode subtitle');

// Resuming TV series from Continue Watching (cold start, item not in memory)
sandbox.window.appItemMap = {};
app.continueWatching.resume(1396);
const resumedTvIframe = playerContainer.querySelector('iframe');
assert(resumedTvIframe.src.includes('vidlink.pro/tv/1396/3/5'), 'Resumed Breaking Bad requests tv endpoint with Season 3 Episode 5');

// 10. Autoplay only for TV series
console.log('\n--- 9. Testing Next Episode Autoplay Guard ---');
assert(app.services.isTvItem({ id: 550, title: 'Fight Club', media_type: 'movie' }) === false, 'Movie is not classified as TV in autoplay');
assert(app.services.isTvItem({ id: 1396, name: 'Breaking Bad', media_type: 'tv' }) === true, 'TV series is classified as TV in autoplay');

console.log(`\n========================================`);
console.log(`=== ALL TESTS PASSED: ${passedTests} / ${passedTests} ===`);
console.log(`========================================\n`);

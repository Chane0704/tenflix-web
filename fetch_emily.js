
const https = require('https');
const fs = require('fs');

const BEARER_TOKEN = process.env.BEARER_TOKEN || process.env.TMDB_BEARER_TOKEN || '';
const SERIES_ID = 82596; // Emily in Paris

function fetch(path) {
    if (!BEARER_TOKEN) {
        return Promise.reject(new Error("BEARER_TOKEN environment variable is required."));
    }
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.themoviedb.org',
            path: `/3${path}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Content-Type': 'application/json;charset=utf-8'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    reject(new Error(`Error: ${res.statusCode} ${res.statusMessage}`));
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

function processSeason(seasonData, seasonNum) {
    if (!seasonData || !Array.isArray(seasonData.episodes)) {
        return [];
    }
    return seasonData.episodes.map(ep => ({
        season: seasonNum,
        title: `S${seasonNum} E${ep.episode_number || 1} - ${ep.name || 'Episode'}`,
        overview: ep.overview || '',
        runtime: ep.runtime ? String(ep.runtime) : "30",
        video_url: "",
        caption_url: "",
        still_path: ep.still_path ? `https://media.themoviedb.org/t/p/original${ep.still_path}` : ""
    }));
}

async function run() {
    try {
        console.log("Fetching Show Details...");
        const show = await fetch(`/tv/${SERIES_ID}?language=en-US`);

        let allEpisodes = [];

        // Fetch Seasons 1 to 4
        for (let s = 1; s <= 4; s++) {
            console.log(`Fetching Season ${s}...`);
            try {
                const seasonData = await fetch(`/tv/${SERIES_ID}/season/${s}?language=en-US`);
                const episodes = processSeason(seasonData, s);
                allEpisodes = allEpisodes.concat(episodes);
            } catch (e) {
                console.warn(`Could not fetch Season ${s}:`, e);
            }
        }

        const newShow = {
            id: 'emily_in_paris',
            title: show?.name || 'Emily in Paris',
            description: show?.overview || '',
            genre: (show?.genres && Array.isArray(show.genres)) ? show.genres.map(g => g.name).join(', ') : '',
            poster_path: show?.poster_path ? `https://media.themoviedb.org/t/p/original${show.poster_path}` : '',
            backdrop_path: show?.backdrop_path ? `https://media.themoviedb.org/t/p/original${show.backdrop_path}` : '',
            is_custom: true,
            episodes: allEpisodes,
            video_url: ""
        };

        await fs.promises.writeFile('emily_data.json', JSON.stringify(newShow, null, 2));
        console.log("Data written to emily_data.json");

    } catch (error) {
        console.error("Failed:", error);
    }
}

run();

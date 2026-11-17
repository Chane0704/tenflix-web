
const https = require('https');

const BEARER_TOKEN = process.env.BEARER_TOKEN || process.env.TMDB_BEARER_TOKEN || "";
const SERIES_ID = 1668; // Friends

function fetchSeason(season) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.themoviedb.org',
            path: `/3/tv/${SERIES_ID}/season/${season}?language=en-US`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Content-Type': 'application/json;charset=utf-8'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const json = JSON.parse(data);
                    resolve(json.episodes);
                } else {
                    reject(`Error: ${res.statusCode} ${res.statusMessage}`);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

const seasonsToFetch = [8, 9];

async function run() {
    let allData = {};
    for (const season of seasonsToFetch) {
        try {
            console.error(`Fetching Season ${season}...`);
            const episodes = await fetchSeason(season);
            allData[season] = episodes.map(ep => ({
                id: ep.id,
                title: `S${season} E${ep.episode_number} - ${ep.name}`,
                overview: ep.overview,
                runtime: ep.runtime ? String(ep.runtime) : "22",
                season: season,
                episode_number: ep.episode_number,
                still_path: ep.still_path ? `https://media.themoviedb.org/t/p/original${ep.still_path}` : ""
            }));
        } catch (error) {
            console.error(`Failed to fetch Season ${season}:`, error);
        }
    }
    const fs = require('fs');
    await fs.promises.writeFile('s8_s9_clean.json', JSON.stringify(allData, null, 2));
    console.log("Data written to s8_s9_clean.json");
}

run();

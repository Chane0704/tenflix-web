
const https = require('https');

const BEARER_TOKEN = process.env.BEARER_TOKEN || process.env.TMDB_BEARER_TOKEN || "";
const SERIES_ID = 1668; // Friends
const SEASON = 5;

const options = {
    hostname: 'api.themoviedb.org',
    path: `/3/tv/${SERIES_ID}/season/${SEASON}?language=en-US`,
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
            const episodes = json.episodes;

            // Filter for episodes 11-24
            const remainingEpisodes = episodes.filter(ep => ep.episode_number >= 11);

            const formatted = remainingEpisodes.map(ep => {
                return {
                    title: ep.name,
                    overview: ep.overview,
                    season: SEASON,
                    episode_number: ep.episode_number,
                    // Use the still_path directly from TMDB
                    still_path: ep.still_path,
                    runtime: ep.runtime || 22,
                    video_url: "", // Placeholder for user to fill or I will use a generic placeholder
                    caption_url: ""
                };
            });

            console.log(JSON.stringify(formatted, null, 2));
        } else {
            console.error('Error:', res.statusCode, res.statusMessage);
            console.error(data);
        }
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.end();

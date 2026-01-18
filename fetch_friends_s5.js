
const https = require('https');

const BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkNTgyYTViZjExMzYxZjk3ZjI5NDZjYmIxY2M1NWNlOCIsIm5iZiI6MTc2ODI0MTU5MS43ODcwMDAyLCJzdWIiOiI2OTY1MzliNzA4ZDVkZWIzNzJkNGYyZTgiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.Ive1s9eS7xNXn-d9k_iD3uThBcxrlyYdD1zMj1wQDFM';
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

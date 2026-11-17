
const https = require('https');

const BEARER_TOKEN = process.env.BEARER_TOKEN || process.env.TMDB_BEARER_TOKEN || "";

function search(query) {
    const options = {
        hostname: 'api.themoviedb.org',
        path: `/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`,
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
                const results = JSON.parse(data).results;
                results.forEach(r => console.log(`${r.id}: ${r.title} (${r.release_date})`));
            } else {
                console.error(`Error: ${res.statusCode}`);
            }
        });
    });
    req.on('error', (e) => console.error(e));
    req.end();
}

search('Crazy Rich Asians');

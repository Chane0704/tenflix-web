
const https = require('https');
const fs = require('fs');

const MOVIE_ID = 455207;
const BEARER_TOKEN = process.env.BEARER_TOKEN || process.env.TMDB_BEARER_TOKEN || "";

function fetchMovie(id) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.themoviedb.org',
            path: `/3/movie/${id}?language=en-US`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Content-Type': 'application/json;charset=utf-8'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(data));
                else reject(`Error fetching movie: ${res.statusCode}`);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    try {
        const movie = await fetchMovie(MOVIE_ID);

        const movieData = {
            id: `movie_${movie.id}`, // specific ID format
            title: movie.title,
            original_title: movie.original_title,
            description: movie.overview,
            genre: movie.genres.map(g => g.name).join(', '),
            poster_path: `https://media.themoviedb.org/t/p/original${movie.poster_path}`,
            backdrop_path: `https://media.themoviedb.org/t/p/original${movie.backdrop_path}`,
            release_date: movie.release_date,
            runtime: movie.runtime,
            vote_average: movie.vote_average,
            is_custom: true,
            type: 'movie',
            video_url: ""
        };

        await fs.promises.writeFile('crazy_data.json', JSON.stringify(movieData, null, 2));
        console.log('Saved crazy_data.json');

    } catch (error) {
        console.error("Error:", error);
    }
}

main();

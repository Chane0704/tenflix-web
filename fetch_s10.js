
const https = require('https');
const fs = require('fs');

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
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const json = JSON.parse(data);
                    resolve(json.episodes);
                } else {
                    reject(`Error: ${res.statusCode} ${res.statusMessage}`);
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

const seasonToFetch = 10;
const videoMap = [
    "https://drive.google.com/file/d/1bDe4a3Y0a0hrl8r9GWIORRnZkNAtjnRc/preview?vq=hd1080", // 1
    "https://drive.google.com/file/d/1bDe4a3Y0a0hrl8r9GWIORRnZkNAtjnRc/preview?vq=hd1080", // 2
    "https://drive.google.com/file/d/1Eyphd1KVMk-Z3xEj2GfXAO-m-TEzdpdd/preview?vq=hd1080", // 3
    "https://drive.google.com/file/d/1hF9gdk1sqAi9kv4-0dv4WAK4i6VXVElc/preview?vq=hd1080", // 4
    "https://drive.google.com/file/d/1hH0xDSWjtU66kGBVlaLOWFcc98vnalto/preview?vq=hd1080", // 5
    "https://drive.google.com/file/d/1OunxLZFDBeL0sy8zclIQTl4lHi8cQ-mn/preview?vq=hd1080", // 6
    "https://drive.google.com/file/d/1r75RyPP6h_fsQqmRYi3WkRcqA6X54LZM/preview?vq=hd1080", // 7
    "https://drive.google.com/file/d/1tSrws4zr-0G0Rj27LBAD2zK1n31RN7AN/preview?vq=hd1080", // 8
    "https://drive.google.com/file/d/1DWUDiLRN_t7yq3c39_a44kQpYm4ftLIC/preview?vq=hd1080", // 9
    "https://drive.google.com/file/d/1u5-jzpZJ6MlXburEHemQ6BBKTQnoSBDW/preview?vq=hd1080", // 10
    "https://drive.google.com/file/d/1g0ZZiQOdXm1JyWpWxR40QqrVmdLnVjY9/preview?vq=hd1080", // 11
    "https://drive.google.com/file/d/1CrfdWw2-RwDAa0Er2gNAmMBCMMXa-P5i/preview?vq=hd1080", // 12
    "https://drive.google.com/file/d/1Qk5s93vx6UZJRDRKF6lM20EAByIaRU33/preview?vq=hd1080", // 13
    "https://drive.google.com/file/d/130y1piWVwx3Pd7FT6ENO-XkbXVRLZOU5/preview?vq=hd1080", // 14
    "https://drive.google.com/file/d/13mpOHUjE3axIe2NDW_KJMrFhu9BfgoTg/preview?vq=hd1080", // 15
    "https://drive.google.com/file/d/1DuL-x856n8a8mU5PkxACOaFz6AY7X8MS/preview?vq=hd1080", // 16
    "https://drive.google.com/file/d/1ncusXRRry0PFJV6Fyub19wYrQc4fctvj/preview?vq=hd1080"  // 17
];

async function run() {
    try {
        console.error(`Fetching Season ${seasonToFetch}...`);
        const episodes = await fetchSeason(seasonToFetch);
        // We only want the first 17 episodes if TMDB has more (The Last One might be listed as 17 and 18, or just 17).
        // Let's take the first 17.

        const mappedData = episodes.slice(0, 17).map((ep, index) => ({
            season: seasonToFetch,
            title: `S${seasonToFetch} E${ep.episode_number} - ${ep.name}`,
            overview: ep.overview,
            runtime: ep.runtime ? String(ep.runtime) : "22",
            video_url: videoMap[index] || "",
            caption_url: "",
            still_path: ep.still_path ? `https://media.themoviedb.org/t/p/original${ep.still_path}` : ""
        }));

        await fs.promises.writeFile('s10_data.json', JSON.stringify(mappedData, null, 2));
        console.log("Data written to s10_data.json");
    } catch (error) {
        console.error("Failed:", error);
    }
}

run();

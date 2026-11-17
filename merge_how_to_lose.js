
const fs = require('fs');

const DATA_FILE = 'how_to_lose_data.json';
const TARGET_FILE = 'initialContent.js';

try {
    const movieData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let content = fs.readFileSync(TARGET_FILE, 'utf8');

    const startMarker = "window.NETFLIX_INITIAL_CONTENT = [";

    if (content.includes(startMarker)) {
        if (content.includes(`"id": "${movieData.id}"`) || content.includes(`"title": "${movieData.title}"`)) {
            console.log("Movie already exists. Skipping.");
        } else {
            const insertPos = content.indexOf(startMarker) + startMarker.length;
            const newEntry = `\n    ${JSON.stringify(movieData, null, 4)},`;

            content = content.slice(0, insertPos) + newEntry + content.slice(insertPos);

            fs.writeFileSync(TARGET_FILE, content);
            console.log('Successfully added "How to Lose a Guy in 10 Days" to initialContent.js');
        }
    } else {
        console.error("Could not find array marker in initialContent.js");
    }

} catch (e) {
    console.error(e);
}

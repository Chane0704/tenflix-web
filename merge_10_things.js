
const fs = require('fs');

const DATA_FILE = '10_things_data.json';
const TARGET_FILE = 'initialContent.js';

try {
    const movieData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let content = fs.readFileSync(TARGET_FILE, 'utf8');

    // Extract the array content
    const startMarker = "window.NETFLIX_INITIAL_CONTENT = [";

    // Simple insertion at the beginning of the list
    if (content.includes(startMarker)) {
        // Check if already exists
        if (content.includes(`"id": "${movieData.id}"`) || content.includes(`"title": "${movieData.title}"`)) {
            console.log("Movie already exists. Skipping or you can update manually.");
        } else {
            const insertPos = content.indexOf(startMarker) + startMarker.length;
            const newEntry = `\n    ${JSON.stringify(movieData, null, 4)},`;

            content = content.slice(0, insertPos) + newEntry + content.slice(insertPos);

            fs.writeFileSync(TARGET_FILE, content);
            console.log('Successfully added "10 Things I Hate About You" to initialContent.js');
        }
    } else {
        console.error("Could not find array marker in initialContent.js");
    }

} catch (e) {
    console.error(e);
}


const fs = require('fs');

const initialContentPath = 'initialContent.js';
const s10DataPath = 's10_data.json';

try {
    let initialContentRaw = fs.readFileSync(initialContentPath, 'utf8');
    let jsonStr = initialContentRaw.replace('window.NETFLIX_INITIAL_CONTENT =', '').trim();
    if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);

    let initialContent;
    try {
        initialContent = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error("Failed to parse initialContent.js");
    }

    const s10Episodes = JSON.parse(fs.readFileSync(s10DataPath, 'utf8'));
    const friends = initialContent.find(item => item.title === 'Friends');

    if (friends) {
        // Remove existing Season 10 eps if any
        friends.episodes = friends.episodes.filter(ep => ep.season !== 10);
        // Add new S10 eps
        friends.episodes = friends.episodes.concat(s10Episodes);
        console.log(`Added ${s10Episodes.length} episodes for Season 10.`);
    } else {
        console.error("Friends not found!");
    }

    const newContent = `window.NETFLIX_INITIAL_CONTENT = ${JSON.stringify(initialContent, null, 4)};`;
    fs.writeFileSync(initialContentPath, newContent, 'utf8');
    console.log("Successfully wrote updated initialContent.js with Season 10.");

} catch (error) {
    console.error("Error:", error);
}

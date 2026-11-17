
const fs = require('fs');

const initialContentPath = 'initialContent.js';
const emilyDataPath = 'emily_data.json';

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

    const newShow = JSON.parse(fs.readFileSync(emilyDataPath, 'utf8'));

    // Check if it already exists to avoid duplicates
    const idx = initialContent.findIndex(item => item.id === newShow.id);
    if (idx !== -1) {
        console.log("Show 'Emily in Paris' already exists. Updating it.");
        initialContent[idx] = newShow;
    } else {
        console.log("Adding 'Emily in Paris' to content list.");
        initialContent.unshift(newShow); // Add to the beginning so it's prominent
    }

    const newContent = `window.NETFLIX_INITIAL_CONTENT = ${JSON.stringify(initialContent, null, 4)};`;
    fs.writeFileSync(initialContentPath, newContent, 'utf8');
    console.log("Successfully updated initialContent.js with 'Emily in Paris'.");

} catch (error) {
    console.error("Error:", error);
}

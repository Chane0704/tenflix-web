const fs = require('fs');
const path = require('path');
const initialContentPath = 'initialContent.js';
const cleanDataPath = 's8_s9_clean.json';
try {
    let initialContentRaw = fs.readFileSync(initialContentPath, 'utf8');
    let jsonStr = initialContentRaw.replace('window.NETFLIX_INITIAL_CONTENT =', '').trim();
    if (jsonStr.endsWith(';')) {
        jsonStr = jsonStr.slice(0, -1);
    }
    let initialContent;
    try {
        initialContent = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse initialContent.js as JSON directly. Trying simplified evaluation.");
        throw e;
    }
    const cleanData = JSON.parse(fs.readFileSync(cleanDataPath, 'utf8'));
    const friends = initialContent.find(item => item.title === 'Friends');
    if (!friends) throw new Error("Friends show not found in initialContent");
    const findCleanEp = (season, epNum) => {
        if (!cleanData[season]) return null;
        return cleanData[season].find(e => e.episode_number === epNum);
    };
    let updatedCount = 0;
    friends.episodes.forEach(ep => {
        const season = ep.season;
        if (!season) return;
        let needsUpdate = false;
        if (season === 8) {
            needsUpdate = true; // All S8
        } else if (season === 9) {
            let epNum = ep.episode_number;
            if (!epNum) {
                const match = ep.title.match(/S9 E(\d+)/);
                if (match) epNum = parseInt(match[1]);
            }
            if (epNum >= 1 && epNum <= 6) {
                needsUpdate = true;
            }
        }
        if (needsUpdate) {
            let epNum = ep.episode_number;
            if (!epNum && season === 8) {
                const match = ep.title.match(/S8 E(\d+)/);
                if (match) epNum = parseInt(match[1]);
            } else if (!epNum && season === 9) {
                const match = ep.title.match(/S9 E(\d+)/);
                if (match) epNum = parseInt(match[1]);
            }
            if (epNum) {
                const cleanEp = findCleanEp(season, epNum);
                if (cleanEp && cleanEp.still_path) {
                    ep.still_path = cleanEp.still_path;
                    updatedCount++;
                }
            }
        }
    });
    console.log(`Updated thumbnails for ${updatedCount} episodes.`);
    const newContent = `window.NETFLIX_INITIAL_CONTENT = ${JSON.stringify(initialContent, null, 4)};`;
    fs.writeFileSync(initialContentPath, newContent, 'utf8');
    console.log("Successfully wrote updated initialContent.js");
} catch (error) {
    console.error("Error executing merge script:", error);
    process.exit(1);
}
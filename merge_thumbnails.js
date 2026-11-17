
const fs = require('fs');
const path = require('path');

const initialContentPath = 'initialContent.js';
const cleanDataPath = 's8_s9_clean.json';

try {
    // 1. Read and parse initialContent.js
    let initialContentRaw = fs.readFileSync(initialContentPath, 'utf8');
    // Sanitize to valid JSON: remove "window.NETFLIX_INITIAL_CONTENT =" and trailing ";"
    let jsonStr = initialContentRaw.replace('window.NETFLIX_INITIAL_CONTENT =', '').trim();
    if (jsonStr.endsWith(';')) {
        jsonStr = jsonStr.slice(0, -1);
    }

    let initialContent;
    try {
        initialContent = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse initialContent.js as JSON directly. Trying simplified evaluation.");
        // If strict JSON parse fails (due to trailing commas etc), we might need another way.
        // But the file looks generated and clean. Let's hope.
        throw e;
    }

    // 2. Read clean data
    const cleanData = JSON.parse(fs.readFileSync(cleanDataPath, 'utf8'));

    // 3. Merge Logic
    // Target: Friends show (id: friends_s1_full)
    const friends = initialContent.find(item => item.title === 'Friends');
    if (!friends) throw new Error("Friends show not found in initialContent");

    // Helper to find clean ep
    const findCleanEp = (season, epNum) => {
        if (!cleanData[season]) return null;
        return cleanData[season].find(e => e.episode_number === epNum);
    };

    let updatedCount = 0;

    friends.episodes.forEach(ep => {
        const season = ep.season;
        // Logic for Seasons 1-7 is separate or default (ep.season might be missing for S1?)
        // We know S8 and S9 have 'season' property set from previous edits.

        if (!season) return;

        let needsUpdate = false;
        if (season === 8) {
            needsUpdate = true; // All S8
        } else if (season === 9) {
            // Regex to check episode number if 'episode_number' prop is missing?
            // In previous steps we saw 'episode_number' might be missing in older data, 
            // but for S9 it should be there or extractable from title "S9 E1 - ..."

            // Let's rely on string parsing if ep.episode_number unavailable, 
            // but the clean dump has it.
            // However, the *existing* initialContent S9 episodes DO have "title" like "S9 E1 - ..."

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
            // Determine Ep Num
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
                    // console.log(`Updating S${season} E${epNum} thumb: ${cleanEp.still_path}`);
                    ep.still_path = cleanEp.still_path;
                    // Also update title/overview if we want to be sure? User just asked for pics.
                    // But good metadata helps. Let's stick to pics to be safe and minimally invasive
                    // unless description is clearly generic.
                    // The user said "pics in the details thing", so let's update just still_path.
                    updatedCount++;
                }
            }
        }
    });

    console.log(`Updated thumbnails for ${updatedCount} episodes.`);

    // 4. Write back
    const newContent = `window.NETFLIX_INITIAL_CONTENT = ${JSON.stringify(initialContent, null, 4)};`;
    fs.writeFileSync(initialContentPath, newContent, 'utf8');
    console.log("Successfully wrote updated initialContent.js");

} catch (error) {
    console.error("Error executing merge script:", error);
    process.exit(1);
}

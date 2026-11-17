
const fs = require('fs');
// Read file with utf16le encoding since that's what powershell redirection likely produced
// Actually, let's try reading as utf8 first, if it fails, we handle it.
// Standard node fs.readFileSync defaults to utf8.
// If it is utf16le, we need to specify it.

try {
    const content = fs.readFileSync('s8_s9_redump.json', 'utf16le');
    const data = JSON.parse(content);

    // We want Season 9, Episodes 7, 8, 9, 10
    const s9 = data["9"];
    const targets = [7, 8, 9, 10];

    const results = s9.filter(ep => targets.includes(ep.episode_number));
    console.log(JSON.stringify(results, null, 2));

} catch (e) {
    console.error("Error:", e);
    // Fallback try utf8 if the above failed (though the tool said utf-16le)
    try {
        const content = fs.readFileSync('s8_s9_redump.json', 'utf8');
        const data = JSON.parse(content);
        const s9 = data["9"];
        const targets = [7, 8, 9, 10];
        const results = s9.filter(ep => targets.includes(ep.episode_number));
        console.log(JSON.stringify(results, null, 2));
    } catch (e2) {
        console.error("Error 2:", e2);
    }
}

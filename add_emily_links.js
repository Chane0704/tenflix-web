
const fs = require('fs');

const emilyDataPath = 'emily_data.json';

const videoLinks = [
    "https://drive.google.com/file/d/1NDywaF8bUF6jfwhw1O23UuHSVwbZI5gX/view?usp=drive_link", // Ep 1
    "https://drive.google.com/file/d/1wp1jVFnRF6vj-Rc503Ni2eN8mxCAvXKQ/view?usp=drive_link", // Ep 2
    "https://drive.google.com/file/d/1rn0Tck6RQWUP_IrfteA-2k6q2BU_TlOm/view?usp=drive_link", // Ep 3
    "https://drive.google.com/file/d/1nVA0WRCmYPRCqg8zA5IiXzMl4_cTZ4-q/view?usp=drive_link", // Ep 4
    "https://drive.google.com/file/d/1NExBdy1zwaFvKeZb-BRkDGrRWjDnnwrA/view?usp=drive_link", // Ep 5
    "https://drive.google.com/file/d/101uUVox57ZsDv079EBX2cjk4xEJo7NIQ/view?usp=drive_link", // Ep 6
    "https://drive.google.com/file/d/1eY8ceHr021voZY1gUh6YE5BcR3Fz2PDN/view?usp=drive_link", // Ep 7
    "https://drive.google.com/file/d/1eGO0Ejp6D-JWUfPtQg9Ab66PZL6L74yj/view?usp=drive_link", // Ep 8
    "https://drive.google.com/file/d/1k94prdO-koTIy2HGTLl2R2mSuxY3oVUb/view?usp=drive_link", // Ep 9
    "https://drive.google.com/file/d/1tJS6MMJOOKMkfV66nfHYOtY6Q37VeZ3T/view?usp=drive_link"  // Ep 10
];

try {
    const emilyData = JSON.parse(fs.readFileSync(emilyDataPath, 'utf8'));

    // Update first 10 episodes of Season 1
    let updateCount = 0;
    emilyData.episodes.forEach((ep) => {
        if (ep.season === 1 && ep.title.includes(`S1 E`)) {
            // Extract episode number roughly or just rely on index since the array is sorted
            // Actually, the structure is flat list of episodes.
            // Let's rely on the order: the first 10 items in the array should be S1E1 to S1E10
        }
    });

    // Verify and update
    for (let i = 0; i < 10; i++) {
        // Since we fetched S1 first, the first 10 should be S1E1 - S1E10
        if (emilyData.episodes[i].season === 1) {
            emilyData.episodes[i].video_url = videoLinks[i];
            console.log(`Updated ${emilyData.episodes[i].title} with link.`);
        } else {
            console.warn(`Unexpected episode at index ${i}: ${emilyData.episodes[i].title}`);
        }
    }

    fs.writeFileSync(emilyDataPath, JSON.stringify(emilyData, null, 2));
    console.log(`Updated emily_data.json`);

} catch (error) {
    console.error("Error:", error);
}

---
description: How to deploy the Netflix Clone to Netlify (Drag & Drop)
---

# Deploying to Netlify (Simplest Method)

Since your application is a static site (HTML/CSS/JS), the easiest way to deploy is using Netlify Drop.

1.  **Locate your Project Folder**:
    *   Go to: `C:\Users\anish\.gemini\antigravity\scratch\netflix-clone\`

2.  **Identify the Source Folder**:
    *   You want to deploy the **`src`** folder, NOT the main folder.
    *   The `src` folder contains your `index.html`, `script.js`, and `style.css`.

3.  **Drag and Drop**:
    *   Open [app.netlify.com/drop](https://app.netlify.com/drop).
    *   Drag the **`src`** folder directly into the browser window.

4.  **Why `src`?**:
    *   Dragging the `src` folder ensures `index.html` is at the top level.
    *   If you drag the outer folder, Netlify might get confused by `package.json` or show a directory listing instead of your app.

5.  **Important Note on Data**:
    *   Your "Custom Content" (videos/subtitles) is stored in your **Browser's Local Storage**.
    *   When you open the new Netlify link, **your library will be empty**. This is normal!
    *   You will need to re-add your content on the live site (or export/import if we build that feature).

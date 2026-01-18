# How to Deploy Your Netflix Clone Worldwide

Currently, your site is running on **Localhost**, which means only *you* can see it on your computer.

To make it accessible to anyone in the world, you need to **deploy** it to the web. Since this is a static site (HTML, CSS, JS), this is completely **FREE** and easy to do.

Here are the best ways to do it:

## Option 1: Netlify Drop (Easiest & Fastest)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Open your file explorer on your computer.
3. Locate the folder `c:\Users\anish\.gemini\antigravity\scratch\netflix-clone\src`.
4. Drag and drop that **entire `src` folder** onto the Netlify page.
5. In a few seconds, it will give you a live URL (e.g., `https://relaxed-beaver-12345.netlify.app`) that you can share with anyone!

## Option 2: Vercel
1. Install the Vercel CLI (if look comfortable with terminals): `npm i -g vercel` then run `vercel`.
2. OR, use the web interface:
   - Push your code to a GitHub repository.
   - Go to [vercel.com](https://vercel.com) and import that repository.
   - It will auto-deploy and give you a global URL.

## Option 3: GitHub Pages
1. Create a new repository on GitHub.
2. Push your code to it.
3. Go to Repository Settings -> Pages.
4. Select "main" branch and save.
5. Your site will be at `yourusername.github.io/repo-name`.

---

### Important Note on API Keys
If you are using a real TMDB API Key, remember that it is currently saved in your browser's "Local Storage". When you deploy the site, new users won't have *your* local storage.
- You can hardcode the API key in `script.js` (Search for `apiKey: localStorage.getItem...` and replace it with `'YOUR_KEY'`).
- **Warning:** Hardcoding keys makes them visible to anyone who inspects your code. For a simple portfolio project, this is usually strictly "okay" but not best practice for production apps.

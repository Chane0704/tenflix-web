# Netflix Clone

A pixel-perfect Netflix Clone application built with Vanilla JavaScript, HTML, and CSS.

## Features
- **Authentic UI**: Replicates the Netflix dark mode, grid layouts, and typography.
- **Custom Library**: Add your own movies and TV shows with cover art and video links.
- **Episode Support**: Support for multi-episode series with a dedicated episode list view.
- **TMDB Integration**: (Optional) Fetch real trending movies and shows using The Movie Database API.
- **Video Playback**: Built-in video player supporting direct MP4 links and embeds.

## Setup Instructions

1.  **Open the Application**:
    Simply open the `src/index.html` file in any modern web browser. No server installation is required.
    ```bash
    # If you have VS Code with Live Server
    Right-click index.html -> Open with Live Server
    ```

2.  **Initial View**:
    By default, the app uses mock data. You can start adding your own content immediately.

## How to Add Custom Content

1.  Click on **"My List"** in the navigation bar.
2.  Click the **"Add Title"** button.
3.  Fill in the details:
    - **Title & Genre**: e.g., "My Home Movie", "Sci-Fi".
    - **Description**: A brief summary.
    - **Images**: Paste direct image URLs for the Poster (portrait) and Backdrop (landscape).
    - **Media**:
        - For a Movie: Enter the video URL in the first box.
        - For a Series: Click "Add Another Episode" to add more.
    - **Video URLs**: You can use direct `.mp4` links or embedded iframe URLs (like Youtube Embeds).
4.  Click **"Save to Library"**.

## Optional: Real Movie Data
To see real data from TMDB:
1.  Go to **Settings** in the app.
2.  Enter your [TMDB API Key](https://www.themoviedb.org/documentation/api).
3.  Save and Refresh.

## Project Structure
- `style.css`: All styling, including responsive grids and modals.
- `script.js`: Application logic, routing, and state management.
- `index.html`: Main entry point.

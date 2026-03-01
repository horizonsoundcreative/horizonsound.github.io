import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  fetchAllVideos,
  fetchPlaylistMembership,
  processPlaylistThumbnails
} from "./fetch-youtube-metadata.js";

/* -------------------------------------------------------
   PATHS
------------------------------------------------------- */
const DATA_DIR = "./_data";
const THUMBNAIL_DIR = "./assets/thumbnails";

const VIDEO_FEED_PATH = path.join(DATA_DIR, "youtube_feed.yml");
const PLAYLIST_FEED_PATH = path.join(DATA_DIR, "youtube_playlists.yml");

/* -------------------------------------------------------
   ENSURE DIRECTORIES
------------------------------------------------------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/* -------------------------------------------------------
   WRITE YAML
------------------------------------------------------- */
function writeYaml(filepath, data) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, yaml.dump(data), "utf8");
}

/* -------------------------------------------------------
   NORMALIZE VIDEO OBJECT
------------------------------------------------------- */
function normalizeVideo(video) {
  const song_id = video.slug; // SLUG-BASED ID

  return {
    song_id,
    youtube_id: video.id,   // <-- RESTORE YOUTUBE ID HERE
    title: video.title,
    slug: video.slug,
    url: `/music/${song_id}/`,

    // Local thumbnail path uses slug
    thumbnail: `/assets/thumbnails/${song_id}.jpeg`,

    videostatus:
      video.status === "public" || video.status === "Public"
        ? "Public"
        : video.status === "scheduled" || video.status === "Scheduled"
        ? "Scheduled"
        : "Private",

    playlists: video.playlists || [],

    metadata: {
      published_at: video.publishedAt || null,
      scheduled_at: video.scheduledAt || null,
      channel_id: video.metadata?.channel_id || null,
      channel_title: video.metadata?.channel_title || null,
      category_id: video.metadata?.category_id || null,
      tags: video.metadata?.tags || [],
      duration: video.metadata?.duration || null,
      definition: video.metadata?.definition || null,
      region_allowed: video.metadata?.region_allowed || [],
      region_blocked: video.metadata?.region_blocked || [],
      content_rating: video.metadata?.content_rating || "",
      statistics: video.metadata?.statistics || {
        view_count: 0,
        like_count: 0,
        favorite_count: 0,
        comment_count: 0
      },
      made_for_kids: video.metadata?.made_for_kids || false,
      self_declared_made_for_kids: video.metadata?.self_declared_made_for_kids || false,
      topic_categories: video.metadata?.topic_categories || []
    }
  };
}

/* -------------------------------------------------------
   MAIN GENERATOR
------------------------------------------------------- */
async function generate() {
  console.log("Fetching videos...");
  const videos = await fetchAllVideos();

  console.log("Fetching playlists + membership...");
  const playlists = await fetchPlaylistMembership();

  console.log("Downloading playlist thumbnails...");
  await processPlaylistThumbnails(playlists, THUMBNAIL_DIR);

  console.log("Attaching playlist membership to videos...");
  const playlistMap = {};
  playlists.forEach(pl => {
    pl.videoIds.forEach(id => {
      if (!playlistMap[id]) playlistMap[id] = [];
      playlistMap[id].push(pl.id);
    });
  });

  videos.forEach(video => {
    video.playlists = playlistMap[video.id] || [];
  });

  console.log("Normalizing videos...");
  const normalizedVideos = videos.map(normalizeVideo);

  console.log("Writing youtube_feed.yml...");
  writeYaml(VIDEO_FEED_PATH, { songs: normalizedVideos });

  /* -------------------------------------------------------
     BUILD SLUG LOOKUP FOR PLAYLIST SONG IDS
  ------------------------------------------------------- */
  const slugLookup = {};
  normalizedVideos.forEach(v => {
    slugLookup[v.song_id] = v.song_id; // slug → slug
    slugLookup[v.slug] = v.song_id;    // slug → slug
    slugLookup[v.song_id] = v.song_id; // ensure consistency
    slugLookup[v.song_id] = v.song_id;
  });

  // Also map YouTube IDs → slug
  videos.forEach(v => {
    slugLookup[v.id] = v.slug;
  });

  console.log("Writing youtube_playlists.yml...");
  writeYaml(
    PLAYLIST_FEED_PATH,
    playlists.map(pl => ({
      playlist_id: pl.id,
      title: pl.title,
      slug: pl.slug,
      description: pl.description,
      published_at: pl.publishedAt,
      thumbnail: pl.thumbnail,

      // Convert YouTube IDs → slugs
      song_ids: pl.videoIds
        .map(id => slugLookup[id])
        .filter(Boolean)
    }))
  );

  console.log("Done.");
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  fetchAllVideos,
  fetchPlaylistsWithMembership,
  processPlaylistThumbnails
} from "./fetch-youtube-metadata.js";

/* -------------------------------------------------------
   HORIZON SOUND — YOUTUBE → YAML DATA PIPELINE
   -------------------------------------------------------
   SONG MODEL (youtube_feed.yml):
     - song_id = slug (canonical ID)
     - youtube_id = raw YouTube video ID
     - url = /music/<song_id>/
     - thumbnail = /assets/thumbnails/<song_id>.jpeg
     - videostatus = lowercase canonical status
     - playlists = array of YouTube playlist IDs
     - youtube_metadata = raw YouTube fields (no transformations)

   PLAYLIST MODEL (youtube_playlists.yml):
     playlists:
       - playlist_id = YouTube playlist ID (canonical)
       - slug = URL identity
       - title, description, published_at
       - thumbnail = /assets/thumbnails/playlist-<slug>.jpeg
       - song_ids = array of YouTube video IDs (raw)

   OVERRIDES:
     - Music overrides keyed by song_id
     - Playlist overrides keyed by slug
------------------------------------------------------- */

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
   BUILD SONG OBJECT (FINAL SONG MODEL)
------------------------------------------------------- */
function buildSongObject(video) {
  const song_id = video.slug; // canonical ID = slug

  return {
    song_id,
    youtube_id: video.id,
    title: video.title,

    // URL + thumbnail use song_id
    url: `/music/${song_id}/`,
    thumbnail: `/assets/thumbnails/${song_id}.jpeg`,

    // canonical lowercase status
    videostatus: video.videostatus_raw,

    // playlist membership = array of YouTube playlist IDs
    playlists: video.playlists || [],

    // raw YouTube metadata (no transformations)
    youtube_metadata: {
      published_at: video.publishedAt || null,
      scheduled_at: video.scheduledAt || null,
      channel_id: video.youtube_metadata?.channel_id || null,
      channel_title: video.youtube_metadata?.channel_title || null,
      category_id: video.youtube_metadata?.category_id || null,
      tags: video.youtube_metadata?.tags || [],
      duration: video.youtube_metadata?.duration || null,
      definition: video.youtube_metadata?.definition || null,
      region_allowed: video.youtube_metadata?.region_allowed || [],
      region_blocked: video.youtube_metadata?.region_blocked || [],
      content_rating: video.youtube_metadata?.content_rating || "",
      statistics: video.youtube_metadata?.statistics || {
        view_count: 0,
        like_count: 0,
        favorite_count: 0,
        comment_count: 0
      },
      made_for_kids: video.youtube_metadata?.made_for_kids || false,
      self_declared_made_for_kids: video.youtube_metadata?.self_declared_made_for_kids || false,
      topic_categories: video.youtube_metadata?.topic_categories || [],

      // raw YouTube status fields
      privacy_status: video.privacyStatus || null,
      upload_status: video.uploadStatus || null,
      publish_at: video.publishAt || null
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
  const playlists = await fetchPlaylistsWithMembership();

  console.log("Downloading playlist thumbnails...");
  await processPlaylistThumbnails(playlists, THUMBNAIL_DIR);

  /* -------------------------------------------------------
     ATTACH PLAYLIST MEMBERSHIP TO VIDEOS
     playlistMap = { youtubeVideoId: [playlistId, playlistId] }
  ------------------------------------------------------- */
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

  /* -------------------------------------------------------
     NORMALIZE VIDEOS INTO FINAL SONG MODEL
  ------------------------------------------------------- */
  console.log("Building song objects...");
  const normalizedVideos = videos.map(buildSongObject);

  /* -------------------------------------------------------
     WRITE SONG FEED
  ------------------------------------------------------- */
  console.log("Writing youtube_feed.yml...");
  writeYaml(VIDEO_FEED_PATH, { songs: normalizedVideos });

  /* -------------------------------------------------------
     WRITE PLAYLIST FEED
     - Wrapped in top-level "playlists:"
     - playlist_id = YouTube ID
     - slug = URL identity
     - song_ids = raw YouTube video IDs
  ------------------------------------------------------- */
  console.log("Writing youtube_playlists.yml...");
  writeYaml(
    PLAYLIST_FEED_PATH,
    {
      playlists: playlists.map(pl => ({
        playlist_id: pl.id,
        title: pl.title,
        slug: pl.slug,
        description: pl.description,
        published_at: pl.publishedAt,
        thumbnail: pl.thumbnail,
        song_ids: pl.videoIds // raw YouTube IDs (correct)
      }))
    }
  );

  console.log("Done.");
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});

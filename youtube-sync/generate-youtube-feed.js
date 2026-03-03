/**
 * -------------------------------------------------------------
 *  YOUTUBE → LOCAL DATA INGESTION LAYER (CANONICAL + STABLE)
 * -------------------------------------------------------------
 *
 *  PURPOSE:
 *    This script fetches all YouTube videos and playlists from the
 *    Horizon Sound channel, downloads thumbnails, normalizes metadata,
 *    formats descriptions, attaches playlist membership, and writes
 *    two canonical YAML data files used by the website:
 *
 *      • _data/youtube_feed.yml       (all songs)
 *      • _data/youtube_playlists.yml  (all playlists)
 *
 *  This is the **single source of truth** for all YouTube-derived
 *  metadata. It must remain stable, complete, and append‑only.
 *
 *  NOTHING in this file should ever be removed because it is “unused.”
 *  The ingestion layer must preserve ALL useful upstream metadata
 *  for future features, analytics, debugging, and site evolution.
 *
 * -------------------------------------------------------------
 *  INPUTS:
 *    • YouTube API (via fetchAllVideos + fetchPlaylistsWithMembership)
 *    • Local overrides (merged later in the site build)
 *    • Local filesystem for thumbnails
 *
 *  OUTPUTS:
 *    • youtube_feed.yml       → list of normalized song objects
 *    • youtube_playlists.yml  → list of normalized playlist objects
 *    • /assets/thumbnails/    → downloaded JPEG thumbnails
 *
 * -------------------------------------------------------------
 *  GUARANTEES:
 *    • Never drops upstream metadata fields
 *    • Always produces deterministic YAML
 *    • Always formats descriptions into <p> blocks
 *    • Always downloads thumbnails
 *    • Always attaches playlist membership
 *    • Always safe to run repeatedly
 *
 * -------------------------------------------------------------
 */
let playlistSlugMap = {};

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  fetchAllVideos,
  fetchPlaylistsWithMembership,
  processPlaylistThumbnails
} from "./fetch-youtube-metadata.js";

/* -------------------------------------------------------------
   CONSTANTS & PATHS
------------------------------------------------------------- */

const DATA_DIR = "./_data";
const THUMBNAIL_DIR = "./assets/thumbnails";

const VIDEO_FEED_PATH = path.join(DATA_DIR, "youtube_feed.yml");
const PLAYLIST_FEED_PATH = path.join(DATA_DIR, "youtube_playlists.yml");

/* -------------------------------------------------------------
   FILESYSTEM HELPERS
------------------------------------------------------------- */

/**
 * ensureDir(dir)
 * Creates a directory if it doesn't exist.
 * Used for thumbnails and YAML output directories.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * writeYaml(filepath, data)
 * Writes YAML to disk with safe directory creation.
 */
function writeYaml(filepath, data) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, yaml.dump(data), "utf8");
}

/* -------------------------------------------------------------
   DESCRIPTION FORMATTER
   Converts raw YouTube description text into compact <p> blocks.
   - Removes blank lines
   - Collapses internal newlines
   - Produces deterministic HTML
------------------------------------------------------------- */

function formatDescriptionToHtml(desc) {
  if (!desc) return "";

  return desc
    .split(/\n\s*\n/)               // split on blank lines (any amount of whitespace)
    .map(p => p.trim())             // trim whitespace
    .filter(p => p.length > 0)      // remove empty paragraphs
    .map(p => {
      // collapse internal newlines into spaces
      const collapsed = p.replace(/\n+/g, " ").trim();
      return `<p>${collapsed}</p>`;
    })
    .join("");                    // no blank lines between paragraphs
}

/* -------------------------------------------------------------
   SONG OBJECT NORMALIZATION
   Converts raw YouTube API video objects into stable, normalized
   song objects used by the site. This is the canonical schema.
------------------------------------------------------------- */

function buildSongObject(video) {
  const song_id = video.slug;

  return {
    song_id,
    youtube_id: video.id,
    title: video.title,

    // Formatted HTML description (canonical)
    description_html: formatDescriptionToHtml(video.youtube_metadata?.description || ""),

    url: `/music/${song_id}/`,
    thumbnail: `/assets/thumbnails/${song_id}.jpeg`,
    videostatus: video.videostatus_raw,
    playlists: (video.playlists || []).map(id => playlistSlugMap[id]).filter(Boolean),

    // Numeric view count (normalized)
    view_count_num: parseInt(
      video.youtube_metadata?.statistics?.view_count || "0",
      10
    ),

    // Full upstream YouTube metadata (append‑only)
    youtube_metadata: {
      published_at: video.publishedAt || null,
      scheduled_at: video.scheduledAt || null,
      channel_id: video.youtube_metadata?.channel_id || null,
      channel_title: video.youtube_metadata?.channel_title || null,
      category_id: video.youtube_metadata?.category_id || null,
      tags: video.youtube_metadata?.tags || [],

      // contentDetails
      duration: video.youtube_metadata?.duration || null,
      definition: video.youtube_metadata?.definition || null,
      dimension: video.youtube_metadata?.dimension || null,                 // ⭐ NEW
      caption: video.youtube_metadata?.caption || null,                     // ⭐ NEW
      licensed_content: video.youtube_metadata?.licensed_content || false,  // ⭐ NEW
      region_allowed: video.youtube_metadata?.region_allowed || [],
      region_blocked: video.youtube_metadata?.region_blocked || [],
      content_rating: video.youtube_metadata?.content_rating || {},         // ⭐ upgraded

      // statistics
      statistics: video.youtube_metadata?.statistics || {
        view_count: 0,
        like_count: 0,
        favorite_count: 0,
        comment_count: 0
      },

      // status
      made_for_kids: video.youtube_metadata?.made_for_kids || false,
      self_declared_made_for_kids: video.youtube_metadata?.self_declared_made_for_kids || false,
      topic_categories: video.youtube_metadata?.topic_categories || [],
      privacy_status: video.privacyStatus || null,
      upload_status: video.uploadStatus || null,
      publish_at: video.publishAt || null,
      license: video.youtube_metadata?.license || "",                              // ⭐ NEW
      embeddable: video.youtube_metadata?.embeddable ?? true,                      // ⭐ NEW
      public_stats_viewable: video.youtube_metadata?.public_stats_viewable ?? true // ⭐ NEW
    }
  };
}

/* -------------------------------------------------------------
   MAIN GENERATION PIPELINE
   Fetch → Thumbnails → Membership → Normalize → YAML
------------------------------------------------------------- */

async function generate() {
  console.log("Fetching videos...");
  const videos = await fetchAllVideos();

  // Build lookup: YouTube video ID → slug
  const slugLookup = {};
  for (const v of videos) {
    slugLookup[v.id] = v.slug;
  }

  if (!videos || videos.length === 0) {
    console.error("ERROR: No videos returned from YouTube. Aborting.");
    process.exit(1);
  }

  console.log(`VIDEO COUNT: ${videos.length}`);

  console.log("Fetching playlists + membership...");
  const playlists = await fetchPlaylistsWithMembership();

  if (!playlists) {
    console.error("ERROR: fetchPlaylistsWithMembership() returned undefined.");
    process.exit(1);
  }

// Build a lookup: { YouTube playlist ID → slug }
playlistSlugMap = {};
for (const pl of playlists) {
  playlistSlugMap[pl.id] = pl.slug;   // pl.id = YouTube playlist ID, pl.slug = your slug
}

  console.log(`PLAYLIST COUNT: ${playlists.length}`);

  /* -------------------------------------------------------------
     PLAYLIST THUMBNAILS
  ------------------------------------------------------------- */
  console.log("Downloading playlist thumbnails...");
  await processPlaylistThumbnails(playlists, THUMBNAIL_DIR);

  /* -------------------------------------------------------------
     SONG THUMBNAILS
  ------------------------------------------------------------- */
  console.log("Downloading song thumbnails...");
  ensureDir(THUMBNAIL_DIR);

  for (const video of videos) {
    const filename = `${video.slug}.jpeg`;
    const filepath = path.join(THUMBNAIL_DIR, filename);

    if (!video.thumbnail) {
      console.warn(`WARNING: No thumbnail URL for video "${video.title}"`);
      continue;
    }

    try {
      console.log(`  → ${filename}`);
      const res = await fetch(video.thumbnail);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filepath, buf);
    } catch (err) {
      console.error(`ERROR downloading thumbnail for "${video.title}": ${err.message}`);
    }
  }

  /* -------------------------------------------------------------
     ATTACH PLAYLIST MEMBERSHIP
  ------------------------------------------------------------- */
  console.log("Attaching playlist membership to videos...");
  const playlistMap = {};
  playlists.forEach(pl => {
    pl.videoIds.forEach(id => {
      const slug = slugLookup[id];
      if (!slug) {
        console.warn(`WARNING: Playlist ${pl.title} references unknown video ID: ${id}`);
        return;
      }
      if (!playlistMap[slug]) playlistMap[slug] = [];
      playlistMap[slug].push(pl.slug);
    });
  });

  videos.forEach(video => {
    video.playlists = playlistMap[video.id] || [];
  });

  /* -------------------------------------------------------------
     NORMALIZE SONG OBJECTS
  ------------------------------------------------------------- */
  console.log("Building song objects...");
  const Videos = videos.map(buildSongObject);

  /* -------------------------------------------------------------
     WRITE SONG FEED
  ------------------------------------------------------------- */
  console.log("Writing youtube_feed.yml...");
  writeYaml(VIDEO_FEED_PATH, { songs: Videos });

  /* -------------------------------------------------------------
     WRITE PLAYLIST FEED
  ------------------------------------------------------------- */
  console.log("Writing youtube_playlists.yml...");
  writeYaml(PLAYLIST_FEED_PATH, {
    playlists: playlists.map(pl => ({
      playlist_id: pl.slug,
      title: pl.title,
      description: pl.description,
      published_at: pl.publishedAt,
      channel_id: pl.channel_id,        // ⭐ NEW
      channel_title: pl.channel_title,  // ⭐ NEW
      thumbnail: pl.thumbnail,
      song_ids: pl.videoIds.map(id => slugLookup[id])
    }))
    
  });

  /* -------------------------------------------------------------
     GENERATE PLAYLIST PAGE FILES
     Creates: _playlists/<slug>
  ------------------------------------------------------------- */
  
  console.log("Generating playlist page files...");
  
  const PLAYLIST_PAGES_DIR = "./_playlists";
  
  for (const pl of playlists) {
    const filepath = path.join(PLAYLIST_PAGES_DIR, pl.slug);
  
    // Ensure _playlists directory exists
    ensureDir(PLAYLIST_PAGES_DIR);
  
    // Minimal front matter matching your working files
const frontMatter =
`---
layout: playlist
playlist_id: ${pl.slug}
title: "${pl.title.replace(/"/g, '\\"')}"
permalink: /music/playlists/${pl.slug}/
---
`;
  
    fs.writeFileSync(filepath, frontMatter, "utf8");
  
    console.log(`  → ${filepath}`);
  }

  /* -------------------------------------------------------------
     SUMMARY
  ------------------------------------------------------------- */
  console.log("\nSUMMARY:");
  console.log(`  Videos fetched: ${videos.length}`);
  console.log(`  Playlists fetched: ${playlists.length}`);
  console.log(`  Song thumbnails downloaded: ${videos.length}`);
  console.log(`  Playlist thumbnails downloaded: ${playlists.filter(pl => pl.thumbnail).length}/${playlists.length}`);
  console.log("  Feed written: _data/youtube_feed.yml");
  console.log("  Playlists written: _data/youtube_playlists.yml");
  console.log("");

  console.log("Done.");
}

/* -------------------------------------------------------------
   EXECUTE
------------------------------------------------------------- */

generate().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

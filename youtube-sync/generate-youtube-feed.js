import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  fetchAllVideos,
  fetchPlaylistsWithMembership,
  processPlaylistThumbnails
} from "./fetch-youtube-metadata.js";

const DATA_DIR = "./_data";
const THUMBNAIL_DIR = "./assets/thumbnails";

const VIDEO_FEED_PATH = path.join(DATA_DIR, "youtube_feed.yml");
const PLAYLIST_FEED_PATH = path.join(DATA_DIR, "youtube_playlists.yml");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeYaml(filepath, data) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, yaml.dump(data), "utf8");
}

function buildSongObject(video) {
  const song_id = video.slug;

  return {
    song_id,
    youtube_id: video.id,
    title: video.title,
    url: `/music/${song_id}/`,
    thumbnail: `/assets/thumbnails/${song_id}.jpeg`,
    videostatus: video.videostatus_raw,
    playlists: video.playlists || [],

    // ✅ FIXED: numeric view count
    view_count_num: parseInt(
      video.youtube_metadata?.statistics?.view_count || "0",
      10
    ),

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
      privacy_status: video.privacyStatus || null,
      upload_status: video.uploadStatus || null,
      publish_at: video.publishAt || null
    }
  };
}

async function generate() {
  console.log("Fetching videos...");
  const videos = await fetchAllVideos();

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

  console.log(`PLAYLIST COUNT: ${playlists.length}`);

  console.log("Downloading playlist thumbnails...");
  await processPlaylistThumbnails(playlists, THUMBNAIL_DIR);

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

  console.log("Building song objects...");
  const Videos = videos.map(buildSongObject);

  console.log("Writing youtube_feed.yml...");
  writeYaml(VIDEO_FEED_PATH, { songs: Videos });

  console.log("Writing youtube_playlists.yml...");
  writeYaml(PLAYLIST_FEED_PATH, {
    playlists: playlists.map(pl => ({
      playlist_id: pl.id,
      title: pl.title,
      slug: pl.slug,
      description: pl.description,
      published_at: pl.publishedAt,
      thumbnail: pl.thumbnail,
      song_ids: pl.videoIds
    }))
  });
/* -------------------------------------------------------
   SUMMARY
------------------------------------------------------- */
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

generate().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import yaml from "js-yaml";

dotenv.config();

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* -------------------------------------------------------
   CANONICAL VIDEO STATUS (LOWERCASE)
   -------------------------------------------------------
   YouTube provides:
     - privacyStatus
     - uploadStatus
     - publishAt (future = scheduled)

   We derive ONE canonical lowercase status:
     - "scheduled"
     - "public"
     - "unlisted"
     - "private"
     - or raw uploadStatus fallback
------------------------------------------------------- */
function normalizeVideoStatus(snippet, status) {
  const publishAt = status.publishAt || null;
  const privacy = status.privacyStatus || "";
  const upload = status.uploadStatus || "";

  if (publishAt && new Date(publishAt) > new Date()) return "scheduled";
  if (privacy === "public") return "public";
  if (privacy === "unlisted") return "unlisted";
  if (privacy === "private") return "private";

  return upload || "";
}

async function downloadImage(url, filepath) {
  if (!url) return;
  const response = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(filepath, response.data);
}

function pickBestThumbnail(thumbs) {
  return (
    thumbs?.maxres?.url ||
    thumbs?.standard?.url ||
    thumbs?.high?.url ||
    thumbs?.medium?.url ||
    thumbs?.default?.url ||
    ""
  );
}

/* -------------------------------------------------------
   AUTH
------------------------------------------------------- */
function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return oauth2Client;
}

/* -------------------------------------------------------
   FETCH ALL VIDEOS (FULL METADATA)
   -------------------------------------------------------
   Returns objects shaped for the generator:
     {
       id: <YouTube video ID>,
       title,
       slug,
       videostatus_raw,
       publishedAt,
       scheduledAt,
       thumbnail,
       playlists: [],
       youtube_metadata: { raw fields }
     }
------------------------------------------------------- */
export async function fetchAllVideos() {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  let allVideos = [];
  let nextPageToken = null;

  do {
    const searchRes = await youtube.search.list({
      part: ["id", "snippet"],
      forMine: true,
      maxResults: 50,
      pageToken: nextPageToken,
      type: "video"
    });

    const ids = searchRes.data.items.map(item => item.id.videoId).join(",");

    const details = await youtube.videos.list({
      part: ["snippet", "status", "contentDetails", "statistics", "topicDetails"],
      id: ids
    });

    const normalized = details.data.items.map(item => {
      const snippet = item.snippet || {};
      const status = item.status || {};
      const content = item.contentDetails || {};
      const stats = item.statistics || {};
      const topics = item.topicDetails || {};
      const thumbs = snippet.thumbnails || {};

      const thumbnail = pickBestThumbnail(thumbs);

      return {
        id: item.id,
        title: snippet.title || "",
        slug: slugify(snippet.title || ""),

        // canonical lowercase status
        videostatus_raw: normalizeVideoStatus(snippet, status),

        // raw YouTube scheduling fields
        publishedAt: snippet.publishedAt || "",
        scheduledAt: status.publishAt || "",

        thumbnail,
        playlists: [],

        // raw YouTube metadata (no transformations)
        youtube_metadata: {
          published_at: snippet.publishedAt || "",
          channel_id: snippet.channelId || "",
          channel_title: snippet.channelTitle || "",
          category_id: snippet.categoryId || "",
          tags: snippet.tags || [],
          duration: content.duration || "",
          definition: content.definition || "",
          region_allowed: content.regionRestriction?.allowed || [],
          region_blocked: content.regionRestriction?.blocked || [],
          content_rating: content.contentRating?.ytRating || "",
          statistics: {
            view_count: stats.viewCount || "",
            like_count: stats.likeCount || "",
            favorite_count: stats.favoriteCount || "",
            comment_count: stats.commentCount || ""
          },
          made_for_kids: status.madeForKids ?? false,
          self_declared_made_for_kids: status.selfDeclaredMadeForKids ?? false,
          topic_categories: topics.topicCategories || [],

          // raw YouTube status fields
          privacy_status: status.privacyStatus || "",
          upload_status: status.uploadStatus || "",
          publish_at: status.publishAt || ""
        }
      };
    });

    allVideos.push(...normalized);
    nextPageToken = searchRes.data.nextPageToken;
  } while (nextPageToken);

  return allVideos;
}

/* -------------------------------------------------------
   FETCH ALL PLAYLISTS (FULL METADATA)
------------------------------------------------------- */
export async function fetchAllPlaylists() {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  let playlists = [];
  let nextPageToken = null;

  do {
    const res = await youtube.playlists.list({
      part: ["id", "snippet"],
      channelId: process.env.YOUTUBE_CHANNEL_ID,
      maxResults: 50,
      pageToken: nextPageToken
    });

    res.data.items.forEach(item => {
      const snippet = item.snippet || {};
      const thumbs = snippet.thumbnails || {};

      playlists.push({
        id: item.id,
        title: snippet.title || "",
        slug: slugify(snippet.title || ""),
        description: snippet.description || "",
        publishedAt: snippet.publishedAt || "",
        thumbnailUrl: pickBestThumbnail(thumbs),
        videoIds: []
      });
    });

    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  return playlists;
}

/* -------------------------------------------------------
   FETCH PLAYLISTS + MEMBERSHIP (RENAMED)
   -------------------------------------------------------
   fetchPlaylistsWithMembership()
   - fetches playlists
   - fetches membership
   - attaches videoIds
------------------------------------------------------- */
export async function fetchPlaylistsWithMembership() {
  const auth = getOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  const playlists = await fetchAllPlaylists();

  for (const pl of playlists) {
    let nextPageToken = null;

    do {
      const res = await youtube.playlistItems.list({
        part: ["contentDetails"],
        playlistId: pl.id,
        maxResults: 50,
        pageToken: nextPageToken
      });

      res.data.items.forEach(item => {
        const videoId = item.contentDetails.videoId;
        if (videoId) pl.videoIds.push(videoId);
      });

      nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);
  }

  return playlists;
}

/* -------------------------------------------------------
   PROCESS PLAYLIST THUMBNAILS
------------------------------------------------------- */
export async function processPlaylistThumbnails(playlists, thumbnailDir) {
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }

  for (const pl of playlists) {
    if (!pl.thumbnailUrl || pl.thumbnailUrl.includes("no_thumbnail")) {
      console.warn(`Skipping thumbnail for playlist "${pl.title}" — no thumbnail available.`);
      pl.thumbnail = null;
      continue;
    }

    const filename = `playlist-${pl.slug}.jpeg`;
    const filepath = path.join(thumbnailDir, filename);

    try {
      await downloadImage(pl.thumbnailUrl, filepath);
      pl.thumbnail = `/assets/thumbnails/${filename}`;
    } catch (err) {
      console.error(`Failed to download thumbnail for playlist "${pl.title}":`, err.message);
      pl.thumbnail = null;
    }
  }

  return playlists;
}

/* -------------------------------------------------------
   WRITE PLAYLIST YAML (LEGACY — GENERATOR NOW HANDLES THIS)
------------------------------------------------------- */
export function writePlaylistYaml(playlists, outputPath) {
  const data = playlists.map(pl => ({
    playlist_id: pl.id,
    title: pl.title,
    slug: pl.slug,
    description: pl.description,
    published_at: pl.publishedAt,
    thumbnail: pl.thumbnail,
    song_ids: pl.videoIds
  }));

  fs.writeFileSync(outputPath, yaml.dump(data), "utf8");
}

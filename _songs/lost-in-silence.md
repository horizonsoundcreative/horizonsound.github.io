---
layout: song
title: "Lost in Silence"
subtitle: "A Way Back – Trilogy | Part I"

youtube_id: "59teEpeHah8"
hero_image: "/assets/Temp.jpg"

next_track_url: "/music/choosing-me-her-version/"
next_track_label: "Choosing Me (Her Version)"

tiles:
  - title: "Choosing Me (Her Version)"
    url: "/music/choosing-me-her-version/"
    image: "/assets/choosing-me-her-version.jpg"

  - title: "Choosing Me (His Version)"
    url: "/music/choosing-me-his-version/"
    image: "/assets/choosing-me-his-version.jpg"
---

<!-- SONG TITLE -->
<section class="homepage-section">
  <h2 class="section-header">{{ page.title }}</h2>
  <p class="song-subtitle">{{ page.subtitle }}</p>
</section>

<!-- VIDEO EMBED -->
<section class="homepage-section video-section">
  <div class="video-wrapper">
    <iframe 
      src="https://www.youtube.com/embed/{{ page.youtube_id }}"
      title="{{ page.title }}"
      frameborder="0"
      allowfullscreen>
    </iframe>
  </div>
</section>

<!-- ABOUT SECTION -->
 <section class="homepage-section">
  <div class="centered-column">
    <h2 class="section-header">About the Song</h2>
    <p class="song-description">

    <strong>Official audio for "Lost in Silence" by Horizon Sound.</strong><br><br>

    “Lost in Silence” is a warm, modern acoustic‑pop duet built on bright guitar, soft indie‑pop percussion, 
    and a smooth, uplifting groove. The track blends expressive female vocals with a gentle male counterpoint, 
    layered over subtle electric guitar textures and a polished, radio‑ready mix. Emotional yet hopeful, it 
    captures the quiet ache of two people drifting apart while still wishing each other peace.<br><br>

    The song follows a couple facing the truth that love has faded, even though the care remains. Through 
    shared verses and mirrored perspectives, they navigate distance, unspoken hurt, and the painful honesty 
    of letting go. Their final chorus becomes a mutual release — not out of anger, but acceptance — as they 
    step into new light with gratitude and clarity.<br><br>

    <strong>🎧 Vibe:</strong> acoustic‑pop, warm, emotional, reflective<br>
    <strong>🎤 Vocals:</strong> expressive female lead + soft male duet, airy harmonies<br>
    <strong>🎛️ Production:</strong> bright acoustic guitar, light indie‑pop percussion, warm bass, clean modern polish<br>
    <strong>⚡ Mood:</strong> bittersweet, honest, gentle, quietly hopeful<br><br>
    </p>
  </div>
</section>



<!-- LYRICS SECTION -->
<!-- paste your Lyrics HTML here -->

<!-- TRILOGY NAV -->
<!-- paste your two tiles here for now -->

<!-- NEXT TRACK BUTTON -->
<section class="homepage-section" style="text-align:center; margin-top:40px;">
  <a href="{{ page.next_track_url }}" class="btn-primary">
    Next Track → {{ page.next_track_label }}
  </a>
</section>

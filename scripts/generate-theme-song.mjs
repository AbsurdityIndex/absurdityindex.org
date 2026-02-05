#!/usr/bin/env node
/**
 * Generate the Absurdity Index theme song
 * using ElevenLabs Eleven Music API (composition plan mode)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env manually (no dependency needed)
const envPath = resolve(ROOT, ".env");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const API_KEY = env.ELEVEN_LABS_API_KEY;
if (!API_KEY) {
  console.error("Missing ELEVEN_LABS_API_KEY in .env");
  process.exit(1);
}

// ─── Song Definition ─────────────────────────────────────────────

const compositionPlan = {
  positive_global_styles: [
    "upbeat satirical indie rock",
    "catchy anthem",
    "Schoolhouse Rock meets late night comedy",
    "driving drums and bright guitar",
    "witty and fun",
    "male vocals",
    "energetic and punchy",
  ],
  negative_global_styles: [
    "slow",
    "sad",
    "ambient",
    "classical",
    "heavy metal",
    "mumble rap",
    "lo-fi",
  ],
  sections: [
    {
      section_name: "Verse 1",
      positive_local_styles: [
        "building energy",
        "spoken-word cadence with melody",
        "witty delivery",
      ],
      negative_local_styles: ["quiet", "whisper"],
      duration_ms: 18000,
      lines: [
        "They named a hundred post offices last year",
        "Spent eight million bucks on an empty room",
        "Banned TikTok in fifty days flat",
        "But healthcare? Yeah we'll get to that",
      ],
    },
    {
      section_name: "Chorus",
      positive_local_styles: [
        "big singalong chorus",
        "anthemic",
        "hook-driven",
        "memorable melody",
      ],
      negative_local_styles: ["subdued", "monotone"],
      duration_ms: 18000,
      lines: [
        "Welcome to the Absurdity Index!",
        "Where the bills make sense and the laws don't",
        "Real bills, real absurdity",
        "Welcome to Absurdity Index dot I O",
      ],
    },
    {
      section_name: "Verse 2",
      positive_local_styles: [
        "playful energy",
        "tongue-in-cheek delivery",
        "building momentum",
      ],
      negative_local_styles: ["serious", "somber"],
      duration_ms: 18000,
      lines: [
        "Pizza is a vegetable it's the law",
        "They took recess from recess that's a fact",
        "A billion pages no one's ever read",
        "Common sense? They declared it dead",
      ],
    },
    {
      section_name: "Final Chorus",
      positive_local_styles: [
        "bigger than first chorus",
        "triumphant",
        "crowd singalong energy",
        "powerful hook",
      ],
      negative_local_styles: ["fade out", "quiet ending"],
      duration_ms: 20000,
      lines: [
        "Welcome to the Absurdity Index!",
        "Where the bills make sense and the laws don't",
        "Real bills, real absurdity",
        "The gavel falls on empty chairs",
        "Welcome to Absurdity Index dot I O!",
      ],
    },
  ],
};

// ─── Generate ────────────────────────────────────────────────────

async function generate() {
  console.log("🎵 Generating Absurdity Index theme song...");
  console.log("   Style:", compositionPlan.positive_global_styles.join(", "));
  console.log(
    "   Sections:",
    compositionPlan.sections.map((s) => s.section_name).join(" → ")
  );
  console.log(
    "   Total duration:",
    compositionPlan.sections.reduce((sum, s) => sum + s.duration_ms, 0) / 1000,
    "seconds"
  );
  console.log();

  const response = await fetch(
    "https://api.elevenlabs.io/v1/music/detailed",
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        composition_plan: compositionPlan,
        model_id: "music_v1",
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error ${response.status}:`, errorText);
    process.exit(1);
  }

  // The response is multipart/mixed with JSON metadata + binary audio
  const contentType = response.headers.get("content-type") || "";
  console.log("Response content-type:", contentType);

  if (contentType.includes("multipart")) {
    // Parse multipart response
    const buffer = Buffer.from(await response.arrayBuffer());
    const boundary = contentType.split("boundary=")[1]?.split(";")[0];

    if (boundary) {
      const parts = splitMultipart(buffer, boundary);
      for (const part of parts) {
        if (part.contentType?.includes("audio")) {
          const outPath = resolve(ROOT, "public", "theme-song.mp3");
          writeFileSync(outPath, part.body);
          console.log(`✅ Saved to ${outPath} (${(part.body.length / 1024).toFixed(1)} KB)`);
        } else if (part.contentType?.includes("json")) {
          console.log("📋 Metadata:", part.body.toString("utf-8"));
        }
      }
    }
  } else {
    // Simple binary response
    const buffer = Buffer.from(await response.arrayBuffer());
    const outPath = resolve(ROOT, "public", "theme-song.mp3");
    writeFileSync(outPath, buffer);
    console.log(`✅ Saved to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  console.log("\n🎶 Done! Theme song generated.");
}

function splitMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;

    if (start > 0) {
      const partBuf = buffer.slice(start, idx);
      const headerEnd = partBuf.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const headers = partBuf.slice(0, headerEnd).toString("utf-8");
        const body = partBuf.slice(headerEnd + 4, -2); // trim trailing \r\n
        const ctMatch = headers.match(/content-type:\s*(.+)/i);
        parts.push({
          contentType: ctMatch ? ctMatch[1].trim() : null,
          body,
        });
      }
    }
    start = idx + boundaryBuf.length + 2; // skip boundary + \r\n
  }

  return parts;
}

generate().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

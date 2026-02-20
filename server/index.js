const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ─── Config ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://jacesabr_db_user:kLUZxvD2GVvYgGVy@cluster0.kj3vcve.mongodb.net/uncensored-ai?retryWrites=true&w=majority&appName=Cluster0";
const JWT_SECRET = process.env.JWT_SECRET || "unleashed-secret-2024";
const CHAT_MODEL = process.env.CHAT_MODEL || "dolphin-llama3";
const COLAB_URL = process.env.COLAB_URL || "https://YOUR-NGROK-URL.ngrok-free.dev";

// ─── MongoDB ──────────────────────────────────────────────────────
mongoose.connect(MONGO_URI);

const UserSchema = new mongoose.Schema({
  phraseHash: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
});
const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  imageUrl: { type: String },
  ponyImageUrl: { type: String },
  realvisImageUrl: { type: String },
  videoUrl: { type: String },
  timestamp: { type: Date, default: Date.now },
});
const ConversationSchema = new mongoose.Schema({
  conversationId: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, default: "New Chat" },
  systemPrompt: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);
const Conversation = mongoose.model("Conversation", ConversationSchema);

// ─── Auth ─────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
};

// Passphrase auth — hash the phrase, find or create user
app.post("/api/auth/phrase", async (req, res) => {
  try {
    const { phrase } = req.body;
    if (!phrase || phrase.trim().length < 3) return res.status(400).json({ error: "Phrase must be at least 3 characters" });
    const phraseHash = crypto.createHash("sha256").update(phrase.trim().toLowerCase()).digest("hex");
    let user = await User.findOne({ phraseHash });
    if (!user) user = await User.create({ phraseHash });
    const token = jwt.sign({ id: user._id, phrase: phrase.trim().toLowerCase() }, JWT_SECRET, { expiresIn: "90d" });
    res.json({ token, user: { id: user._id, phrase: phrase.trim().toLowerCase() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Conversations ────────────────────────────────────────────────
app.get("/api/conversations", auth, async (req, res) => {
  res.json(await Conversation.find({ userId: req.user.id }).sort({ updatedAt: -1 }));
});
app.post("/api/conversations", auth, async (req, res) => {
  const conversationId = uuidv4();
  res.json(await Conversation.create({ conversationId, userId: req.user.id, title: req.body.title || "New Chat", systemPrompt: req.body.systemPrompt || "" }));
});
app.delete("/api/conversations/:id", auth, async (req, res) => {
  await Conversation.deleteOne({ conversationId: req.params.id, userId: req.user.id });
  await Message.deleteMany({ conversationId: req.params.id });
  res.json({ success: true });
});
app.get("/api/conversations/:id/messages", auth, async (req, res) => {
  res.json(await Message.find({ conversationId: req.params.id }).sort({ timestamp: 1 }));
});

// ─── Image request detection ─────────────────────────────────────
const IMAGE_KEYWORDS = [
  "show me", "generate", "create", "make", "draw", "paint", "render",
  "picture of", "image of", "photo of", "illustration of", "depict",
  "visualize", "show a", "show an", "send me", "give me a picture",
  "give me an image", "i want to see", "let me see", "can you show",
];

function isImageRequest(msg) {
  const lower = msg.toLowerCase();
  const hasKeyword = IMAGE_KEYWORDS.some(k => lower.includes(k));
  const hasVisualWord = /(image|picture|photo|pic|draw|paint|render|illustrat|visual|show|see|generat|depict|portrait|nude|naked|nsfw|sexy|body|face|woman|man|girl|guy|scene|landscape|city|anime|art)\b/i.test(lower);
  return hasKeyword && hasVisualWord;
}

function extractImagePrompt(msg) {
  let prompt = msg
    .replace(/^(please|can you|could you|hey|ok|okay|now)\s*/i, "")
    .replace(/^(show me|generate|create|make|draw|paint|render|send me|give me)\s*(a|an|the|some)?\s*(picture|image|photo|illustration|drawing|painting|render|pic)?\s*(of|showing|with|depicting)?\s*/i, "")
    .replace(/^(i want to see|let me see|can you show me)\s*(a|an|the)?\s*(picture|image|photo)?\s*(of)?\s*/i, "")
    .trim();
  if (prompt.length < 5) prompt = msg;
  return prompt;
}

// ─── Video request detection ─────────────────────────────────────
const VIDEO_KEYWORDS = [
  "video of", "video showing", "make a video", "generate a video",
  "create a video", "animate", "animation of", "moving", "clip of",
  "record", "film", "footage", "motion", "make a clip",
  "generate video", "create video", "show me a video",
  "video with", "short video", "video clip",
];

function isVideoRequest(msg) {
  const lower = msg.toLowerCase();
  return VIDEO_KEYWORDS.some(k => lower.includes(k));
}

function extractVideoPrompt(msg) {
  let prompt = msg
    .replace(/^(please|can you|could you|hey|ok|okay|now)\s*/i, "")
    .replace(/^(show me|generate|create|make|send me|give me)\s*(a|an|the|some)?\s*(short|quick|brief|little)?\s*(video|animation|clip|footage|film)?\s*(of|showing|with|depicting|where)?\s*/i, "")
    .replace(/^(i want to see|let me see|can you show me)\s*(a|an|the)?\s*(video|animation|clip)?\s*(of)?\s*/i, "")
    .replace(/^(animate|film|record)\s*(a|an|the|some|me)?\s*/i, "")
    .trim();
  if (prompt.length < 5) prompt = msg;
  return prompt;
}

// ─── Smart aspect ratio selection ────────────────────────────────
// SDXL native res is 1024x1024. These are all SDXL-optimal bucket sizes
// that stay within T4 VRAM limits (~10-12GB free after chat model).
function chooseImageDimensions(prompt) {
  const lower = prompt.toLowerCase();

  // Multi-subject indicators → landscape to fit everyone in frame
  const multiSubject = /(and|with|together|couple|group|family|friends|two|three|four|both|them|people|crowd|husband|wife|boyfriend|girlfriend|pair|duo|side by side|holding hands|facing each other|next to|between)/i;
  // Scene/environment indicators → landscape
  const sceneWords = /(landscape|panorama|cityscape|skyline|beach|forest|room|kitchen|bar|cafe|restaurant|street|park|garden|battlefield|stadium|wide shot|establishing shot|full body|full scene)/i;
  // Portrait/closeup indicators → tall
  const portraitWords = /(portrait|headshot|close.?up|face|selfie|bust|mugshot|solo|alone|single person)/i;

  if (portraitWords.test(lower)) {
    return { width: 832, height: 1216 };   // portrait — SDXL optimal bucket
  }
  if (multiSubject.test(lower) || sceneWords.test(lower)) {
    return { width: 1216, height: 832 };   // landscape — SDXL optimal bucket
  }
  // Default: SDXL native square
  return { width: 1024, height: 1024 };
}

// ─── Chat (SSE streaming, with auto image/video detection) ───────
app.post("/api/chat", auth, async (req, res) => {
  const { conversationId, message, systemPrompt } = req.body;
  await Message.create({ conversationId, role: "user", content: message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // ── Check for explicit generation mode tags (from UI buttons) ──
  const isExplicitImage = message.startsWith("[IMAGE] ");
  const isExplicitVideo = message.startsWith("[VIDEO] ");
  const cleanMessage = message.replace(/^\[(IMAGE|VIDEO)\]\s*/, "");

  // ── Check if user wants a VIDEO ──
  if (isExplicitVideo || (!isExplicitImage && isVideoRequest(message))) {
    const prompt = isExplicitVideo ? cleanMessage : extractVideoPrompt(message);
    console.log(`[VIDEO-AUTO] Detected video request, prompt: "${prompt}"`);

    res.write(`data: ${JSON.stringify({ token: "🎬 Generating video with Wan 1.3B... This may take 2-5 minutes." })}\n\n`);

    try {
      const vidRes = await fetch(`${COLAB_URL}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 600000, // 10 min timeout for video gen
        body: JSON.stringify({
          prompt,
          negative_prompt: "ugly, blurry, low quality, deformed, disfigured, static, still image, watermark, text",
          num_frames: 16,
          width: 512,
          height: 320,
          num_inference_steps: 25,
          guidance_scale: 5.0,
        }),
      });
      const data = await vidRes.json();

      if (data.video) {
        const videoUrl = `data:video/mp4;base64,${data.video}`;
        const content = `Here's the video I generated for: "${prompt}" (${data.resolution}, ${data.frames} frames, ${data.elapsed?.toFixed(1)}s)`;
        await Message.create({ conversationId, role: "assistant", content, videoUrl });
        Conversation.updateOne({ conversationId }, { updatedAt: new Date(), title: `🎬 ${prompt.substring(0, 40)}...` }).exec();
        res.write(`data: ${JSON.stringify({ token: "" })}\n\n`);
        res.write(`data: ${JSON.stringify({ video: videoUrl })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ token: "\n\n⚠️ Video generation failed: " + (data.error || "unknown error"), done: true })}\n\n`);
      }
    } catch (err) {
      console.error("[VIDEO-AUTO] Error:", err.message);
      res.write(`data: ${JSON.stringify({ token: "\n\n⚠️ Could not reach video server. Is Colab running?", done: true })}\n\n`);
    }
    return res.end();
  }

  // ── Check if user wants an IMAGE ──
  if (isExplicitImage || isImageRequest(message)) {
    const prompt = isExplicitImage ? cleanMessage : extractImagePrompt(message);
    console.log(`[IMAGE-AUTO] Detected image request, prompt: "${prompt}"`);

    // Smart aspect ratio: landscape for multi-subject/scene, portrait for single subject
    const { width, height } = chooseImageDimensions(prompt);
    console.log(`[IMAGE-AUTO] Dimensions: ${width}x${height}`);

    res.write(`data: ${JSON.stringify({ token: "🎨 Generating images from both models..." })}\n\n`);

    try {
      const imgRes = await fetch(`${COLAB_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: "ugly, blurry, low quality, deformed, disfigured, anime, cartoon, illustration, drawing, 3d render, cgi, furry, animal ears, tail",
          width, height,
        }),
      });
      const data = await imgRes.json();

      if (data.image) {
        const ponyUrl = data.pony_image ? `data:image/png;base64,${data.pony_image}` : null;
        const realvisUrl = data.realvis_image ? `data:image/png;base64,${data.realvis_image}` : `data:image/png;base64,${data.image}`;
        const content = `Here's what I generated for: "${prompt}"`;
        await Message.create({ conversationId, role: "assistant", content, imageUrl: realvisUrl, ponyImageUrl: ponyUrl, realvisImageUrl: realvisUrl });
        Conversation.updateOne({ conversationId }, { updatedAt: new Date(), title: `🎨 ${prompt.substring(0, 40)}...` }).exec();
        res.write(`data: ${JSON.stringify({ token: "" })}\n\n`);
        res.write(`data: ${JSON.stringify({ image: realvisUrl, ponyImage: ponyUrl, realvisImage: realvisUrl })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ token: "\n\n⚠️ Image generation failed: " + (data.error || "unknown error"), done: true })}\n\n`);
      }
    } catch (err) {
      console.error("[IMAGE-AUTO] Error:", err.message);
      res.write(`data: ${JSON.stringify({ token: "\n\n⚠️ Could not reach image server. Is Colab running?", done: true })}\n\n`);
    }
    return res.end();
  }

  // ── Normal text chat ──
  const history = await Message.find({ conversationId }).sort({ timestamp: 1 }).limit(50);
  const messages = [];
  messages.push({ role: "system", content: systemPrompt || "You are an uncensored, helpful AI assistant." });
  for (const msg of history) { if (msg.role !== "system") messages.push({ role: msg.role, content: msg.content }); }

  try {
    const llmRes = await fetch(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true, temperature: 0.7, max_tokens: -1 }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      res.write(`data: ${JSON.stringify({ error: `LLM returned ${llmRes.status}: ${errText}` })}\n\n`);
      return res.end();
    }

    let fullResponse = "";
    const reader = llmRes.body;

    reader.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.trim() === "data: [DONE]") {
          Message.create({ conversationId, role: "assistant", content: fullResponse });
          Conversation.updateOne({ conversationId }, { updatedAt: new Date(), title: fullResponse.substring(0, 50) + (fullResponse.length > 50 ? "..." : "") }).exec();
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }
        if (line.startsWith("data: ")) {
          try {
            const json = JSON.parse(line.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) { fullResponse += token; res.write(`data: ${JSON.stringify({ token })}\n\n`); }
            if (json.choices?.[0]?.finish_reason === "stop") {
              Message.create({ conversationId, role: "assistant", content: fullResponse });
              Conversation.updateOne({ conversationId }, { updatedAt: new Date(), title: fullResponse.substring(0, 50) + (fullResponse.length > 50 ? "..." : "") }).exec();
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            }
          } catch {}
        }
      }
    });
    reader.on("error", (err) => { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); });
    reader.on("end", () => {
      if (fullResponse && !res.writableEnded) {
        Message.create({ conversationId, role: "assistant", content: fullResponse });
        Conversation.updateOne({ conversationId }, { updatedAt: new Date(), title: fullResponse.substring(0, 50) + (fullResponse.length > 50 ? "..." : "") }).exec();
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: `Failed to connect to Colab at ${COLAB_URL}. Is the notebook running?` })}\n\n`);
    res.end();
  }
});

// ─── Health ───────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  let llm = false, img = false, vid = false;
  try { const r = await fetch(`${COLAB_URL}/v1/models`, { timeout: 5000 }); llm = r.ok; } catch {}
  try {
    const r = await fetch(`${COLAB_URL}/health`, { timeout: 5000 });
    if (r.ok) {
      const data = await r.json();
      img = true;
      vid = !!data.video;
    }
  } catch {}
  res.json({ ollama: llm, comfyui: img, video: vid, model: CHAT_MODEL, backend: "colab" });
});

app.listen(PORT, () => {
  console.log(`\n⚡ UNLEASHED AI — port ${PORT}`);
  console.log(`   Colab: ${COLAB_URL}`);
  console.log(`   Features: Chat + Images + Video\n`);
});
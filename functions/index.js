const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Cache simples do token da Twitch para evitar pedir toda hora
let tokenCache = { token: null, expiresAtMs: 0 };

async function getTwitchToken(clientId, clientSecret) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAtMs - 60_000 > now) {
    return tokenCache.token;
  }

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twitch token error: ${res.status} ${txt}`);
  }

  const json = await res.json();
  const token = json.access_token;
  const expiresIn = Number(json.expires_in || 0);

  tokenCache = {
    token,
    expiresAtMs: now + Math.max(0, expiresIn) * 1000
  };

  return token;
}

async function fetchTwitchStreams({ clientId, token, logins }) {
  // Helix aceita varios user_login
  const url = new URL("https://api.twitch.tv/helix/streams");
  for (const login of logins) url.searchParams.append("user_login", login);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twitch helix error: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

exports.syncTwitchLives = functions
  .region("us-central1")
  .pubsub.schedule("every 2 minutes")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const cfg = functions.config();
    const clientId = cfg?.twitch?.client_id;
    const clientSecret = cfg?.twitch?.client_secret;

    if (!clientId || !clientSecret) {
      console.log("Twitch config nao definido. Use:\n  firebase functions:config:set twitch.client_id=... twitch.client_secret=...\n  firebase deploy --only functions");
      return null;
    }

    // Pega todas as lives Twitch cadastradas
    const snap = await db
      .collection("lives")
      .where("plataforma", "==", "Twitch")
      .get();

    if (snap.empty) {
      console.log("Nenhuma live Twitch cadastrada.");
      return null;
    }

    const docs = [];
    const logins = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const login = String(data.twitchLogin || "").trim().toLowerCase();
      if (!login) return;
      docs.push({ ref: d.ref, data, login });
      logins.push(login);
    });

    if (!docs.length) {
      console.log("Lives Twitch sem twitchLogin.");
      return null;
    }

    const token = await getTwitchToken(clientId, clientSecret);

    // Helix permite ate 100 logins por request
    const batches = chunk([...new Set(logins)], 100);

    const liveMap = new Map();
    for (const b of batches) {
      const streams = await fetchTwitchStreams({ clientId, token, logins: b });
      for (const s of streams) {
        const login = String(s.user_login || "").toLowerCase();
        liveMap.set(login, s);
      }
    }

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const it of docs) {
      const stream = liveMap.get(it.login);
      const isLive = !!stream;

      const update = {
        ativo: isLive,
        autoStatusSource: "twitch",
        twitchIsLive: isLive,
        twitchCheckedAt: now,
        updatedAt: now
      };

      if (stream) {
        // dados de plataforma
        update.tituloPlataforma = stream.title || "";
        update.twitchTitle = stream.title || "";
        update.twitchGame = stream.game_name || "";
        update.twitchViewers = Number(stream.viewer_count || 0);

        // se autoSyncTitle estiver true, sobrescreve o titulo exibido
        if (it.data.autoSyncTitle === true) {
          update.titulo = stream.title || it.data.titulo || "";
        }
      } else {
        update.twitchViewers = 0;
      }

      batch.set(it.ref, update, { merge: true });
    }

    await batch.commit();
    console.log(`syncTwitchLives ok. checados: ${docs.length}, ao vivo: ${liveMap.size}`);
    return null;
  });

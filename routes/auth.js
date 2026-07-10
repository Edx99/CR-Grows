const express          = require("express");
const bcrypt           = require("bcryptjs");
const jwt              = require("jsonwebtoken");
const crypto           = require("crypto");
const { getContainer } = require("../config/cosmos");

const router = express.Router();

// ── HELPER: verify JWT ────────────────────────────────────
function verifyToken(req) {
  const header = req.headers.authorization;
  if (!header) throw new Error("No token.");
  const token = header.split(" ")[1];
  return jwt.verify(token, process.env.JWT_SECRET);
}

function getDisplayName(user) {
  return user?.nickname || user?.name || user?.email?.split('@')[0] || 'Usuario';
}

function calculateAveragePercent(appState) {
  const days = appState?.days || {};
  const values = Object.values(days);
  if (!values.length) return 0;
  const total = values.reduce((sum, item) => sum + (item?.percent || 0), 0);
  return Math.round(total / values.length);
}

function calculateLongestStreak(appState) {
  if (typeof appState?.longestStreak === 'number' && appState.longestStreak > 0) {
    return appState.longestStreak;
  }
  if (typeof appState?.streak === 'number' && appState.streak > 0) {
    return appState.streak;
  }

  const days = appState?.days || {};
  const sortedDates = Object.keys(days).sort();
  let streak = 0;
  let best = 0;

  sortedDates.forEach((date) => {
    const percent = days[date]?.percent || 0;
    if (percent >= 60) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  });

  return best;
}

function mergeUniqueById(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();
  (secondary || []).forEach(item => {
    if (item && item.id) {
      merged.push(item);
      seen.add(item.id);
    }
  });
  (primary || []).forEach(item => {
    if (!item) return;
    if (item.id) {
      if (!seen.has(item.id)) {
        merged.push(item);
        seen.add(item.id);
      }
    } else {
      merged.push(item);
    }
  });
  return merged;
}

function mergeHelpSettings(server = {}, local = {}) {
  const merged = { ...local, ...server };
  Object.keys(merged).forEach(key => {
    if (server[key] && local[key] && typeof server[key] === 'object' && typeof local[key] === 'object') {
      merged[key] = { ...local[key], ...server[key] };
    }
  });
  return merged;
}

function mergeAppState(current = {}, incoming = {}) {
  return {
    days: Object.keys(incoming.days || {}).length ? incoming.days : (current.days || {}),
    weekly: Array.isArray(incoming.weekly) && incoming.weekly.length ? incoming.weekly : (Array.isArray(current.weekly) ? current.weekly : []),
    streak: typeof incoming.streak === 'number' && incoming.streak > 0 ? incoming.streak : (typeof current.streak === 'number' ? current.streak : 0),
    helpSettings: mergeHelpSettings(incoming.helpSettings || {}, current.helpSettings || {}),
    templates: Array.isArray(incoming.templates) && incoming.templates.length ? mergeUniqueById(incoming.templates, current.templates) : (Array.isArray(current.templates) ? current.templates : []),
    financeEntries: Array.isArray(incoming.financeEntries) && incoming.financeEntries.length ? mergeUniqueById(incoming.financeEntries, current.financeEntries) : (Array.isArray(current.financeEntries) ? current.financeEntries : []),
  };
}

// ── HELPER: find user by email ────────────────────────────
async function findUser(email) {
  const usersContainer = getContainer();
  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @e",
      parameters: [{ name: "@e", value: email }],
    })
    .fetchAll();
  return { usersContainer, user: resources[0] || null };
}

async function findUserByNickname(nickname) {
  const usersContainer = getContainer();
  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE LOWER(c.nickname) = LOWER(@n)",
      parameters: [{ name: "@n", value: nickname }],
    })
    .fetchAll();
  return { usersContainer, user: resources[0] || null };
}

// ── REGISTER ──────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "All fields are required." });

    const { usersContainer, user: existing } = await findUser(email);
    if (existing)
      return res.status(400).json({ error: "Email already registered." });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomBytes(12).toString('hex');
    const { resource: created } = await usersContainer.items.create({
      id,
      name: name || "",
      nickname: "",
      email,
      passwordHash,
      friends: [],
      appState: null,
      createdAt: new Date().toISOString(),
    });

    console.log(`User registered: email=${email} id=${created.id}`);

    res.json({ message: "Account created successfully." });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── LOGIN ─────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "All fields are required." });

    const { user } = await findUser(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid email or password." });

    const token = jwt.sign(
      { email: user.email, id: user.id, name: user.name, nickname: user.nickname || '' },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── FORGOT PASSWORD ───────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const { usersContainer, user } = await findUser(email);

    if (!user)
      return res.json({ message: "If that email exists, a reset link was sent." });

    const resetToken      = crypto.randomBytes(32).toString("hex");
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    try {
      console.log(`Upserting user item (forgot-password): id=${user.id}`);
      await usersContainer.items.upsert(user);
    } catch (errReplace) {
      console.error('Error upserting user item (forgot-password):', errReplace);
      throw errReplace;
    }

    const resetLink = `https://wapedxtest01.azurewebsites.net/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: email,
      from: "noreply@yourdomain.com",
      subject: "Reset your password",
      html: `<p>Click below to reset your password (expires in 1 hour).</p>
             <a href="${resetLink}">Reset my password</a>`,
    });

    res.json({ message: "If that email exists, a reset link was sent." });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const { usersContainer, user } = await findUser(email);

    if (!user || user.resetToken !== token || Date.now() > user.resetTokenExpiry)
      return res.status(400).json({ error: "Invalid or expired token." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetTokenExpiry;
    try {
      console.log(`Upserting user item (reset-password): id=${user.id}`);
      await usersContainer.items.upsert(user);
    } catch (errReplace) {
      console.error('Error upserting user item (reset-password):', errReplace);
      throw errReplace;
    }

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET PROFILE ──────────────────────────────────────────
router.get("/profile", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { user } = await findUser(payload.email);

    if (!user)
      return res.status(404).json({ error: "User not found." });

    res.json({
      profile: {
        nickname: user.nickname || "",
        friends: user.friends || []
      }
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// ── SET NICKNAME ────────────────────────────────────────
router.post("/profile/nickname", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { nickname } = req.body;
    const cleanNickname = (nickname || "").trim();

    if (!cleanNickname) {
      return res.status(400).json({ error: "Nickname is required." });
    }

    const { user: existing } = await findUserByNickname(cleanNickname);
    const { usersContainer, user } = await findUser(payload.email);

    if (!user)
      return res.status(404).json({ error: "User not found." });

    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "That nickname is already taken." });
    }

    user.nickname = cleanNickname;
    user.updatedAt = new Date().toISOString();
    await usersContainer.items.upsert(user);

    res.json({ profile: { nickname: cleanNickname, friends: user.friends || [] } });
  } catch (err) {
    console.error("Set nickname error:", err);
    if (err.message && err.message.toLowerCase().includes('token')) {
      res.status(401).json({ error: "Invalid or expired token." });
    } else {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

// ── ADD FRIEND ───────────────────────────────────────────
router.post("/friends", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { nickname } = req.body;
    const cleanNickname = (nickname || "").trim();

    if (!cleanNickname) {
      return res.status(400).json({ error: "Friend nickname is required." });
    }

    const { usersContainer, user } = await findUser(payload.email);
    if (!user) return res.status(404).json({ error: "User not found." });

    const { user: friend } = await findUserByNickname(cleanNickname);
    if (!friend) return res.status(404).json({ error: "Friend not found." });
    if (friend.id === user.id) return res.status(400).json({ error: "You cannot add yourself." });

    const friends = user.friends || [];
    const alreadyAdded = friends.some((item) => item.nickname?.toLowerCase() === cleanNickname.toLowerCase());
    if (alreadyAdded) return res.status(409).json({ error: "Friend already added." });

    friends.push({
      id: friend.id,
      nickname: getDisplayName(friend),
      addedAt: new Date().toISOString()
    });
    user.friends = friends;
    user.updatedAt = new Date().toISOString();
    await usersContainer.items.upsert(user);

    res.json({ profile: { nickname: user.nickname || "", friends } });
  } catch (err) {
    console.error("Add friend error:", err);
    if (err.message && err.message.toLowerCase().includes('token')) {
      res.status(401).json({ error: "Invalid or expired token." });
    } else {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

// ── LEADERBOARD ─────────────────────────────────────────
router.get("/leaderboard", async (req, res) => {
  try {
    verifyToken(req);
    const usersContainer = getContainer();
    const { resources: users } = await usersContainer.items.query({ query: "SELECT * FROM c" }).fetchAll();

    const leaderboard = users
      .filter((user) => user?.email)
      .map((user) => {
        const appState = user.appState || {};
        const avgScore = calculateAveragePercent(appState);
        const longestStreak = calculateLongestStreak(appState);
        return {
          id: user.id,
          email: user.email,
          nickname: user.nickname || getDisplayName(user),
          avgScore,
          streak: appState?.streak || 0,
          longestStreak,
          isCurrentUser: false
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore || b.longestStreak - a.longestStreak || b.streak - a.streak);

    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    res.json({ leaderboard });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// ── GET STATE ─────────────────────────────────────────────
router.get("/state", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { user } = await findUser(payload.email);

    if (!user)
      return res.status(404).json({ error: "User not found." });

    const appState = user.appState || null;
    const templatesCount = Array.isArray(appState?.templates) ? appState.templates.length : 0;
    const financeCount = Array.isArray(appState?.financeEntries) ? appState.financeEntries.length : 0;
    console.log(`GET /state for ${payload.email} → appState exists: ${!!appState}, templates: ${templatesCount}, financeEntries: ${financeCount}`);
    console.log('GET /state returning appState keys:', appState ? Object.keys(appState) : 'null');
    res.json({ state: appState });
  } catch (err) {
    console.error("Get state error:", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// ── POST STATE ────────────────────────────────────────────
function ensureAppState(state) {
  const base = state && typeof state === 'object' ? { ...state } : {};
  base.days = base.days && typeof base.days === 'object' ? base.days : {};
  base.weekly = Array.isArray(base.weekly) ? base.weekly : [];
  base.streak = typeof base.streak === 'number' ? base.streak : 0;
  base.helpSettings = base.helpSettings && typeof base.helpSettings === 'object' ? { ...base.helpSettings } : {};
  base.templates = Array.isArray(base.templates) ? base.templates : [];
  base.financeEntries = Array.isArray(base.financeEntries) ? base.financeEntries : [];
  return base;
}

function mergeArrayById(preferred = [], fallback = []) {
  if (!Array.isArray(preferred) || preferred.length === 0) return Array.isArray(fallback) ? fallback : [];
  if (!Array.isArray(fallback) || fallback.length === 0) return preferred;
  const merged = [];
  const seen = new Set();
  preferred.forEach(item => {
    if (item && item.id) {
      merged.push(item);
      seen.add(item.id);
    }
  });
  fallback.forEach(item => {
    if (!item) return;
    const id = item.id;
    if (!id || !seen.has(id)) {
      merged.push(item);
      if (id) seen.add(id);
    }
  });
  return merged;
}

function mergeHelpSettings(current = {}, incoming = {}) {
  const merged = { ...current, ...incoming };
  Object.keys(merged).forEach(key => {
    if (current[key] && incoming[key] && typeof current[key] === 'object' && typeof incoming[key] === 'object') {
      merged[key] = { ...current[key], ...incoming[key] };
    }
  });
  return merged;
}

function mergeAppState(current = {}, incoming = {}) {
  const safeCurrent = ensureAppState(current);
  const safeIncoming = ensureAppState(incoming);
  return {
    days: Object.keys(safeIncoming.days).length ? safeIncoming.days : safeCurrent.days,
    weekly: safeIncoming.weekly.length ? safeIncoming.weekly : safeCurrent.weekly,
    streak: safeIncoming.streak > 0 ? safeIncoming.streak : safeCurrent.streak,
    helpSettings: mergeHelpSettings(safeCurrent.helpSettings, safeIncoming.helpSettings),
    templates: mergeArrayById(safeIncoming.templates, safeCurrent.templates),
    financeEntries: mergeArrayById(safeIncoming.financeEntries, safeCurrent.financeEntries),
  };
}

router.post("/state", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { usersContainer, user } = await findUser(payload.email);

    console.log(`POST /state received for ${payload.email} with body:`, req.body);
    if (!user)
      return res.status(404).json({ error: "User not found." });

    if (!req.body || typeof req.body.state !== 'object') {
      return res.status(400).json({ error: 'Invalid state payload.' });
    }

    const mergedAppState = mergeAppState(user.appState || {}, req.body.state || {});
    user.appState = mergedAppState;
    try {
      console.log(`Upserting user item (/state): id=${user.id} templates:${mergedAppState.templates.length} financeEntries:${mergedAppState.financeEntries.length}`);
      await usersContainer.items.upsert(user);
      console.log(`POST /state for ${payload.email} → saved OK`);
      res.json({ message: "State saved." });
    } catch (errReplace) {
      console.error('Error upserting user item (/state):', errReplace);
      return res.status(500).json({ error: 'Failed to save state to database.' });
    }
  } catch (err) {
    console.error("Save state error:", err);
    if (err.message && err.message.toLowerCase().includes('token')) {
      res.status(401).json({ error: "Invalid or expired token." });
    } else {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

module.exports = router;
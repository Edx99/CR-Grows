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
    // Ensure we write a stable `id` so future replace() calls can target the item reliably
    const id = crypto.randomBytes(12).toString('hex');
    const { resource: created } = await usersContainer.items.create({
      id,
      name: name || "",
      email,
      passwordHash,
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
      { email: user.email, id: user.id, name: user.name },
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
      console.log(`Replacing user item (forgot-password): id=${user.id} partition=${user.email}`);
      await usersContainer.item(user.id, user.email).replace(user);
    } catch (errReplace) {
      console.error('Error replacing user item (forgot-password):', errReplace);
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
      console.log(`Replacing user item (reset-password): id=${user.id} partition=${user.email}`);
      await usersContainer.item(user.id, user.email).replace(user);
    } catch (errReplace) {
      console.error('Error replacing user item (reset-password):', errReplace);
      throw errReplace;
    }

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET STATE ─────────────────────────────────────────────
router.get("/state", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { user } = await findUser(payload.email);

    if (!user)
      return res.status(404).json({ error: "User not found." });

    console.log(`GET /state for ${payload.email} → appState exists: ${!!user.appState}`);
    res.json({ state: user.appState || null });
  } catch (err) {
    console.error("Get state error:", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// ── POST STATE ────────────────────────────────────────────
router.post("/state", async (req, res) => {
  try {
    const payload = verifyToken(req);
    const { usersContainer, user } = await findUser(payload.email);

    if (!user)
      return res.status(404).json({ error: "User not found." });

    user.appState = req.body.state;
    try {
      console.log(`Replacing user item (/state): id=${user.id} partition=${user.email}`);
      await usersContainer.item(user.id, user.email).replace(user);
      console.log(`POST /state for ${payload.email} → saved OK`);
      res.json({ message: "State saved." });
    } catch (errReplace) {
      console.error('Error replacing user item (/state):', errReplace);
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
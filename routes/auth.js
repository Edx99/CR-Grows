const express          = require("express");
const bcrypt           = require("bcryptjs");
const jwt              = require("jsonwebtoken");
const crypto           = require("crypto");
const { getContainer } = require("../config/cosmos");

const router = express.Router();

// ── REGISTER ──────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const usersContainer = getContainer();
    const { name, email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "All fields are required." });

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @e",
        parameters: [{ name: "@e", value: email }],
      })
      .fetchAll();

    if (resources.length > 0)
      return res.status(400).json({ error: "Email already registered." });

    const passwordHash = await bcrypt.hash(password, 10);
    await usersContainer.items.create({
      name: name || "",
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    });

    res.json({ message: "Account created successfully." });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── LOGIN ─────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const usersContainer = getContainer();
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "All fields are required." });

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @e",
        parameters: [{ name: "@e", value: email }],
      })
      .fetchAll();

    const user = resources[0];
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid email or password." });

    const token = jwt.sign(
      { email: user.email, id: user.id, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
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
    const usersContainer = getContainer();
    const { email } = req.body;

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @e",
        parameters: [{ name: "@e", value: email }],
      })
      .fetchAll();

    const user = resources[0];

    // Always same response — prevents email enumeration
    if (!user)
      return res.json({ message: "If that email exists, a reset link was sent." });

    const resetToken      = crypto.randomBytes(32).toString("hex");
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await usersContainer.item(user.id, user.email).replace(user);

    const resetLink = `https://wapedxtest01.azurewebsites.net/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: email,
      from: "noreply@yourdomain.com",   // ← change to your verified sender
      subject: "Reset your password",
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
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
    const usersContainer = getContainer();
    const { email, token, newPassword } = req.body;

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @e",
        parameters: [{ name: "@e", value: email }],
      })
      .fetchAll();

    const user = resources[0];

    if (!user || user.resetToken !== token || Date.now() > user.resetTokenExpiry)
      return res.status(400).json({ error: "Invalid or expired token." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetTokenExpiry;
    await usersContainer.item(user.id, user.email).replace(user);

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;

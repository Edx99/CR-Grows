// routes/auth.js  ← THIS is the file

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");         // built-in Node.js, no install needed
const { usersContainer } = require("../config/cosmos");

const router = express.Router();

// ─────────────────────────────────────────
// STEP 4 — REGISTER
// ─────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @e",
      parameters: [{ name: "@e", value: email }],
    })
    .fetchAll();

  if (resources.length > 0)
    return res.status(400).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  await usersContainer.items.create({
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  res.json({ message: "Account created" });
});

// ─────────────────────────────────────────
// STEP 4 — LOGIN
// ─────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @e",
      parameters: [{ name: "@e", value: email }],
    })
    .fetchAll();

  const user = resources[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { email: user.email, id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token });
});

// ─────────────────────────────────────────
// STEP 5 — FORGOT PASSWORD (request link)
// ─────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  // 1. Find the user by email
  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @e",
      parameters: [{ name: "@e", value: email }],
    })
    .fetchAll();

  const user = resources[0];

  // 2. If user doesn't exist, we still respond the same way
  //    so attackers can't figure out which emails are registered
  if (!user)
    return res.json({ message: "If that email exists, a reset link was sent" });

  // 3. Generate a random secure token
  const resetToken = crypto.randomBytes(32).toString("hex");

  // 4. Save the token + expiry (1 hour) on the user document in Cosmos DB
  user.resetToken = resetToken;
  user.resetTokenExpiry = Date.now() + 3600000; // 1 hour in milliseconds
  await usersContainer.item(user.id, user.email).replace(user);

  // 5. Build the reset link that will be sent by email
  const resetLink = `https://wapedxtest01.azurewebsites.net/reset-password.html?token=${resetToken}&email=${email}`;

  // 6. Send the email (uses SendGrid — configured in Step 6)
  const sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({
    to: email,
    from: "noreply@yourdomain.com",      // ← change to your sender email
    subject: "Reset your password",
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
           <a href="${resetLink}">Reset my password</a>`,
  });

  res.json({ message: "If that email exists, a reset link was sent" });
});

// ─────────────────────────────────────────
// STEP 5 — RESET PASSWORD (apply new password)
// ─────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;

  // 1. Find user by email
  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @e",
      parameters: [{ name: "@e", value: email }],
    })
    .fetchAll();

  const user = resources[0];

  // 2. Validate: user must exist, token must match, and not be expired
  if (!user || user.resetToken !== token || Date.now() > user.resetTokenExpiry)
    return res.status(400).json({ error: "Invalid or expired token" });

  // 3. Hash the new password and save it
  user.passwordHash = await bcrypt.hash(newPassword, 10);

  // 4. Clean up the token so it can't be reused
  delete user.resetToken;
  delete user.resetTokenExpiry;

  await usersContainer.item(user.id, user.email).replace(user);

  res.json({ message: "Password updated successfully" });
});

// ─────────────────────────────────────────
// Export the router so server.js can use it
// ─────────────────────────────────────────
module.exports = router;

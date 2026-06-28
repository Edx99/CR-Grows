if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express    = require("express");
const path       = require("path");
const authRoutes = require("./routes/auth");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", authRoutes);

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`CR-Grows server running on port ${PORT}`);
});

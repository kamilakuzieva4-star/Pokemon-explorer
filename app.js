import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = process.env.PORT || 3000;
const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

// Resolve templates and styles relative to this file, not the terminal's folder.
app.set("view engine", "ejs");
app.set("views", path.join(projectDirectory, "views"));
app.use(express.static(path.join(projectDirectory, "public")));

// Day 1: render a simple home page. API features will be added later.
app.get("/", (req, res) => {
  res.render("home", { title: "Pokémon Explorer" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Pokémon Explorer: http://127.0.0.1:${port}`);
});

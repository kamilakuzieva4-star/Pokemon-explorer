import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pokemonRoutes from "./routes/pokemonRoutes.js";

const app = express();
const port = process.env.PORT || 3000;
const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", path.join(projectDirectory, "views"));

app.use(express.static(path.join(projectDirectory, "public")));
app.use(pokemonRoutes);


app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not found",
    status: 404,
    message: "This page does not exist."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Pokémon Explorer: http://127.0.0.1:${port}`);
});
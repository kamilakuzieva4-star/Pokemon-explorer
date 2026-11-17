import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pokemonRoutes from "./routes/pokemonRoutes.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import { requestLogger } from "./middleware/requestLogger.js";

const app = express();
const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", path.join(projectDirectory, "views"));
// Middleware runs before the route handlers.
app.use(requestLogger);
app.use(express.static(path.join(projectDirectory, "public")));
app.use(express.urlencoded({ extended: false, limit: "2kb" }));
app.use(pokemonRoutes);

// Unknown routes and unexpected errors are handled last.
app.use(notFound);
app.use(errorHandler);

export default app;

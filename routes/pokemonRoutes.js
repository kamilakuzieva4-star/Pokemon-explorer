import { Router } from "express";
import { catalog, search, details, compare } from "../controllers/pokemonController.js";

const router = Router();
// GET displays pages; POST processes the search form.
router.get("/", catalog);
router.post("/search", search);
router.get("/pokemon/:name", details);
router.get("/compare", compare);

export default router;

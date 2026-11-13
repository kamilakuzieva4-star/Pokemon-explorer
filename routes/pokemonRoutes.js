import { Router } from "express";
import { catalog, search, details } from "../controllers/pokemonController.js";

const router = Router();
router.get("/", catalog);
router.post("/search", search);
router.get("/pokemon/:name", details);

export default router;
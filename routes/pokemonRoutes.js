import { Router } from "express";
import { catalog } from "../controllers/pokemonController.js";

const router = Router();

router.get("/", catalog);

export default router;
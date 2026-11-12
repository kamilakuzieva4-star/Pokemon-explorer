import { getCatalog } from "../services/pokemonService.js";

export async function catalog(req, res) {
  try {
    const pokemon = await getCatalog();

    res.render("home", {
      title: "Catalog",
      pokemon
    });
  } catch (error) {
    console.error("Catalog:", error.message);

    res.status(502).render("error", {
      title: "Catalog unavailable",
      status: 502,
      message: "The Pokémon catalog could not load. Please try again in a moment."
    });
  }
}
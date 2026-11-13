import { getCatalog, getPokemon } from "../services/pokemonService.js";

function normalizeName(value) {
  if (typeof value !== "string" || value.length > 60) return null;
  const name = value.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♀/g, "-f").replace(/♂/g, "-m")
    .replace(/[.'’]/g, "").replace(/\s+/g, "-");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return null;
  if (/^\d+$/.test(name)) {
    return Number(name) > 0 && name.length <= 7 ? String(Number(name)) : null;
  }
  return name;
}

function lookupError(error) {
  if (error.response?.status === 404) {
    return { status: 404, message: "Pokémon not found. Check the name or number and try again." };
  }
  console.error("Pokémon lookup:", error.message);
  return { status: 502, message: "Pokémon data could not load. Please try again in a moment." };
}

export async function catalog(req, res) {
  try {
    const pokemon = await getCatalog();
    res.render("home", { title: "Catalog", pokemon });
  } catch (error) {
    console.error("Catalog:", error.message);
    res.status(502).render("error", {
      title: "Catalog unavailable", status: 502,
      message: "The Pokémon catalog could not load. Please try again in a moment."
    });
  }
}

export async function search(req, res) {
  const value = typeof req.body?.name === "string" ? req.body.name.slice(0, 60) : "";
  const name = normalizeName(req.body?.name);
  if (!name) {
    return res.status(400).render("search", {
      title: "Search", value,
      message: "Enter a Pokémon name or a positive number (up to 60 characters)."
    });
  }
  try {
    const pokemon = await getPokemon(name);
    res.redirect(303, `/pokemon/${pokemon.name}`);
  } catch (error) {
    const { status, message } = lookupError(error);
    res.status(status).render("search", { title: "Search", value, message });
  }
}

export async function details(req, res) {
  const name = normalizeName(req.params.name);
  if (!name) {
    return res.status(400).render("error", {
      title: "Invalid Pokémon", status: 400,
      message: "Use a Pokémon name or a positive number."
    });
  }
  try {
    const pokemon = await getPokemon(name);
    res.render("pokemon", { title: pokemon.label, pokemon });
  } catch (error) {
    const { status, message } = lookupError(error);
    res.status(status).render("error", { title: "Pokémon unavailable", status, message });
  }
}
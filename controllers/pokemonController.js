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

// Only validated page and sort values are used to build local links.
function readContext(source = {}) {
  const page = source.page ?? "1";
  const sort = source.sort ?? "number";
  if (typeof page !== "string" || !/^[1-9]\d{0,3}$/.test(page) ||
      (sort !== "number" && sort !== "name")) {
    const error = new Error("Choose a positive page number and a supported sort order.");
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }
  const catalogQuery = new URLSearchParams({ page, sort }).toString();
  return { page: Number(page), sort, catalogQuery, backUrl: `/?${catalogQuery}` };
}

function renderError(res, error, context) {
  const { status, message } = error.publicMessage
    ? { status: error.status, message: error.publicMessage } : lookupError(error);
  res.status(status).render("error", {
    title: status === 404 ? "Not found" : "Unable to load page",
    status, message, backUrl: context?.backUrl || "/"
  });
}

export async function catalog(req, res) {
  try {
    const context = readContext(req.query);
    const result = await getCatalog(context.page);
    // Sort a copy so changing the order cannot modify the cached page.
    const pokemon = [...result.pokemon].sort(context.sort === "name"
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => a.number - b.number || a.name.localeCompare(b.name));
    res.render("home", { title: "Catalog", ...result, ...context, pokemon });
  } catch (error) {
    renderError(res, error);
  }
}

export async function search(req, res) {
  let context;
  const value = typeof req.body?.name === "string" ? req.body.name.slice(0, 60) : "";
  try {
    context = readContext(req.body);
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).render("search", {
        title: "Search", ...context, value,
        message: "Enter a Pokémon name or a positive number (up to 60 characters)."
      });
    }
    const pokemon = await getPokemon(name);
    res.redirect(303, `/pokemon/${pokemon.name}?${context.catalogQuery}`);
  } catch (error) {
    if (!context) return renderError(res, error);
    const { status, message } = lookupError(error);
    res.status(status).render("search", { title: "Search", ...context, value, message });
  }
}

export async function details(req, res) {
  let context;
  try {
    context = readContext(req.query);
    const name = normalizeName(req.params.name);
    if (!name) {
      return res.status(400).render("error", {
        title: "Invalid Pokémon", ...context, status: 400,
        message: "Use a Pokémon name or a positive number."
      });
    }
    const pokemon = await getPokemon(name);
    res.render("pokemon", { title: pokemon.label, ...context, pokemon });
  } catch (error) {
    renderError(res, error, context);
  }
}

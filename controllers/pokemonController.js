import { getCatalog, getPokemon } from "../services/pokemonService.js";

// Accept a name or number, normalize common punctuation, and reject unsafe input.
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
  if (error.publicMessage) return { status: error.status, message: error.publicMessage };
  console.error("Application:", error.message);
  return { status: 500, message: "Something went wrong. Please try again in a moment." };
}

// Build return links from validated values instead of trusting a supplied URL.
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

function renderError(res, error, context, retryUrl) {
  const { status, message } = error.publicMessage
    ? { status: error.status, message: error.publicMessage } : lookupError(error);
  res.status(status).render("error", {
    title: status === 404 ? "Not found" : "Unable to load page",
    status, message, backUrl: context?.backUrl || "/",
    retryUrl: status >= 500 ? retryUrl : undefined
  });
}

export async function catalog(req, res) {
  let context;
  try {
    context = readContext(req.query);
    const result = await getCatalog(context.page);
    // Sort a copy of this page only; leave cached data unchanged.
    const pokemon = [...result.pokemon].sort(context.sort === "name"
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => a.number - b.number || a.name.localeCompare(b.name));
    res.render("home", { title: "Catalog", ...result, ...context, pokemon });
  } catch (error) {
    renderError(res, error, undefined, context?.backUrl);
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
    // Redirect after POST so refreshing the result does not resubmit the form.
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

export async function compare(req, res) {
  let context;
  const first = typeof req.query.first === "string" ? req.query.first.slice(0, 60) : "";
  const second = typeof req.query.second === "string" ? req.query.second.slice(0, 60) : "";

  const showForm = (status, message = "", pair = []) => res.status(status).render("compare", {
    title: "Compare", ...context, first, second, message, pair
  });

  try {
    context = readContext(req.query);
    // A detail-page link fills the first field without running a comparison.
    const prefill = req.query.second === undefined && req.query.submitted === undefined;
    if (prefill) {
      if (req.query.first !== undefined && !normalizeName(req.query.first)) {
        return showForm(400, "Enter a valid name or number for the first Pokémon.");
      }
      return showForm(200);
    }

    const firstName = normalizeName(req.query.first);
    const secondName = normalizeName(req.query.second);
    if (!firstName || !secondName) {
      return showForm(400, "Enter a valid name or number for both Pokémon.");
    }
    if (firstName === secondName) {
      return showForm(400, "Choose two different Pokémon.");
    }

    const pair = await Promise.all([getPokemon(firstName), getPokemon(secondName)]);
    // A name and a number can identify the same Pokemon, such as Pikachu and 25.
    if (pair[0].name === pair[1].name) {
      return showForm(400, "Choose two different Pokémon.");
    }
    return showForm(200, "", pair);
  } catch (error) {
    if (!context) return renderError(res, error);
    const { status, message } = lookupError(error);
    return showForm(status, message);
  }
}

import axios from "axios";
import { pageError } from "../middleware/errors.js";

const pageSize = 12;
const cacheTime = 20 * 60 * 1000;
const cacheLimit = 200;
const isName = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const safeImage = (value) => typeof value === "string" && value.startsWith("https://") ? value : "";
const nationalNumber = (species) => Array.isArray(species?.pokedex_numbers)
  ? species.pokedex_numbers.find((entry) => entry?.pokedex?.name === "national")?.entry_number : null;
const defaultName = (species) => Array.isArray(species?.varieties)
  ? species.varieties.find((entry) => entry?.is_default === true)?.pokemon?.name : null;
const validPokemon = (data) => Number.isInteger(data?.id) && data.id > 0 &&
  isName(data.name) && isName(data.species?.name);
const validSpecies = (data) => isName(data?.name) &&
  Number.isInteger(nationalNumber(data)) && nationalNumber(data) > 0 && isName(defaultName(data));
const invalidResponse = () => pageError(502, "PokéAPI returned unexpected data. Please try again.");

// Injecting a client lets tests simulate API failures without internet access.
export function createPokemonService(client = axios.create({
  baseURL: "https://pokeapi.co/api/v2", timeout: 6500
})) {
  const cache = new Map();
  const pending = new Map();

  function save(key, entry) {
    cache.delete(key);
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
    cache.set(key, entry);
  }

  // Cache successful responses and share in-progress requests to the same URL.
  async function request(url, validate) {
    const saved = cache.get(url);
    if (saved && Date.now() < saved.expiresAt) return saved.data;
    cache.delete(url);
    if (pending.has(url)) return pending.get(url);

    const operation = (async () => {
      try {
        const { data } = await client.get(url);
        // Validate before caching so malformed API responses can recover on retry.
        if (!validate(data)) throw invalidResponse();
        const entry = { data, expiresAt: Date.now() + cacheTime };
        save(url, entry);
        // Reuse the same response for a Pokemon name and its numeric API ID.
        if (url.startsWith("/pokemon/")) {
          save(`/pokemon/${data.name}`, entry);
          save(`/pokemon/${data.id}`, entry);
        }
        return data;
      } catch (error) {
        console.error("PokéAPI:", url, error.code || error.response?.status || error.message);
        if (error.publicMessage) throw error;
        if (error.response?.status === 404) {
          throw pageError(404, "Pokémon not found. Check the name or number and try again.");
        }
        if (error.response?.status === 429) {
          throw pageError(503, "PokéAPI is busy. Please try again in a moment.");
        }
        if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
          throw pageError(504, "PokéAPI took too long to respond. Please try again.");
        }
        throw pageError(502, "PokéAPI is unavailable right now. Please try again.");
      }
    })();
    pending.set(url, operation);
    try { return await operation; } finally { pending.delete(url); }
  }

  async function getPokemon(name) {
    if (!isName(name)) throw pageError(400, "Enter a valid Pokémon name or number.");
    let data;
    let species;
    try {
      data = await request(`/pokemon/${name}`, validPokemon);
    } catch (error) {
      if (error.status !== 404) throw error;
      // Some species (e.g. Giratina) use a different default form name.
      species = await request(`/pokemon-species/${name}`, (value) =>
        validSpecies(value) && (/^\d+$/.test(name) || value.name === name));
      data = await request(`/pokemon/${defaultName(species)}`, validPokemon);
    }
    if (!species) {
      species = await request(`/pokemon-species/${data.species.name}`, (value) =>
        validSpecies(value) && value.name === data.species.name);
    }
    if (species.name !== data.species.name) throw invalidResponse();
    const saved = cache.get(`/pokemon/${data.name}`);
    if (saved) save(`/pokemon/${name}`, saved);

    const stat = (name) => {
      const value = Array.isArray(data.stats)
        ? data.stats.find((entry) => entry?.stat?.name === name)?.base_stat : null;
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    return {
      name: data.name,
      // Form IDs differ from national Pokedex numbers.
      number: nationalNumber(species),
      label: data.name.replaceAll("-", " "),
      image: safeImage(data.sprites?.other?.["official-artwork"]?.front_default) || safeImage(data.sprites?.front_default),
      fallbackImage: safeImage(data.sprites?.front_default),
      types: (Array.isArray(data.types) ? data.types : [])
        .map((entry) => entry?.type?.name).filter(isName).join(", "),
      // PokéAPI uses decimetres and hectograms; display metres and kilograms.
      height: Number.isFinite(data.height) && data.height >= 0 ? data.height / 10 : null,
      weight: Number.isFinite(data.weight) && data.weight >= 0 ? data.weight / 10 : null,
      hp: stat("hp"), attack: stat("attack"), speed: stat("speed")
    };
  }

  async function getCatalog(page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 9999) {
      throw pageError(400, "Enter a positive catalog page number.");
    }
    const offset = (page - 1) * pageSize;
    const list = await request(`/pokemon?limit=${pageSize}&offset=${offset}`, (data) =>
      Number.isInteger(data?.count) && data.count >= 0 && Array.isArray(data.results) &&
      data.results.length === Math.min(pageSize, Math.max(0, data.count - offset)) &&
      data.results.every((entry) => isName(entry?.name)));
    if (page > 1 && offset >= list.count) {
      throw pageError(404, "There is no catalog page with that number.");
    }
    // Keep successful cards when another request on this page fails.
    const results = await Promise.allSettled(list.results.map((entry) => getPokemon(entry.name)));
    const pokemon = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (results.length > 0 && pokemon.length === 0) throw results[0].reason;
    return {
      pokemon,
      total: list.count,
      totalPages: Math.max(1, Math.ceil(list.count / pageSize)),
      hasNext: offset + pageSize < list.count,
      unavailable: results.length - pokemon.length
    };
  }

  return { getPokemon, getCatalog };
}

export const { getPokemon, getCatalog } = createPokemonService();

import axios from "axios";

const api = axios.create({ baseURL: "https://pokeapi.co/api/v2", timeout: 6500 });
const validName = (name) =>
  typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);

const pageSize = 12;
const pages = new Map();

export async function getPokemon(name) {
  if (!validName(name)) throw new Error("Invalid Pokémon identifier.");
  let data;
  let species;

  try {
    ({ data } = await api.get(`/pokemon/${name}`));
  } catch (error) {
    if (error.response?.status !== 404) throw error;
    // Species such as Giratina have a different default form name.
    ({ data: species } = await api.get(`/pokemon-species/${name}`));
    const defaultForm = Array.isArray(species?.varieties)
      ? species.varieties.find((form) => form?.is_default === true) : null;
    const formName = defaultForm?.pokemon?.name;
    if (!validName(formName)) throw new Error("Missing default Pokémon form.");
    ({ data } = await api.get(`/pokemon/${formName}`));
  }

  if (!Number.isInteger(data?.id) || data.id < 1 ||
      !validName(data.name) || !validName(data.species?.name)) {
    throw new Error("Unexpected Pokémon details.");
  }
  if (!species) {
    ({ data: species } = await api.get(`/pokemon-species/${data.species.name}`));
  }
  const national = Array.isArray(species?.pokedex_numbers)
    ? species.pokedex_numbers.find((item) => item?.pokedex?.name === "national") : null;
  if (!Number.isInteger(national?.entry_number) || national.entry_number < 1) {
    throw new Error("Missing national Pokédex number.");
  }

  const image = data.sprites?.other?.["official-artwork"]?.front_default || data.sprites?.front_default;
  const stat = (name) => {
    const value = Array.isArray(data.stats)
      ? data.stats.find((item) => item?.stat?.name === name)?.base_stat : null;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  return {
    name: data.name,
    number: national.entry_number,
    label: data.name.replaceAll("-", " "),
    image: typeof image === "string" && image.startsWith("https://") ? image : "",
    types: (Array.isArray(data.types) ? data.types : [])
      .map((item) => item?.type?.name).filter((name) => typeof name === "string").join(", "),
    height: Number.isFinite(data.height) && data.height >= 0 ? data.height / 10 : null,
    weight: Number.isFinite(data.weight) && data.weight >= 0 ? data.weight / 10 : null,
    hp: stat("hp"), attack: stat("attack"), speed: stat("speed")
  };
}

export async function getCatalog(page = 1) {
  if (!Number.isInteger(page) || page < 1 || page > 9999) {
    throw new Error("Invalid catalog page.");
  }
  const saved = pages.get(page);
  if (saved && Date.now() < saved.expiresAt) return saved.data;
  pages.delete(page);

  const offset = (page - 1) * pageSize;
  const { data: list } = await api.get(`/pokemon?limit=${pageSize}&offset=${offset}`);
  if (!Number.isInteger(list?.count) || list.count < 0 || !Array.isArray(list.results)) {
    throw new Error("Unexpected catalog response.");
  }
  if (page > 1 && offset >= list.count) {
    const error = new Error("There is no catalog page with that number.");
    error.status = 404;
    error.publicMessage = error.message;
    throw error;
  }
  if (list.results.length !== Math.min(pageSize, list.count - offset)) {
    throw new Error("Incomplete catalog response.");
  }
  const pokemon = await Promise.all(list.results.map((entry) => getPokemon(entry?.name)));
  const data = {
    pokemon,
    total: list.count,
    totalPages: Math.max(1, Math.ceil(list.count / pageSize)),
    hasNext: offset + pageSize < list.count
  };
  // Keep a bounded cache of visited catalog pages for 20 minutes.
  if (pages.size >= 30) pages.delete(pages.keys().next().value);
  pages.set(page, { data, expiresAt: Date.now() + 20 * 60 * 1000 });
  return data;
}

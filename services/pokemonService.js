import axios from "axios";

const api = axios.create({ baseURL: "https://pokeapi.co/api/v2", timeout: 6500 });
const validName = (name) =>
  typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);

let savedPage = null;
let expiresAt = 0;

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

export async function getCatalog() {
  if (savedPage && Date.now() < expiresAt) return savedPage;
  const { data: list } = await api.get("/pokemon?limit=12&offset=0");
  if (!Array.isArray(list?.results)) throw new Error("Unexpected catalog response.");
  const pokemon = await Promise.all(list.results.map((entry) => getPokemon(entry?.name)));
  savedPage = pokemon;
  expiresAt = Date.now() + 20 * 60 * 1000;
  return pokemon;
}
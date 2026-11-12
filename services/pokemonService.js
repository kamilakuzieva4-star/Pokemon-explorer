import axios from "axios";

const api = axios.create({
  baseURL: "https://pokeapi.co/api/v2",
  timeout: 6500
});


let savedPage = null;
let expiresAt = 0;

export async function getCatalog() {
  if (savedPage && Date.now() < expiresAt) {
    return savedPage;
  }

  const { data: list } = await api.get("/pokemon?limit=12&offset=0");

  if (!Array.isArray(list?.results)) {
    throw new Error("Unexpected catalog response.");
  }

  const pokemon = await Promise.all(
    list.results.map(async (entry) => {
      if (
        typeof entry?.name !== "string" ||
        !/^[a-z0-9-]+$/.test(entry.name)
      ) {
        throw new Error("Unexpected Pokémon name.");
      }

      const { data } = await api.get(`/pokemon/${entry.name}`);

      if (
        !Number.isInteger(data?.id) ||
        data.id < 1 ||
        typeof data.name !== "string" ||
        typeof data.species?.name !== "string" ||
        !/^[a-z0-9-]+$/.test(data.species.name)
      ) {
        throw new Error("Unexpected Pokémon details.");
      }

      
      const { data: species } = await api.get(
        `/pokemon-species/${data.species.name}`
      );

      const national = Array.isArray(species?.pokedex_numbers)
        ? species.pokedex_numbers.find(
            (item) => item?.pokedex?.name === "national"
          )
        : null;

      if (
        !Number.isInteger(national?.entry_number) ||
        national.entry_number < 1
      ) {
        throw new Error("Missing national Pokédex number.");
      }

      const image =
        data.sprites?.other?.["official-artwork"]?.front_default ||
        data.sprites?.front_default;

      return {
        number: national.entry_number,
        label: data.name.replaceAll("-", " "),
        image:
          typeof image === "string" && image.startsWith("https://")
            ? image
            : "",
        types: (Array.isArray(data.types) ? data.types : [])
          .map((item) => item?.type?.name)
          .filter((name) => typeof name === "string")
          .join(", ")
      };
    })
  );

 
  savedPage = pokemon;
  expiresAt = Date.now() + 20 * 60 * 1000;

  return pokemon;
}
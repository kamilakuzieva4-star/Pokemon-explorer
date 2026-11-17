import "dotenv/config";
import app from "./app.js";

const port = process.env.PORT || 3000;

app.listen(port, "localhost", () => {
  console.log(`Pokémon Explorer: http://localhost:${port}`);
});

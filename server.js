import "dotenv/config";
import app from "./app.js";

// dotenv loads PORT from .env; 3000 is the default.
const port = process.env.PORT || 3000;

app.listen(port, "localhost", () => {
  console.log(`Pokémon Explorer: http://localhost:${port}`);
});

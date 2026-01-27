const dotenv = require("dotenv");

dotenv.config();

const { createApp } = require("./src/app");
require("./src/config/db");
require("./src/config/email");
require("./src/config/google");

const requiredEnv = ["JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.warn(`Missing required env variables: ${missingEnv.join(", ")}`);
}

const app = createApp();

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});



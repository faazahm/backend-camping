const { OAuth2Client } = require("google-auth-library");

let googleClient = null;

if (process.env.GOOGLE_CLIENT_ID) {
  googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

module.exports = { googleClient };


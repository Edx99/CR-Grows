const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
  endpoint: process.env.MONGODB_URI,
  key: process.env.COSMOS_KEY,
});

const database = client.database("appdb");
const usersContainer = database.container("users");

module.exports = { usersContainer };

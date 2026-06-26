const { CosmosClient } = require("@azure/cosmos");

let usersContainer = null;

function getContainer() {
  if (usersContainer) return usersContainer;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key      = process.env.COSMOS_KEY;

  console.log("COSMOS_ENDPOINT:", endpoint ? "✓ " + endpoint : "✗ MISSING");
  console.log("COSMOS_KEY:",      key      ? "✓ loaded"      : "✗ MISSING");

  if (!endpoint || !key) {
    throw new Error(
      "Missing Cosmos DB credentials.\n" +
      "Set COSMOS_ENDPOINT and COSMOS_KEY in Azure Application Settings."
    );
  }

  const client = new CosmosClient({ endpoint, key });
  usersContainer = client.database("appdb").container("users");
  return usersContainer;
}

module.exports = { getContainer };

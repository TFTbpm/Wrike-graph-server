const { config } = require("dotenv");
config();

async function graphAcessData() {
  const params = new URLSearchParams({
    client_id: process.env.graph_client_id,
    scope: "https://graph.microsoft.com/.default",
    client_secret: process.env.graph_api_secret,
    grant_type: "client_credentials",
  }).toString();
  let response = await fetch(
    `https://login.microsoftonline.com/${process.env.graph_tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );
  const accessData = await response.json();
  return await accessData;
}

module.exports = graphAcessData;

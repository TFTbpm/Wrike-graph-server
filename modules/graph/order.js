async function getOrders(site_id, list_id, access_token) {
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  console.log(url);
  //   const response = await fetch(url, requestOptions);
  //   const data = await response.json();
  //   return await data;
}

module.exports = getOrders;

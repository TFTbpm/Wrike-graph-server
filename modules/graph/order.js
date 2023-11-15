async function getOrders(site_id, list_id, access_token) {
  const startTime = performance.now();
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields&$top=999`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  let response = await fetch(url, requestOptions);
  let data = await response.json();
  let allItems = [];
  let page = 1;
  while (data["@odata.nextLink"]) {
    response = await fetch(data["@odata.nextLink"], requestOptions);
    data = await response.json();
    if (page > 6) {
      allItems.push(...data.value);
    }
    page++;
  }
  allItems.sort(
    (a, b) =>
      new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
  );
  const filteredItems = allItems.slice(0, 5);
  const endTime = performance.now();
  console.log(`orders retrieved: (${(endTime - startTime) / 1000}s)`);
  console.log(filteredItems);
  return filteredItems;
}

module.exports = getOrders;

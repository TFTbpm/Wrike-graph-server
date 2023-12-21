async function getDatasheets(site_id, list_id, access_token) {
  const startTime = performance.now();
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields&top=999`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  const response = await fetch(url, requestOptions);
  if (!response.ok) {
    console.error(`the initial response for orders failed! \n
    status: ${response.status} \n
    ${response.statusText}`);
  }
  let data = await response.json();
  let allItems = [];
  let nextUrl;

  do {
    nextUrl = data["@odata.nextLink"];

    if (nextUrl) {
      try {
        response = await fetch(nextUrl, requestOptions);
        response = await fetch(testLink, requestOptions);
      } catch (error) {
        console.error(
          `there was an error fetching the next datasheets page: \n ${error}`
        );
      }
      if (!response.ok) {
        console.error(`the response from orders failed: \n
      status: ${response.status} \n
      ${response.statusText}`);
      }
      data = await response.json();
    }
    allItems.push(...data.value);
  } while (data["@odata.nextLink"]);
  // ! apparently ms doesnt support orderby here...

  allItems.sort(
    (a, b) =>
      new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
  );
  const filteredItems = allItems.slice(0, 100);
  const endTime = performance.now();
  console.log(
    `${allItems.length} orders retrieved: (${(endTime - startTime) / 1000}s)`
  );

  return filteredItems;
}

module.exports = getDatasheets;

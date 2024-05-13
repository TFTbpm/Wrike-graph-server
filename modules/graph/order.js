async function getOrders(site_id, list_id, access_token, skipToken) {
  const startTime = performance.now();
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields&$top=999&$skiptoken=${skipToken}`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  let response = await fetch(url, requestOptions);
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
      } catch (error) {
        console.error(
          `there was an error fetching the next orders page: \n ${error}`
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

  allItems.sort(
    (a, b) =>
      new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
  );
  const filteredItems = allItems.slice(0, 5);
  const endTime = performance.now();
  console.log(
    `${allItems.length} orders retrieved: (${(endTime - startTime) / 1000}s)`
  );
  // console.log(filteredItems);
  return filteredItems;
}

async function addOrder(data, name, uri, metaData) {
  try {
    await fetch(uri, {
      method: "PATCH",
      body: JSON.stringify({
        resource: "Order",
        id: 0,
        type: "ADD",
        data: data,
        name: name,
        field: "file",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log("sent");
    return true;
  } catch (error) {
    console.error(
      `there was an error adding the order to the SP site: ${error}`
    );
  }
}

module.exports = { getOrders, addOrder };

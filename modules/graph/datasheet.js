async function getDatasheets(site_id, list_id, access_token) {
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields&orderby=lastModifiedDateTime%20desc&top=5`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  const response = await fetch(url, requestOptions);
  const data = await response.json();
  return await data;
}

module.exports = getDatasheets;

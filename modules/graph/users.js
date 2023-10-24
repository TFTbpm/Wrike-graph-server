const graphAccessData = require("./accessToken");
const { writeFile } = require("fs");

async function getUserIDs(site_id, list_id) {
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields($select=title,deleted, contenttype)&select=id,fields`;
  const accessData = await graphAccessData();
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${accessData.access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  let retArr = [];
  const response = await fetch(url, requestOptions);
  if (!response.ok) {
    console.log(response.status, response.statusText);
    return;
  }
  let data = await response.json();
  retArr = retArr.concat(conversion(data.value));
  while (data["@odata.nextLink"]) {
    let linkResponse = await fetch(data["@odata.nextLink"], requestOptions);
    if (!linkResponse.ok) {
      console.log(linkResponse.status, linkResponse.statusText);
      return;
    }
    data = await linkResponse.json();
    retArr = retArr.concat(conversion(data.value));
  }
  return retArr;
}

getUserIDs(
  process.env.graph_site_id_sales,
  process.env.graph_list_id_user_list
);

function conversion(arr) {
  let retArr = [];
  arr.forEach((element) => {
    if (
      element.fields.Deleted == false &&
      element.fields.ContentType == "Person"
    ) {
      retArr.push({ id: element.id, name: element.fields.Title });
    }
  });
  return retArr;
}

module.exports = getUserIDs;

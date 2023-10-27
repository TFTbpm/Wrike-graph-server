async function refreshCustomerList(
  salesSiteID,
  customerListID,
  wrikeSalesSpaceID,
  graphAccessToken,
  wrikeAccessToken
) {
  let customerList = [];
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${graphAccessToken}`,
    },
  };
  const URI = `https://graph.microsoft.com/v1.0/sites/${salesSiteID}/lists/${customerListID}/items?$expand=fields($select=title)&$select=id`;
  let customerListResponse = await fetch(URI, requestOptions);
  let customerListData = await customerListResponse.json();
  while (customerListData["@odata.nextLink"]) {
    customerList = customerList.concat(customerListData.value);
    customerListResponse = await fetch(
      customerListData["@odata.nextLink"],
      requestOptions
    );
    customerListData = await customerListResponse.json();
  }
  console.log(customerList.length);

  // Extract unique titles and sort them alphabetically
  const customerTitles = customerList
    .map((customer) => customer.fields.Title.toUpperCase())
    .filter((title, index, self) => self.indexOf(title) === index)
    .sort();
  //   console.log(customerTitles.length);

  let fieldID = "";
  let method = "POST";
  let wrikeFieldsJSON = {
    title: "CustomerList",
    type: "DropDown",
    spaceId: wrikeSalesSpaceID,
    settings: {
      inheritanceType: "All",
      values: [],
      optionColorsEnabled: false,
      allowOtherValues: false,
      readOnly: false,
    },
  };

  for (let i = 0; i < customerList.length; i += 50) {
    let slicedcustomerList = customerTitles.slice(i, i + 50);
    wrikeFieldsJSON.settings.values =
      wrikeFieldsJSON.settings.values.concat(slicedcustomerList);
    console.log(slicedcustomerList);
    let response = await fetch(
      `https://www.wrike.com/api/v4/customfields/${fieldID}`,
      {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${wrikeAccessToken}`,
        },
        body: JSON.stringify(wrikeFieldsJSON),
      }
    );
    if (response.ok) {
      let body = await response.json();
      fieldID = body.data[0].id;
      method = "PUT";
      wrikeFieldsJSON = {
        title: "CustomerList",
        type: "DropDown",
        settings: {
          inheritanceType: "All",
          values: wrikeFieldsJSON.settings.values,
          optionColorsEnabled: false,
          allowOtherValues: false,
          readOnly: false,
        },
      };
    }
  }
  return console.log("success");
}
module.exports = refreshCustomerList;

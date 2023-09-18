export async function refreshCustomerList(
  salesSiteID,
  customerListID,
  wrikeSalesSpaceID,
  graphClient,
  wrikeAccessToken
) {
  let customerList = [];
  let customerListData = await graphClient
    .api(`/sites/${salesSiteID}/lists/${customerListID}/items`)
    .expand("fields($select=title)")
    .select("id")
    .get();
  while (customerListData["@odata.nextLink"]) {
    customerList = customerList.concat(customerListData.value);
    customerListData = await graphClient
      .api(customerListData["@odata.nextLink"])
      .get();
  }
  let customerObj = {};
  customerList = customerList.concat(customerListData.value);
  customerList = customerList.map((customer) => {
    if (customerObj[customer.fields.Title] == undefined) {
      customerObj[customer.fields.Title] = true;
      return customer.fields.Title;
    }
  });

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
    let slicedcustomerList = customerList.slice(i, i + 50);
    wrikeFieldsJSON.settings.values =
      wrikeFieldsJSON.settings.values.concat(slicedcustomerList);
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

export async function getRFQList(
  salesSiteID,
  rfqListID,
  wrikeSalesSpaceID,
  graphClient,
  wrikeAccessToken
) {
  const graphWrikeDictionary = {};
  let rfqListData = await graphClient
    .api(
      `https://graph.microsoft.com/v1.0/sites/${salesSiteID}/lists/${rfqListID}/items?$expand=fields`
    )
    .get();
  console.log(rfqListData);
}

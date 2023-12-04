const { MongoClient } = require("mongodb");

async function getRFQData(site_id, list_id, access_token) {
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?filter=contentType/name eq 'Request for Quote'&expand=fields&orderby=fields/Modified%20desc&top=5`;
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

async function modifyUserFromWrike(
  hooks,
  graphIDToWrikeID,
  dataCollection,
  users
) {
  let body;
  try {
    for (const hook of hooks) {
      let mongoEntry;

      // Get mongo item of task ID
      try {
        (mongoEntry = await dataCollection.findOne({ id: hook.taskId })),
          users.findOne({ id: hook.taskId });
      } catch (error) {
        throw new Error(
          `there was an issue fetching the mongo entry: ${error}`
        );
      }

      // if adding an assignee
      if (hook.addedResponsibles) {
        // get graph id from wrike id
        const foundKey = Object.keys(graphIDToWrikeID).find(
          (key) => graphIDToWrikeID[key] === hook.addedResponsibles[0]
        );

        if (!foundKey) {
          console.log(`id is not stored! ID: ${hook.addedResponsibles}`);
          continue;
        }

        console.log("Found Key:", foundKey);

        const assignee = await users.findOne({ id: foundKey });

        console.log("Assignee:", assignee.name);

        if (!assignee) {
          console.log(`id is not stored! ID: ${hook.addedResponsibles}`);
          continue;
        }
        // send data to power automate

        body = JSON.stringify({
          resource: "RFQ",
          data: assignee.name,
          id: parseInt(mongoEntry.graphID),
          type: "ADD",
          name: "null",
          field: "assingee",
        });
      } else if (hook.removedResponsibles) {
        // get graph id from wrike id
        const foundKey = Object.keys(graphIDToWrikeID).find(
          (key) => graphIDToWrikeID[key] === hook.removedResponsibles[0]
        );

        if (!foundKey) {
          console.log(`id is not stored! ID: ${hook.removedResponsibles}`);
          continue;
        }

        console.log("Found Key:", foundKey);

        const assignee = await users.findOne({ id: foundKey });

        console.log("Assignee:", assignee);

        if (!assignee) {
          console.log(`id is not stored! ID: ${hook.removedResponsibles}`);
          continue;
        }

        body = JSON.stringify({
          resource: "RFQ",
          data: assignee.name,
          id: parseInt(mongoEntry.graphID),
          type: "REMOVE",
          name: "null",
          field: "assignee",
        });
      } else {
        console.log("Unexpected hook:", hook);
        return false;
      }
    }

    try {
      const response = await fetch(process.env.graph_power_automate_uri, {
        method: "PATCH",
        body: body,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        console.log("modified user information for rfq");
        return true;
      }
    } catch (error) {
      throw new Error(`there was an error modifying responsbles: ${error}`);
    }
  } catch (error) {
    console.error(
      `There was an error processing the rfq: ${error}\n ${error.stack}`
    );
    throw new Error(
      `There was an error processing the rfq: ${error}\n ${error.stack}`
    );
  }
}

module.exports = { getRFQData, modifyUserFromWrike };

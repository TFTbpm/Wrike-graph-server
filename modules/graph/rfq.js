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

async function modifyGraphRFQ(hooks, graphIDToWrikeID) {
  try {
    let wrikeTitles;
    let users;

    // Connect to mongo
    try {
      const client = new MongoClient(process.env.mongoURL);
      const db = client.db(process.env.mongoDB);
      wrikeTitles = db.collection(process.env.mongoRFQCollection);
      users = db.collection(process.env.mongoUserColection);
    } catch (error) {
      throw new Error(`there was an issue accessing Mongo: ${error}`);
    }

    // Go through each changed item
    for (const hook of hooks) {
      let mongoEntry;

      // Get mongo item of task ID
      try {
        mongoEntry = await wrikeTitles.findOne({ id: hook.taskId });
        console.log(mongoEntry);
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
        try {
          const response = await fetch(process.env.graph_power_automate_uri, {
            method: "PATCH",
            body: JSON.stringify({
              resource: "RFQ",
              data: assignee.name,
              id: parseInt(mongoEntry.graphID),
              type: "ADD",
              name: "null",
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (response.ok) {
            console.log("added user information for rfq");
            return true;
          }
        } catch (error) {
          throw new Error(
            `there was an issue sending the http request to power Automate: ${error}`
          );
        }
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

        try {
          const response = await fetch(process.env.graph_power_automate_uri, {
            method: "PATCH",
            body: JSON.stringify({
              resource: "RFQ",
              data: assignee.name,
              id: parseInt(mongoEntry.graphID),
              type: "REMOVE",
              name: "null",
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (response.ok) {
            console.log("removed user information for rfq");
            return true;
          }
        } catch (error) {
          throw new Error(`there was an error removing responsbles: ${error}`);
        }
      } else {
        console.log("Unexpected hook:", hook);
        return false;
      }
    }
    console.log("nothin");
  } catch (error) {
    console.error(
      `There was an error processing the rfq: ${error}\n ${error.stack}`
    );
    throw new Error(
      `There was an error processing the rfq: ${error}\n ${error.stack}`
    );
  }
}

module.exports = { getRFQData, modifyGraphRFQ };

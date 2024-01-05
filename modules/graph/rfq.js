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

// TODO: generalize this
async function modifyUserFromWrike(hooks, dataCollection, users, resource) {
  let body;
  try {
    for (const hook of hooks) {
      let mongoEntry;

      // Get mongo item of task ID
      try {
        (mongoEntry = await dataCollection.findOne({ id: hook.taskId })),
          await users.findOne({ id: hook.taskId });
      } catch (error) {
        throw new Error(
          `there was an issue fetching the mongo entry: ${error}`
        );
      }
      if (resource === "RFQ") {
        // if adding an assignee
        if (hook.addedResponsibles) {
          const foundKey = await users.findOne({
            wrikeUser: hook.addedResponsibles[0],
          });

          console.log(foundKey);

          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.addedResponsibles}`);
            continue;
          }

          // send data to power automate

          body = JSON.stringify({
            resource: resource,
            data: `${foundKey.graphId}`,
            id: parseInt(mongoEntry.graphID),
            type: "ADD",
            name: "null",
            field: "AssignedId",
          });
        } else if (hook.removedResponsibles) {
          const foundKey = await users.findOne({
            wrikeUser: hook.removedResponsibles[0],
          });

          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.removedResponsibles}`);
            continue;
          }

          body = JSON.stringify({
            resource: resource,
            data: `${foundKey.graphId}`,
            id: parseInt(mongoEntry.graphID),
            type: "REMOVE",
            name: "null",
            field: "assignee",
          });
        } else {
          console.log("Unexpected hook:", hook);
          return false;
        }
      } else if (resource === "datasheet") {
        if (hook.addedResponsibles) {
          const foundKey = await users.findOne({
            wrikeUser: hook.addedResponsibles[0],
          });

          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.removedResponsibles}`);
            continue;
          }

          body = JSON.stringify({
            resource: resource,
            data: `${foundKey.graphId}`,
            id: parseInt(mongoEntry.graphID),
            type: "ADD",
            name: "null",
            field: "Author0Id",
          });
        } else if (hook.removedResponsibles) {
          const foundKey = await users.findOne({
            wrikeUser: hook.removedResponsibles[0],
          });

          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.removedResponsibles}`);
            continue;
          }
          body = JSON.stringify({
            resource: resource,
            data: `${foundKey.graphId}`,
            id: parseInt(mongoEntry.graphID),
            type: "REMOVE",
            name: "null",
            field: "Author0Id",
          });
        } else {
          console.log(`unexpected hook: ${hook}`);
          return false;
        }
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
        console.log("modified user information");
        return true;
      }
    } catch (error) {
      throw new Error(`there was an error modifying responsbles: ${error}`);
    }
  } catch (error) {
    console.error(
      `There was an error processing the user modification: ${error}\n ${error.stack}`
    );
    throw new Error(
      `There was an error processing the user modificiation: ${error}\n ${error.stack}`
    );
  }
}

async function modifyCustomFieldFromWrike(hooks, collection, users, folder) {
  let body;
  try {
    let mongoEntry;
    for (const hook of hooks) {
      // Get mongo item of task ID
      try {
        mongoEntry = await collection.findOne({ id: hook.taskId });
        if (!mongoEntry) {
          throw new Error(`cannot find order in mongo!`);
        }
      } catch (error) {
        throw new Error(
          `there was an issue fetching the mongo entry: ${error}`
        );
      }

      // if adding a reviewer for rfq
      if (
        hook.customFieldId == process.env.wrike_field_reviewer &&
        folder === "rfq"
      ) {
        // if removing a reviewer
        if (hook.value == '""' || !hook.value) {
          body = JSON.stringify({
            resource: "RFQ",
            data: "null",
            id: parseInt(mongoEntry.graphID),
            type: "REMOVE",
            name: "null",
            field: "reviewer",
          });
          // if adding a reviewer
        } else {
          const foundKey = await users.findOne({ wrikeUser: hook.value });
          // locate in database
          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.value}`);
            continue;
          }

          // send data to power automate

          body = JSON.stringify({
            resource: "RFQ",
            data: foundKey.graphId,
            id: parseInt(mongoEntry.graphID),
            type: "ADD",
            name: "null",
            field: "ReviewerId",
          });
        }
        // If modifying reviewer on datasheets
      } else if (
        hook.customFieldId == process.env.wrike_field_reviewer &&
        folder === "datasheet"
      ) {
        if (hook.value == '""' || !hook.value) {
          body = JSON.stringify({
            resource: "datasheet",
            data: "null",
            id: parseInt(mongoEntry.graphID),
            type: "REMOVE",
            name: "null",
            field: "reviewer",
          });
          // if adding a reviewer
        } else {
          const foundKey = await users.findOne({ wrikeUser: hook.value });

          if (!foundKey) {
            console.log(`id is not stored! ID: ${hook.value}`);
            continue;
          }

          // send data to power automate

          body = JSON.stringify({
            resource: "datasheet",
            // This needs to be a string or else it gets rejected since other routes
            //  require data to be a string
            data: foundKey.graphId,
            id: parseInt(mongoEntry.graphID),
            type: "ADD",
            name: "null",
            field: "Guide_x002f_MentorId",
          });
        }
      }
    }

    if (body) {
      try {
        console.log(
          `sending body: ${body} to ${process.env.graph_power_automate_uri}`
        );
        const response = await fetch(process.env.graph_power_automate_uri, {
          method: "PATCH",
          body: body,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          console.log("modified user information for custom field");
          return true;
        } else {
          throw new Error(
            `response from server was not okay: ${await response.text()}`
          );
        }
      } catch (error) {
        throw new Error(`there was an error modifying responsibles: ${error}`);
      }
    } else {
      console.log("not completed or empty");
    }
  } catch (error) {
    console.error(
      `There was an error processing the custom field data: ${error}\n ${error.stack}`
    );
    throw new Error(
      `There was an error processing the custom field data: ${error} \n fetch body: ${body} \n ${error.stack}`
    );
  }
}

module.exports = {
  getRFQData,
  modifyUserFromWrike,
  modifyCustomFieldFromWrike,
};

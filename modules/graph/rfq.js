const getAttachments = require("../wrike/getAttachments");
const { getTasks, getComments } = require("../wrike/task");

async function getRFQData(site_id, list_id, access_token, numRefresh) {
  const startTime = performance.now();
  const url = `https://graph.microsoft.com/v1.0/sites/${site_id}/lists/${list_id}/items?expand=fields&$top=999&$skiptoken=UGFnZWQ9VFJVRSZwX0lEPTQ1MzY`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  let response = await fetch(url, requestOptions);
  if (!response.ok) {
    console.error(`the initial response for rfq failed! \n
    status: ${response.status} \n
    ${response.statusText}`);
  }
  let data = await response.json();
  let allItems = [];
  let nextUrl;
  allItems.push(...data.value);

  do {
    nextUrl = data["@odata.nextLink"];

    if (nextUrl) {
      try {
        response = await fetch(nextUrl, requestOptions);
      } catch (error) {
        console.error(
          `there was an error fetching the next rfq page: \n ${error}`
        );
      }
      if (!response.ok) {
        console.error(`the response from rfq failed: \n
      status: ${response.status} \n
      ${response.statusText}`);
      }
      data = await response.json();
    }
    allItems.push(...data.value);
  } while (data["@odata.nextLink"]);

  let filteredItems = allItems.filter(
    (item) => item.contentType.name === "Request for Quote"
  );

  filteredItems = filteredItems.sort(
    (a, b) =>
      new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
  );
  filteredItems = filteredItems.slice(0, numRefresh);
  const endTime = performance.now();
  console.log(
    `${allItems.length} rfq retrieved: (${(endTime - startTime) / 1000}s)`
  );
  // console.log(filteredItems);
  return filteredItems;
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
          console.log("Unexpected hook:", JSON.stringify(hook));
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
          console.log(`unexpected hook: ${JSON.stringify(hook)}`);
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

async function createRFQEntry(hook, users, accessToken) {
  // use the info from the hook, get all information associated with that task
  let taskData = await getTasks(hook.taskId, accessToken);
  taskData = taskData.data[0];
  const taskComments = await getComments(hook.taskId, accessToken);

  // const attachmentArr = await Promise.all(
  //   attachmentIdArr.map(async (attachmentId) => {
  //     return await downloadAttachment(attachmentId, accessToken);
  //   })
  let assigned = await Promise.all(
    taskData.responsibleIds.map(async (responsible) => {
      let user = await users.findOne({ wrikeUser: responsible });
      return await user.graphId;
    })
  );

  let wrikeData = `Title:\n${taskData.title}\n\nDescription:\n${taskData.description}\n\nComments: \n`;
  let wrikeComments = "";
  await Promise.all(
    taskComments.data.map(async (comment) => {
      let user = await users.findOne({ wrikeUser: comment.authorId });
      wrikeComments += `${user} [${comment.createdDate}] - ${comment.text}\n`;
    })
  );

  wrikeData = {
    name: "wrike_data.txt",
    data: Buffer.from(wrikeData + wrikeComments).toString("base64"),
  };

  let attachmentData = await getAttachments(hook.taskId, accessToken);
  attachmentData = attachmentData.map((att) => {
    return { name: att.name, attData: att.data.toString("base64") };
  });

  const requestBody = {
    title: taskData.title || "",
    description: taskData.description || "",
    completedDate: hook.lastUpdatedDate || "",
    assigned: assigned || "",
    customer:
      taskData.customFields.find((field) => field.id === "IEAF5SOTJUAFB2KU")
        ?.value || "",
    type:
      taskData.customFields.find((field) => field.id === "IEAF5SOTJUAFTWBJ")
        ?.value || "",
    wrikeData: wrikeData || "",
    attachments: attachmentData || "",
  };
  // console.log(requestBody);
  try {
    await fetch(process.env.graph_power_automate_new_rfq, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log("sent rfq to folder");
    return true;
  } catch (error) {
    console.error(
      `there was an error handing off the new RFQ data to power automate: ${error} \n ${error.stack}`
    );
  }
  // Throw everything at power automate
}

module.exports = {
  getRFQData,
  modifyUserFromWrike,
  modifyCustomFieldFromWrike,
  createRFQEntry,
};

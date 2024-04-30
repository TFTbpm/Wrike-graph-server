async function createMarketingArchiveEntry(hook, users, accessToken) {
  // use the info from the hook, get all information associated with that task
  let taskData = await getTasks(hook.taskId, accessToken);
  taskData = taskData.data[0];
  const taskComments = await getComments(hook.taskId, accessToken);

  let assigned = await Promise.all(
    taskData.responsibleIds.map(async (responsible) => {
      let user = await users.findOne({ wrikeUser: responsible });
      return await user.name;
    })
  );

  let wrikeData = `Title:\n${taskData.title}\n\nDescription:\n${taskData.description}\n\nComments: \n`;
  let wrikeComments = "";
  await Promise.all(
    taskComments.data.map(async (comment) => {
      let user = await users.findOne({ wrikeUser: comment.authorId });
      if (user) {
        wrikeComments += `${user.name} [${comment.createdDate}] - ${comment.text}\n`;
      } else {
        wrikeComments += `(Undefined in Mongo) [${comment.createdDate}] - ${comment.text}\n`;
      }
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
    contentType: "test",
    wrikeData: wrikeData || "",
    attachments: attachmentData || "",
  };

  let body = {
    type: "object",
    properties: {
      title: {
        type: "string",
      },
      description: {
        type: "string",
      },
      completedDate: {
        type: "string",
      },
      assigned: {
        type: "array",
        items: {
          type: "string",
        },
      },
      // This is the folder it's coming from (ex. corporate comms)
      type: {
        type: "string",
      },
      // This is the "content type" custom field (ex. graphic, photo, video, etc.)
      contentType: {
        type: "string",
      },
      wrikeData: {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
          data: {
            type: "string",
          },
        },
      },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
            },
            attData: {
              type: "string",
            },
          },
          required: ["name", "attData"],
        },
      },
    },
  };

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
}

module.exports = { createMarketingArchiveEntry };

const { MongoClient } = require("mongodb");

const wrikeCustomFields = {
  Customer: "IEAF5SOTJUAFB2KU",
  Reviewer: "IEAF5SOTJUAE4XCY",
  Impact: "IEAF5SOTJUAEUZME",
  Priority: "IEAF5SOTJUAFCL3W",
  Guide: "IEAF5SOTJUAFCL3U",
};

const graphIDToWrikeID = { 12: "KUAQZDX2", 189: "KUARCPVF", 832: "KUAQ3CVX" };
async function createTask(
  title,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  responsibles,
  metadata,
  customFields,
  customStatus,
  fields
) {
  let URI;
  const maxRetries = 3;
  let retryCount = 0;
  const retryDelay = 1000;
  while (retryCount < maxRetries) {
    try {
      if (title === undefined || folderId === undefined) {
        return;
      }

      // these need to be defined since Wrike doesnt take URI encoding for objects
      const stringArr = [
        "title",
        "description",
        "status",
        "importance",
        "customStatus",
      ];

      const params = {
        title: title || null,
        description: description || null,
        status: status || null,
        importance: importance || null,
        dates: dates || null, // obj
        shareds: shareds || null, //array
        parents: parents || null, // array
        responsibles:
          responsibles === null
            ? null
            : responsibles.length > 0
            ? responsibles
            : null, // array
        metadata: metadata || null, // array
        customFields: customFields || null, // array
        customStatus: customStatus || null,
        fields: fields || null, // array
      };

      const queryParams = [];

      for (const key in params) {
        if (params[key] !== null) {
          if (stringArr.includes(key)) {
            // if its a string
            queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
          } else {
            // if its an object
            queryParams.push(`${key}=${JSON.stringify(params[key])}`);
          }
        }
      }

      const queryString = queryParams.join("&");

      URI = `https://www.wrike.com/api/v4/folders/${folderId}/tasks?${queryString}`;
      // console.log(`URL: ${URL} \n tokentype:${typeof access_token}`);

      const response = await fetch(URI, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      });
      // console.log(response);

      if (!response.ok) {
        throw new Error(
          `Request failed with status ${response.status}, ${response.statusText}. \n URL: ${URI}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      lastError = error;
      console.error(
        `An error occured while modifying a task: ${error} \n URL: ${URI} \n retry ${retryCount}`
      );
      retryCount++;
      await new Promise((p) => {
        setTimeout(p, retryDelay);
      });
    }
  }
}

// TODO: will need to add title here for orders (title changes but PO doesn't)
async function modifyTask(
  taskId,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  addResponsibles,
  metadata,
  customFields,
  customStatus,
  fields,
  removeResponsibles
) {
  let URI;
  const maxRetries = 3;
  let retryCount = 0;
  const retryDelay = 1000;
  while (retryCount < maxRetries) {
    try {
      if (taskId === undefined || folderId === undefined) {
        return;
      }
      const stringArr = [
        "title",
        "description",
        "status",
        "importance",
        "customStatus",
      ];
      const params = {
        description: description || null,
        status: status || null,
        importance: importance || null,
        dates: dates || null,
        shareds: shareds || null,
        parents: parents || null,
        addResponsibles: addResponsibles || null,
        metadata: metadata || null,
        customFields: customFields || null,
        customStatus: customStatus || null,
        fields: fields || null,
        removeResponsibles: removeResponsibles || null,
      };
      const queryParams = [];

      for (const key in params) {
        if (params[key] !== null) {
          if (stringArr.includes(key)) {
            // if its a string
            queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
          } else {
            // if its an object
            queryParams.push(`${key}=${JSON.stringify(params[key])}`);
          }
        }
      }

      const queryString = queryParams.join("&");

      URI = `https://www.wrike.com/api/v4/tasks/${taskId}?${queryString}`;
      const response = await fetch(URI, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      return await data;
    } catch (error) {
      lastError = error;
      console.error(
        `An error occured while modifying a task: ${error} \n URL: ${URI} \n retry ${retryCount}`
      );
      retryCount++;
      await new Promise((p) => {
        setTimeout(p, retryDelay);
      });
    }
  }
}

async function deleteTask(taskId, access_token) {
  try {
    const response = await fetch(
      `https://www.wrike.com/api/v4/tasks/${taskId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while deleting a task: ${error}`);
    throw error;
  }
}

async function getTasks(taskId, access_token) {
  taskId = taskId || "";
  try {
    let URI = "https://www.wrike.com/api/v4/tasks/";
    if (typeof taskId === "object") {
      let tasks = taskId.join("%2C%20");
      URI += tasks;
    } else {
      URI += taskId;
    }
    const response = await fetch(URI, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while getting a task: ${error}`);
    throw error;
  }
}

async function processRFQ(rfq) {
  const client = new MongoClient(process.env.mongoURL);
  const db = client.db(process.env.mongoDB);
  const wrikeTitles = db.collection(process.env.mongoRFQCollection);

  // TODO: Move most of these to custom fields

  const descriptionStr = `Title: (RFQ) ${rfq.title} <br>
    Link to SharePoint: ${rfq.url} <br>
    Customer Name: ${rfq.customerName} <br>
    Account Type: ${rfq.accountType} <br>
    Contact Email: ${rfq.contactEmail} <br>
    Contact Name: ${rfq.contactName} <br>
    Requested Date (Customer): ${rfq.customerRequestedDate} <br>
    Due Date: ${rfq.internalDueDate} <br>
    # Line Items: ${rfq.numberOfLineItems} <br>
    Priority: ${rfq.priority} <br>
    ID: ${rfq.id}
    `;

  const title = await wrikeTitles.findOne({ title: rfq.title });

  // if this title hasn't been put into the system yet:
  if (title === null) {
    try {
      createTask(
        `(RFQ) ${rfq.title}`,
        process.env.wrike_folder_rfq,
        process.env.wrike_perm_access_token,
        descriptionStr,
        null,
        rfq.priority,
        rfq.internalDueDate
          ? {
              start: rfq.startDate.slice(0, rfq.startDate.length - 2),
              due: rfq.internalDueDate.slice(0, rfq.internalDueDate.length - 2),
            }
          : null,
        null,
        null,
        [...(rfq.assinged == null ? [] : [rfq.assinged])],
        null,
        rfq.reviewer && rfq.customerName
          ? [
              {
                id: wrikeCustomFields.Customer,
                value: rfq.customerName.toUpperCase(),
              },
              { id: wrikeCustomFields.Reviewer, value: rfq.reviewer },
            ]
          : rfq.reviewer
          ? [{ id: wrikeCustomFields.Reviewer, value: rfq.reviewer }]
          : rfq.customerName
          ? [
              {
                id: wrikeCustomFields.Customer,
                value: rfq.customerName.toUpperCase(),
              },
            ]
          : null,
        rfq.status,
        null
      ).then((data) => {
        try {
          wrikeTitles.insertOne({ title: rfq.title, id: data.data[0].id });
        } catch (e) {
          console.log(`error with inserting rfq: ${e}`);
        }
      });
      console.log("is new");
    } catch (e) {
      console.log(`error creating rfq: ${e}`);
    }

    // MODIFY RFQ --------------------------------------
  } else {
    // if it exists in the system, modify the task
    const taskID = title.id;
    try {
      modifyTask(
        taskID,
        process.env.wrike_folder_rfq,

        process.env.wrike_perm_access_token,
        descriptionStr,
        null,
        rfq.priority,
        rfq.internalDueDate
          ? {
              start: rfq.startDate.slice(0, rfq.startDate.length - 2),
              due: rfq.internalDueDate.slice(0, rfq.internalDueDate.length - 2),
            }
          : null,
        null,
        null,
        [...(rfq.assinged == null ? [] : [rfq.assinged])],
        null,
        rfq.reviewer && rfq.customerName
          ? [
              {
                id: wrikeCustomFields.Customer,
                value: rfq.customerName.toUpperCase(),
              },
              { id: wrikeCustomFields.Reviewer, value: rfq.reviewer },
            ]
          : rfq.reviewer
          ? [{ id: wrikeCustomFields.Reviewer, value: rfq.reviewer }]
          : rfq.customerName
          ? [
              {
                id: wrikeCustomFields.Customer,
                value: rfq.customerName.toUpperCase(),
              },
            ]
          : null,
        rfq.status,
        null,
        [...(rfq.assinged == null ? Object.values(graphIDToWrikeID) : [])]
      );
      console.log("not new, but modified");
    } catch (e) {
      console.log(`error updating rfq: ${e}`);
    }
  }
}

async function processDataSheet(datasheet) {
  client = new MongoClient(process.env.mongoURL);
  const db = client.db(process.env.mongoDB);
  const wrikeTitles = db.collection(process.env.mongoDatasheetCollection);

  const title = await wrikeTitles.findOne({ title: datasheet.title });
  if (title === null) {
    try {
      createTask(
        datasheet.title,
        process.env.wrike_folder_datasheet_requests,
        process.env.wrike_perm_access_token,
        datasheet.description,
        null,
        datasheet.priority,
        {
          start: datasheet.startDate.slice(0, datasheet.startDate.length - 1),
          duration: 4800,
        },
        null,
        null,
        null,
        null,
        datasheet.guide
          ? [
              {
                id: wrikeCustomFields.Guide,
                value: datasheet.guide,
              },
              {
                id: wrikeCustomFields.Priority,
                value: parseInt(datasheet.priorityNumber),
              },
            ]
          : [
              {
                id: wrikeCustomFields.Priority,
                value: parseInt(datasheet.priorityNumber),
              },
            ],
        datasheet.status,
        null
      ).then((data) => {
        console.log("new datasheet");
        try {
          wrikeTitles.insertOne({
            title: datasheet.title,
            id: data.data[0].id,
          });
        } catch (e) {
          throw new Error(`Error while inserting datasheet: ${e}`);
        }
      });
    } catch (e) {
      console.log(`error creating datasheet: ${e}`);
    }
  } else {
    try {
      const taskID = title.id;
      modifyTask(
        taskID,
        process.env.wrike_folder_datasheet_requests,
        process.env.wrike_perm_access_token,
        datasheet.description,
        null,
        datasheet.priority,
        {
          start: datasheet.startDate.slice(0, datasheet.startDate.length - 1),
          duration: 4800,
        },
        null,
        null,
        null,
        null,
        datasheet.guide
          ? [
              {
                id: wrikeCustomFields.Guide,
                value: datasheet.guide,
              },
              {
                id: wrikeCustomFields.Priority,
                value: parseInt(datasheet.priorityNumber),
              },
            ]
          : [
              {
                id: wrikeCustomFields.Priority,
                value: parseInt(datasheet.priorityNumber),
              },
            ],
        datasheet.status,
        null,
        null
      ).then((data) => {
        console.log("updated datasheet");
      });
    } catch (e) {
      console.log(`error editing datasheet: ${e}`);
    }
  }
}

async function processOrder(order) {
  const client = new MongoClient(process.env.mongoURL);
  const db = client.db(process.env.mongoDB);
  const wrikeTitles = db.collection(process.env.mongoOrderCollection);
  const title = await wrikeTitles.findOne({ title: order.title });
  console.log(title);
  if (title == null) {
    try {
      createTask(
        order.title,
        process.env.wrike_folder_orders,
        process.env.wrike_perm_access_token,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null
      ).then((data) => {
        console.log("new order");
        try {
          wrikeTitles.insertOne({
            title: order.poNumber,
            id: data.data[0].id,
          });
        } catch (e) {
          throw new Error(`Error while inserting order: ${e}`);
        }
      });
    } catch (e) {
      console.log(`error creating order: ${e}`);
    }
  } else {
    const taskID = title.id;
    try {
      modifyTask(
        taskID,
        process.env.wrike_folder_orders,
        process.env.wrike_perm_access_token,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null
      ).then((data) => {
        console.log("updated order");
      });
    } catch (e) {
      console.log(`error modifying order: ${e}`);
    }
  }
}

module.exports = {
  createTask,
  modifyTask,
  deleteTask,
  getTasks,
  processRFQ,
  processDataSheet,
  processOrder,
};

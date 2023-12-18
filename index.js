const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const {
  processRFQ,
  processDataSheet,
  processOrder,
} = require("./modules/wrike/task");
const graphAccessData = require("./modules/graph/accessToken");
const rateLimit = require("express-rate-limit");
const {
  getRFQData,
  modifyUserFromWrike,
  modifyCustomFieldFromWrike,
} = require("./modules/graph/rfq");
const getDatasheets = require("./modules/graph/datasheet");
const { getOrders, addOrder } = require("./modules/graph/order");
const getOrderAttachment = require("./modules/wrike/getOrderAttachment");
const { MongoClient } = require("mongodb");
const {
  mapWrikeUsersToGraphIDs,
  syncWrikeToCollection,
  findAndAddWrikeUID,
} = require("./modules/Sync");

// dotenv config
config();
// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info (low latency check)
// TODO: add in a handler for when marked for completed to remove from this array

// TODO: make a function/module to update these
// Wrike to Graph conversions
const rfqCustomStatuses = [
  {
    id: "IEAF5SOTJMEAEFWQ",
    name: "In Progress",
  },
  {
    id: "IEAF5SOTJMEAEFW2",
    name: "Awaiting Assignment",
  },
  {
    id: "IEAF5SOTJMEAEFXE",
    name: "In Review",
  },
  {
    id: "IEAF5SOTJMEAFYJS",
    name: "New",
  },
  {
    id: "IEAF5SOTJMEAGWEI",
    name: "Peer Approved",
  },
  {
    id: "IEAF5SOTJMEAEFWR",
    name: "Completed",
  },
  {
    id: "IEAF5SOTJMEAG235",
    name: "Deleted",
  },
];
const dsCustomStatuses = [
  {
    id: "IEAF5SOTJMEEOFGO", //active
    name: "Working on Document",
  },
  {
    id: "IEAF5SOTJMEEOFGY", // peer review
    name: "Peer Review",
  },
  {
    id: "IEAF5SOTJMEEOFHC", // ready to route
    name: "Ready to Route",
  },
  {
    id: "IEAF5SOTJMEEOFHM", // routed
    name: "Routed for Approval",
  },
  {
    id: "IEAF5SOTJMEEOFGP", // completed
    name: "Approved in DMS-Complete",
  },
  {
    id: "IEAF5SOTJMEEOFIW", // need escalation
    name: "Needs Escalation",
  },
  {
    id: "IEAF5SOTJMEEOFJA", // pending info
    name: "Pending Information",
  },
  {
    id: "IEAF5SOTJMEEOFIM", // deferred
    name: "Open",
  },
  {
    id: "IEAF5SOTJMEEOFGP", // completed
    name: "Achieve",
  },
  {
    id: "IEAF5SOTJMEEOJ5Z", // cancelled
    name: "Canceled",
  },
  {
    id: "IEAF5SOTJMEEOFIM", // deferred
    name: "Closed",
  },
  {
    id: "IEAF5SOTJMEEOFGO", //active
    name: "Draft Completed",
  },
  {
    id: "IEAF5SOTJMEEOFHM", //routed
    name: "Routed",
  },
  {
    id: "IEAF5SOTJMEEOFIM",
    name: "Pending Start - Low Priority",
  },
];
const orderCustomStatuses = [
  {
    id: "IEAF5SOTJMEGHU32",
    name: "Recieved",
  },
  {
    id: "IEAF5SOTJMEGHU4E",
    name: "Active",
  },
  {
    id: "IEAF5SOTJMEGHU33",
    name: "Completed",
  },
  {
    id: "IEAF5SOTJMEGHU4Q",
    name: "Deferred",
  },
  {
    id: "IEAF5SOTJMEGHU43",
    name: "Cancelled",
  },
];
const graphRFQPriorityToWrikeImportance = {
  High: "High",
  Medium: "Normal",
  Low: "Low",
};
const graphDSPriorityToWrikeImportance = {
  High: "High",
  Medium: "Normal",
  Low: "Low",
  Critical: "High",
};

// This will prevent DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const app = express();

app.use(limiter);

app.set("trust proxy", 1);

const addAPIIdToReq = async (req, res, next) => {
  try {
    if (req.body[0].value == '""') {
      next();
    }
    const result = await findAndAddWrikeUID(req.body[0].value);
    console.log(`res ${JSON.stringify(result)}`);

    // Modify the 'req' object to include the user information
    req.body[0].value = result.wrikeUser;

    // Call next middleware in the stack
    next();
  } catch (error) {
    console.error(`Error in findAndAddWrikeUIDMiddleware: ${error}`);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// just used to verify the server is running
app.get("/", (req, res) => {
  res.send("up on /");
});

// This takes in raw Wrike body for comparing to value (x-hook-secret) to ensure origin is Wrike
app.post("/wrike/*", (req, res, next) => {
  try {
    rawRequestBody = "";
    req.on("data", (chunk) => {
      rawRequestBody += chunk;
    });
    next();
  } catch (error) {
    console.error(
      `There was an error parsing the raw data: ${error}\n ${error.stack}`
    );
    res.status(500).send();
  }
});

app.use(express.json());

// data validation for x-hook-secret removes all hits on endpoint without header
app.post("/wrike/*", header("X-Hook-Secret").notEmpty(), (req, res, next) => {
  const wrikeHookSecret = process.env.wrike_hook_secret;
  const errors = validationResult(req).errors;
  const calculatedHash = crypto
    .createHmac("sha256", wrikeHookSecret)
    .update(rawRequestBody)
    .digest("hex");
  const xHookSecret = req.get("X-Hook-Secret");

  try {
    // Initializes Wrike webhook
    if (req.body["requestType"] === "WebHook secret verification") {
      // Change
      const xHookCrypto = crypto
        .createHmac("sha256", wrikeHookSecret)
        .update(xHookSecret)
        .digest("hex");

      res.status(200).set("X-Hook-Secret", xHookCrypto).send();
      return;
    }

    // x-hook-secret is missing:
    if (errors.length != 0) {
      console.log(errors);
      res.status(400).send();
      return;
    }

    // This checks if the xhooksecret used the correct secret key
    // Wrong secret value:
    if (xHookSecret !== calculatedHash) {
      res.status(401).send(`Invalid hash`);
      console.log(
        `body: ${req.body} \n raw: ${rawRequestBody} \n xhooksecret: ${xHookSecret} \n calculated: ${calculatedHash}`
      );
      return;
    }

    next();
  } catch (error) {
    console.error(
      `there was an error valdiating the source of the request: ${error} \n ${error.stack}`
    );
  }
});

app.post("/wrike/rfq/assignee", async (req, res) => {
  let wrikeTitles;
  let users;
  let client;
  let result;

  // Connect to mongo
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    wrikeTitles = db.collection(process.env.mongoRFQCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(`there was an issue accessing Mongo: ${error}`);
  }

  try {
    result = await modifyUserFromWrike(req.body, wrikeTitles, users);
  } catch (e) {
    console.log(e);
  }

  if (result) {
    console.log("modified RFQ");
    res.status(200).send();
  } else {
    console.log("failed to modify RFQ");
    res.status(202).send();
  }
});

// RFQ reviewer
app.post("/wrike/rfq/reviewer", addAPIIdToReq, async (req, res) => {
  let client;
  let rfqCollection;
  let users;
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    rfqCollection = db.collection(process.env.mongoRFQCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(`there was an issue accessing Mongo: ${error}`);
  }

  try {
    await modifyCustomFieldFromWrike(req.body, rfqCollection, users, "rfq");
  } catch (error) {
    console.error(error);
  }

  res.status(202).send();
});

app.post("/wrike/order", async (req, res) => {
  let start = performance.now();
  // console.log(req.body);
  if (req.body[0].status == "Completed") {
    console.log("this status is complete");
    // get attachment
    const data = await getOrderAttachment(
      req.body[0].taskId,
      process.env.wrike_perm_access_token
    );
    const bufferString = data.attachment.toString("base64");
    const fileHash = crypto
      .createHash("sha256")
      .update(data.data[0].name)
      .digest("hex");

    // TODO: add a filter here which checks if the wrike ID

    let orderResult;
    let client;

    try {
      client = new MongoClient(process.env.mongoURL);
      const db = client.db(process.env.mongoDB);
      const ordersCollection = db.collection(process.env.mongoOrderCollection);
      const currentOrder = await ordersCollection.findOne({
        content: fileHash,
      });
      if (!currentOrder) {
        await ordersCollection.insertOne({
          id: req.body[0].taskId,
          content: fileHash,
        });
      }
      console.log({
        id: req.body[0].taskId,
        content: fileHash,
      });
      orderResult = await addOrder(
        bufferString,
        data.data[0].name,
        process.env.graph_power_automate_uri
      );
    } catch (error) {
      console.error(
        `there was an issue connecting to the mongoclient to upload hash and id: ${error}`
      );
    } finally {
      if (client) {
        await client.close();
      }
    }

    // ? What if there's more than 2
    let end = performance.now();
    console.log(`time taken: ${(end - start) / 1000}s`);
  }
  res.status(202).send();
});

// Datasheet reviewer
app.post("/wrike/datasheets/reviewer", addAPIIdToReq, async (req, res) => {
  let client;
  let orderCollection;
  let users;
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    orderCollection = db.collection(process.env.mongoDatasheetCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(`there was an issue accessing Mongo: ${error}`);
  }

  await modifyCustomFieldFromWrike(
    req.body,
    orderCollection,
    users,
    "datasheet"
  );

  res.status(202).send();
});

app.post("/wrike/rfq/delete", async (req, res) => {
  // console.log(JSON.stringify(req.body));
  let client;
  let rfqs;
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    rfqs = db.collection(process.env.mongoRFQCollection);
  } catch (e) {
    console.error(
      `there was an issue with connecting to mongo for deleting: ${e}`
    );
  }
  for (let task of req.body) {
    try {
      if (task.taskId) {
        const deleteResult = await rfqs.deleteMany({ id: task.taskId });
        console.log(deleteResult);
      } else {
        console.log(`taskID undefined`);
      }
    } catch (e) {
      console.error(
        `there was a problem deleting task ${task.taskId}: \n ${e}`
      );
    }
  }
  try {
    if (rfqs) {
      await client.close();
    }
  } catch (e) {
    console.error(
      `there was an error closing the connection: ${e} \n ${e.stack}`
    );
  }
  res.status(202).send();
});

app.post("/wrike/order/delete", async (req, res) => {
  let client;
  let orders;
  // connect to mogno
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    orders = db.collection(process.env.mongoOrderCollection);
  } catch (error) {
    let err = `there was an error connecing to the order database for deletion: ${error}`;
    console.error(err);
  }

  // go through deleted tasks and remove them from mongo
  for (let task of req.body) {
    try {
      if (task.taskId) {
        const deleteResult = await orders.deleteMany({ id: task.taskId });
        console.log(deleteResult);
      } else {
        console.log(`taskID undefined`);
      }
    } catch (e) {
      console.error(
        `there was a problem deleting task ${task.taskId}: \n ${e}`
      );
    }
  }
  try {
    if (orders) {
      await client.close();
    }
  } catch (e) {
    console.error(
      `there was an error closing the connection: ${e} \n ${e.stack}`
    );
  }
  res.status(202).send();
});

// ! This route will be used to clean up untracked RFQ's. Only trigger manually.
app.post("/rfq/sync", async (req, res) => {
  try {
    await syncWrikeToCollection(
      process.env.wrike_folder_rfq,
      process.env.mongoRFQCollection
    );
  } catch (error) {
    console.error(`something went wrong: ${error} \n ${error.stack}`);
  }
  res.status(200).send();
});

// app.post("/order/sync", async (req, res) => {
//   try {
//     await syncWrikeToCollection(
//       process.env.wrike_folder_orders,
//       process.env.mongoOrderCollection
//     );
//   } catch (error) {
//     console.error(`something went wrong: ${error}`);
//   }
//   res.status(200).send();
// });

app.post("/graph/*", async (req, res, next) => {
  if (req.url.includes("validationToken=")) {
    // have to check for %3A with a regex and replace matches since decodeURI treats them as special char
    res
      .contentType("text/plain")
      .status(200)
      .send(
        decodeURI(req.url.replace(/%3A/g, ":").split("validationToken=")[1])
      );
    return;
  }

  if (req.body.value[0].clientState !== process.env.graph_subscription_secret) {
    res.status(400).send();
    console.log(
      `client state didnt match: ${JSON.stringify(req.body.value[0])}`
    );
    return;
  }
  next();
});

app.post("/graph/rfq", async (req, res) => {
  let client;
  let wrikeTitles;
  let users;

  try {
    client = new MongoClient(process.env.mongoURL);
    await client.connect();
    const db = client.db(process.env.mongoDB);
    wrikeTitles = db.collection(process.env.mongoRFQCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(
      `there was an error connecting to mongo (/graph/rfq): ${error}`
    );
  }

  const accessData = await graphAccessData();
  let rfqData = await getRFQData(
    process.env.graph_site_id_sales,
    process.env.graph_list_id_rfq,
    accessData.access_token
  );

  // TODO: get custom statuses, get customers (CF), add reveiwer to custom field reviewer
  // Puts all the elements in an easy to read format
  let rfqPromises;
  try {
    rfqPromises = rfqData.value.map(async (element) => {
      // console.log("start");
      let reviewer = await users.findOne({
        graphId: element.fields.ReviewerLookupId,
      });
      let assigned = await users.findOne({
        graphId: element.fields.AssignedLookupId,
      });

      // some rfqs are input after they're due, in which case start date needs to move to due date:

      let startDate = new Date(element.createdDateTime);
      const internalDueDate = new Date(
        element.fields.Internal_x0020_Due_x0020_Date
      );
      const requestedDate = new Date(
        element.fields.Customer_x0020_Requested_x0020_Date
      );

      // if start date is after either then set the start date to that date
      startDate =
        requestedDate.getTime() < startDate.getTime() ||
        internalDueDate.getTime() < startDate.getTime()
          ? requestedDate.getTime() < internalDueDate.getTime()
            ? element.fields.Customer_x0020_Requested_x0020_Date
            : element.fields.Internal_x0020_Due_x0020_Date
          : element.createdDateTime;

      // console.log("end");

      return {
        title: element.fields.Title,
        url: element.fields._dlc_DocIdUrl.Url,
        accountType: element.fields.Account_x0020_Type,
        contactEmail: element.fields.Contact_x0020_Email,
        contactName: element.fields.Contact_x0020_Name,
        customerName: element.fields.Customer_x0020_Name,
        customerRequestedDate:
          element.fields.Customer_x0020_Requested_x0020_Date,
        internalDueDate:
          element.fields.Internal_x0020_Due_x0020_Date ||
          element.fields.Customer_x0020_Requested_x0020_Date,
        startDate: startDate,
        numberOfLineItems:
          element.fields.Number_x0020_of_x0020_Line_x0020_Items,
        priority:
          graphRFQPriorityToWrikeImportance[element.fields.Priority] ||
          graphRFQPriorityToWrikeImportance.Medium,
        quoteSource: element.fields.Quote_x0020_Source,
        status:
          rfqCustomStatuses.filter((s) => s.name == element.fields.Status)[0]
            .id || "IEAF5SOTJMEAFYJS",
        submissionMethod: element.fields.Submission_x0020_Method,
        modified: element.fields.Modified,
        id: element.id,
        assinged: assigned?.wrikeUser,
        reviewer: reviewer?.wrikeUser,
      };
    });
  } catch (error) {
    console.error(
      `there was an error iterating rfqs : ${error} \n ${error.stack}`
    );
  }

  let currentHistory;
  try {
    currentHistory = await Promise.all(rfqPromises);
  } catch (error) {
    console.error(`there was an error in rfq promises: ${error}`);
  }

  let processPromises;
  try {
    // console.log("yup");
    processPromises = currentHistory.map(async (rfq) => {
      try {
        return await processRFQ(rfq, wrikeTitles, users);
      } catch (e) {
        console.error(
          `there was an issue processing RFQs (in route /graph/rfq): ${e} \n ${e.stack}`
        );
        return false;
      }
    });
    try {
      await Promise.all(processPromises);
    } catch (error) {
      console.error(`error resolving processPromises: ${error}`);
    }
  } catch (e) {
    console.log(`error mapping rfq: ${e}`);
  } finally {
    try {
      await client?.close();
    } catch (error) {
      console.error(`couldn't close client: ${error} \n ${error.stack}`);
    }
  }

  res.status(200).send("good");
});

app.post("/graph/datasheets", async (req, res) => {
  let client;
  let users;
  let wrikeTitles;
  let datasheetData;
  const accessData = await graphAccessData();

  try {
    datasheetData = await getDatasheets(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_datasheet,
      accessData.access_token
    );
  } catch (e) {
    console.log(`There was an error fetching datasheets: ${e}`);
  }

  try {
    client = new MongoClient(process.env.mongoURL);
    await client.connect();
    const db = client.db(process.env.mongoDB);
    wrikeTitles = db.collection(process.env.mongoDatasheetCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(
      `there was an error connecting to mongo (/graph/datasheets): ${error}`
    );
  }

  let datasheetPromises;
  try {
    datasheetPromises = datasheetData.map(async (datasheet) => {
      let author = await users.findOne({
        graphId: datasheet.fields.Author0LookupId,
      });
      let guide = await users.findOne({
        graphId: datasheet.fields.Guide_x002f_Mentor?.LookupId,
      });

      return {
        title: `(DS) ${datasheet.fields.Title}` || null,
        description: null,
        priority:
          graphDSPriorityToWrikeImportance[datasheet.fields.field_5] ||
          graphDSPriorityToWrikeImportance.Medium,
        assignee: author?.wrikeUser,
        status:
          dsCustomStatuses.filter((s) => s.name == datasheet.fields.Status)[0]
            ?.id ||
          "IEAF5SOTJMEEOFGO" ||
          null,
        priorityNumber: datasheet.fields.Priority_x0023_ || null,
        guide: guide?.wrikeUser,
        startDate: datasheet.createdDateTime,
        graphID: datasheet.id,
      };
    });
  } catch (e) {
    console.log(`there was an error iterating datasheets: ${e} \n ${e.stack}`);
  }
  const currentHistory = await Promise.all(datasheetPromises);

  let processPromises;
  try {
    processPromises = currentHistory.map(async (ds) => {
      try {
        return await processDataSheet(ds, wrikeTitles, users);
      } catch (e) {
        console.error(
          `there was an issue processing datasheets (in route /graph/datasheets): ${e} \n ${e.stack}`
        );
        return false;
      }
    });
    await Promise.all(processPromises);
  } catch (e) {
    console.log(`error mapping datasheets: ${e}`);
  } finally {
    if (client) {
      console.log("closing client");
      await client.close();
    }
  }

  res.status(200).send("good");
});

app.post("/graph/order", async (req, res) => {
  // Graph sends this once a new order is created
  let client;
  let users;
  let wrikeTitles;
  const skipToken = process.env.graph_order_skip_token;
  const accessData = await graphAccessData();
  try {
    orderData = await getOrders(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_order,
      accessData.access_token,
      skipToken
    );
  } catch (e) {
    console.log(`There was an error fetching orders: ${e}`);
  }

  try {
    client = new MongoClient(process.env.mongoURL);
    await client.connect();
    const db = client.db(process.env.mongoDB);
    wrikeTitles = db.collection(process.env.mongoRFQCollection);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(
      `there was an issue connecting to mongo (/graph/order): ${error}`
    );
  }
  let orderPromises;

  try {
    orderPromises = orderData.map(async (order) => {
      let author = await users.findOne({
        graphId: order.fields.AuthorLookupId,
      });
      // ! with the time limit on vercel, there's no other way to know whether it was created by the API or not
      if (order.createdBy.user.displayName == "System") {
        console.log("this was created from a Wrike item");

        // TODO: add a salt here
        const fileHash = crypto
          .createHash("sha256")
          .update(order.fields.FileLeafRef)
          .digest("hex");
        // Get mongo entry for given resource id
        wrikeTitles.findOneAndUpdate(
          { content: fileHash },
          { $set: { graphID: order.id, salt: "null", iterations: 0 } }
        );
      }

      const desc = `URL: ${order.fields._dlc_DocIdUrl.url || "none"} 
      <br> Entered date: ${order.createdDateTime} 
      <br> PO number: ${order.fields.PONumber || "none"} 
      <br> SO number: ${order.fields.SONumber || "none"}
      <br> Customer: ${order.fields.CustomerName || "none"}
      <br> Author: ${author}`;

      return {
        title: order.fields.FileLeafRef || null,
        url: order.fields._dlc_DocIdUrl.url || null,
        startDate: order.createdDateTime || null,
        author: author.wrikeUser,
        customerName: order.fields.CustomerName || null,
        poType: order.fields.POType || null,
        shipToSite: order.fields.ShipToSite || null,
        poNumber: order.fields.PONumber || null,
        soNumber: order.fields.SONumber || null,
        id: order.id,
        description: null,
      };
    });
  } catch (e) {
    console.error(`there was an error iterating order: ${e}`);
  }

  const currentHistory = await Promise.all(orderPromises);

  try {
    const processPromises = currentHistory.map(async (rfq) => {
      try {
        return await processOrder(rfq, wrikeTitles);
      } catch (e) {
        console.error(
          `there was an issue processing RFQs (in route /graph/rfq): ${e} \n ${e.stack}`
        );
        return false;
      }
    });

    await Promise.all(processPromises);
  } catch (e) {
    console.log(`error mapping rfq: ${e}`);
  } finally {
    if (client) {
      console.log(`closing client...`);
      await client.close();
    }
  }
  res.status(200).send("good");
});

app.use("*", (req, res) => {
  res.status(400).send("Something went wrong");
});

app.listen(5501, () => {
  console.log("running server");
});

app.listen();

module.exports = app;

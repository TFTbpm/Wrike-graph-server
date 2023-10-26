const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const { createTask, modifyTask } = require("./modules/wrike/task");
const graphAccessData = require("./modules/graph/accessToken");
const rateLimit = require("express-rate-limit");
const getRFQData = require("./modules/graph/rfq");
const { MongoClient } = require("mongodb");

// dotenv config
config();

// mongodb client intialization
const client = new MongoClient(process.env.mongoURL);
const db = client.db(process.env.mongoDB);
const wrikeTitles = db.collection(process.env.mongoCollection);

// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info (low latency check)
let wrikeHistory = [];
let graphHistory = [1, 2, 3, 4, 5];
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
const graphPriorityToWrikeImportance = {
  High: "High",
  Medium: "Normal",
  Low: "Low",
};
const graphIDToWrikeID = { 12: "KUAQZDX2", 189: "KUARCPVF", 832: "KUAQ3CVX" };

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

// This takes in raw Wrike body for comparing to value (x-hook-secret) to ensure origin is Wrike
app.post("/wrike", (req, res, next) => {
  rawRequestBody = "";
  req.on("data", (chunk) => {
    rawRequestBody += chunk;
  });
  next();
});

app.use(express.json());

// data validation for x-hook-secret removes all hits on endpoint without header without needing response
app.post("/wrike", header("X-Hook-Secret").notEmpty(), (req, res) => {
  const wrikeHookSecret = process.env.wrike_hook_secret;
  const errors = validationResult(req).errors;

  // x-hook-secret is missing:
  if (errors.length != 0) {
    res.status(400).send();
    return;
  }

  const xHookSecret = req.get("X-Hook-Secret");
  // This checks if the xhooksecret used the correct secret key
  const calculatedHash = crypto
    .createHmac("sha256", wrikeHookSecret)
    .update(rawRequestBody)
    .digest("hex");

  // Initializes Wrike webhook
  if (req.body["requestType"] === "WebHook secret verification") {
    // Change
    res.status(200).set("X-Hook-Secret", calculatedHash).send();
    return;
  }

  // Wrong secret value:
  if (xHookSecret !== calculatedHash) {
    res.status(401).send(`Invalid hash`);
    console.log(
      `body: ${req.body} \n raw: ${rawRequestBody} \n xhooksecret: ${xHookSecret} \n calculated: ${calculatedHash}`
    );
    return;
    //  hash of the data was already sent:
  } else if (
    crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex") == wrikeHistory
  ) {
    res.status(202).send("already updated");
    console.log("Already updated");
    return;
    // send the data:
  } else {
    res.status(200).send("good");
    wrikeHistory = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");
    console.log(
      `xhooksecret ${xHookSecret} matches calculated ${calculatedHash}`
    );
    return;
  }
});

// just used to verify the server is running
app.get("/", (req, res) => {
  res.send("up on /");
});

app.post("/graph", async (req, res) => {
  const graphClientSecret = process.env.graph_api_secret;
  let currentHistory = [];

  // for initlaizing ms subscription
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

  if (req.body.clientState !== process.env.graph_subscription_secret) {
    res.status(400).send();
    console.log(`client state didnt match: ${req.body.clientState}`);
    return;
  }

  const accessData = await graphAccessData();
  let rfqData = await getRFQData(
    process.env.graph_site_id_sales,
    process.env.graph_list_id_rfq,
    accessData.access_token
  );

  // TODO: get custom statuses, get customers (CF), add reveiwer to custom field reviewer
  // Puts all the elements in an easy to read format
  rfqData.value.forEach((element) => {
    currentHistory.push({
      title: element.fields.Title,
      url: element.fields._dlc_DocIdUrl.Url,
      accountType: element.fields.Account_x0020_Type,
      contactEmail: element.fields.Contact_x0020_Email,
      contactName: element.fields.Contact_x0020_Name,
      customerName: element.fields.Customer_x0020_Name,
      customerRequestedDate: element.fields.Customer_x0020_Requested_x0020_Date,
      internalDueDate:
        element.fields.Internal_x0020_Due_x0020_Date ||
        element.fields.Customer_x0020_Requested_x0020_Date,
      numberOfLineItems: element.fields.Number_x0020_of_x0020_Line_x0020_Items,
      priority:
        graphPriorityToWrikeImportance[element.fields.Priority] ||
        graphPriorityToWrikeImportance.Medium,
      quoteSource: element.fields.Quote_x0020_Source,
      status:
        rfqCustomStatuses.filter((s) => s.name == element.fields.Status)[0]
          .id || "IEAF5SOTJMEAFYJS",
      submissionMethod: element.fields.Submission_x0020_Method,
      modified: element.fields.Modified,
      id: element.id,
      assinged: graphIDToWrikeID[element.fields.AssignedLookupId] || null,
      reviewer: graphIDToWrikeID[element.fields.ReviewerLookupId] || null,
    });
  });

  currentHistory.forEach(async (rfq) => {
    const calculatedHash = crypto
      .createHmac("sha256", graphClientSecret)
      .update(JSON.stringify(rfq))
      .digest("hex");

    // quickly check if exact hash for entire rfq has already been processed
    // TODO: change this to the mongo db
    if (graphHistory.includes(calculatedHash)) {
      return;
    }
    graphHistory.push(calculatedHash);

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
      createTask(
        `(RFQ) ${rfq.title}`,
        process.env.wrike_folder_rfq,
        process.env.wrike_perm_access_token,
        descriptionStr,
        null,
        null,
        rfq.internalDueDate
          ? {
              due: rfq.internalDueDate.slice(0, rfq.internalDueDate.length - 2),
            }
          : null,
        null,
        null,
        [
          ...(rfq.assinged == null ? [] : [rfq.assinged]),
          ...(rfq.reviewer == null ? [] : [rfq.reviewer]),
        ],
        null,
        null,
        rfq.status,
        null
      ).then((data) => {
        wrikeTitles.insertOne({ title: rfq.title, id: data.data[0].id });
      });
      console.log("is new");

      // MODIFY RFQ --------------------------------------
    } else {
      // if it exists in the system, modify the task
      const taskID = title.id;
      modifyTask(
        taskID,
        process.env.wrike_folder_rfq,
        process.env.wrike_perm_access_token,
        descriptionStr,
        null,
        null,
        rfq.internalDueDate
          ? {
              due: rfq.internalDueDate.slice(0, rfq.internalDueDate.length - 2),
            }
          : null,
        null,
        null,
        [
          ...(rfq.assinged == null ? [] : [rfq.assinged]),
          ...(rfq.reviewer == null ? [] : [rfq.reviewer]),
        ],
        null,
        null,
        rfq.status,
        null
      );
      console.log("not new, but modified");
    }
  });
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

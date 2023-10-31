const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const { processRFQ, processDataSheet } = require("./modules/wrike/task");
const graphAccessData = require("./modules/graph/accessToken");
const rateLimit = require("express-rate-limit");
const getRFQData = require("./modules/graph/rfq");
const getDatasheets = require("./modules/graph/datasheet");

// dotenv config
config();
// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info (low latency check)
let wrikeHistory = [];
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

app.post("/graph/*", (req, res, next) => {
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
  let currentHistory = [];

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
      startDate: element.createdDateTime,
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

  try {
    await Promise.all(currentHistory.map(processRFQ));
  } catch (e) {
    console.log(`error mapping rfq: ${e}`);
  }
  res.status(200).send("good");
});

app.post("/graph/datasheets", async (req, res) => {
  let currentHistory = [];
  const accessData = await graphAccessData();
  let datasheetData;
  try {
    datasheetData = await getDatasheets(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_datasheet,
      accessData.access_token
    );
  } catch (e) {
    console.log(`There was an error fetching datasheets: ${e}`);
  }
  // ! TODO: there is an error here: Unhandled Promise Rejection 	{"errorType":"Runtime.UnhandledPromiseRejection","errorMessage":"TypeError: Cannot read properties of undefined (reading 'forEach')","reason":{"errorType":"TypeError","errorMessage":"Cannot read properties of undefined (reading 'forEach')","stack":["TypeError: Cannot read properties of undefined (reading 'forEach')","    at /var/task/index.js:223:23","    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)"]},"promise":{},"stack":["Runtime.UnhandledPromiseRejection: TypeError: Cannot read properties of undefined (reading 'forEach')","    at process.<anonymous> (file:///var/runtime/index.mjs:1276:17)","    at process.emit (node:events:529:35)","    at emit (node:internal/process/promises:149:20)","    at processPromiseRejections (node:internal/process/promises:283:27)","    at process.processTicksAndRejections (node:internal/process/task_queues:96:32)"]}
  try {
    datasheetData.value.forEach(async (datasheet) => {
      currentHistory.push({
        title: `(DS) ${datasheet.fields.Title}` || null,
        description: datasheet.fields.field_2 || null,
        priority: datasheet.fields.field_5 || null,
        author: graphIDToWrikeID[datasheet.fields.Author0LookupId] || null,
        status: datasheet.fields.Status || null,
        priorityNumber: datasheet.fields.Priority_x0023_ || null,
        guide:
          graphIDToWrikeID[datasheet.fields.Guide_x002f_Mentor.LookupId] ||
          null,
      });
    });
  } catch (e) {
    console.log(
      `there was an error iterating datasheets: ${e} \n data: ${datasheetData}`
    );
  }

  console.log(currentHistory);
  try {
    await Promise.all(currentHistory.map(processDataSheet));
  } catch (e) {
    console.log(`error mapping datasheets: ${e}`);
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

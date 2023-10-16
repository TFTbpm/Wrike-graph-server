const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const { createTask, modifyTask } = require("./modules/wrike/task");
const rateLimit = require("express-rate-limit");
const getRFQData = require("./modules/graph/rfq");
config();

// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info
let wrikeHistory = [];
let graphHistory = [1, 2, 3, 4, 5];
// TODO: add in a handler for when marked for compelted to remove from this array
let wrikeTitles = [];

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

app.post("/wrike", (req, res, next) => {
  rawRequestBody = "";
  req.on("data", (chunk) => {
    rawRequestBody += chunk;
  });
  next();
});

app.use(express.json());

app.post("/wrike", header("X-Hook-Secret").notEmpty(), (req, res) => {
  const wrikeHookSecret = process.env.wrike_hook_secret;
  const errors = validationResult(req).errors;
  if (errors.length === 0) {
    const xHookSecret = req.get("X-Hook-Secret");
    if (req.body["requestType"] === "WebHook secret verification") {
      const calculatedHash = crypto
        .createHmac("sha256", wrikeHookSecret)
        .update(xHookSecret)
        .digest("hex");
      // Change
      res.status(200).set("X-Hook-Secret", calculatedHash).send();
    } else {
      const calculatedHash = crypto
        .createHmac("sha256", wrikeHookSecret)
        .update(rawRequestBody)
        .digest("hex");
      if (xHookSecret !== calculatedHash) {
        res.status(401).send(`Invalid hash`);
        console.log(
          `body: ${req.body} \n raw: ${rawRequestBody} \n xhooksecret: ${xHookSecret} \n calculated: ${calculatedHash}`
        );
      } else if (
        crypto
          .createHash("sha256")
          .update(JSON.stringify(req.body))
          .digest("hex") == wrikeHistory
      ) {
        res.status(202).send("already updated");
        console.log("Already updated");
      } else {
        res.status(200).send("good");
        wrikeHistory = crypto
          .createHash("sha256")
          .update(JSON.stringify(req.body))
          .digest("hex");
        console.log(
          `xhooksecret ${xHookSecret} matches calculated ${calculatedHash}`
        );
      }
    }
  } else {
    res.status(400).send("Incorrect Header");
  }
});

app.get("/", (req, res) => {
  res.send("up on /");
});

app.post("/graph", async (req, res) => {
  const graphClientSecret = process.env.graph_api_secret;
  let currentHistory = [];
  if (req.url.includes("validationToken=")) {
    // have to check for %3A with a regex and replace matches since decodeURI treats them as special char
    res
      .contentType("text/plain")
      .status(200)
      .send(
        decodeURI(req.url.replace(/%3A/g, ":").split("validationToken=")[1])
      );
  } else {
    const params = new URLSearchParams({
      client_id: process.env.graph_client_id,
      scope: "https://graph.microsoft.com/.default",
      client_secret: graphClientSecret,
      grant_type: "client_credentials",
    }).toString();
    let response = await fetch(
      `https://login.microsoftonline.com/${process.env.graph_tenant_id}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );
    const accessData = await response.json();
    let rfqData = await getRFQData(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_rfq,
      accessData.access_token
    );
    rfqData.value.forEach((element) => {
      currentHistory.push({
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
        numberOfLineItems:
          element.fields.Number_x0020_of_x0020_Line_x0020_Items,
        priority: element.fields.Priority,
        quoteSource: element.fields.Quote_x0020_Source,
        status: element.fields.Status,
        submissionMethod: element.fields.Submission_x0020_Method,
        modified: element.fields.Modified,
        id: element.id,
      });
    });
    currentHistory.forEach((rfq) => {
      const calculatedHash = crypto
        .createHmac("sha256", graphClientSecret)
        .update(JSON.stringify(rfq))
        .digest("hex");
      // TODO: add in a function which removes anything over 10 entries
      if (!graphHistory.includes(calculatedHash)) {
        graphHistory.push(calculatedHash);
        if (!wrikeTitles.includes(rfq.title)) {
          // createTask(
          //   rfq.title,
          //   process.env.wrike_folder_rfq,
          //   process.env.wrike_perm_access_token,
          //   null,
          //   "Active",
          //   null,
          //   {
          //     due: rfq.internalDueDate.slice(0, rfq.internalDueDate.length - 2),
          //   },
          //   null,
          //   null,
          //   null,
          //   null,
          //   null,
          //   null,
          //   null
          // );
          console.log("is new", rfq);
          wrikeTitles.push(rfq.title);
        } else {
          // modify task
        }
      }
    });
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

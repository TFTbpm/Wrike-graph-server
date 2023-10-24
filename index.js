const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const { createTask, modifyTask } = require("./modules/wrike/task");
const graphAccessData = require("./modules/graph/accessToken");
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

// TODO: make a method to update these
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
    const accessData = await graphAccessData();
    let rfqData = await getRFQData(
      process.env.graph_site_id_sales,
      process.env.graph_list_id_rfq,
      accessData.access_token
    );
    // console.log("\n test \n", rfqData.value, "\n");
    // TODO: get custom statuses, get customers (CF), add reveiwer to custom field reviewer
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
    currentHistory.forEach((rfq) => {
      // console.log(rfq, "\n");
      const calculatedHash = crypto
        .createHmac("sha256", graphClientSecret)
        .update(JSON.stringify(rfq))
        .digest("hex");
      // TODO: add in a function which removes anything over 100 entries

      // CREATE RFQ ---------------------------
      if (!graphHistory.includes(calculatedHash)) {
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

        if (wrikeTitles.filter((r) => r.title == rfq.title).length < 1) {
          createTask(
            `(RFQ) ${rfq.title}`,
            process.env.wrike_folder_rfq,
            process.env.wrike_perm_access_token,
            descriptionStr,
            null,
            null,
            rfq.internalDueDate
              ? {
                  due: rfq.internalDueDate.slice(
                    0,
                    rfq.internalDueDate.length - 2
                  ),
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
            wrikeTitles.push({ title: rfq.title, id: data.data[0].id });
          });
          console.log("is new");

          // MODIFY RFQ --------------------------------------
        } else {
          // modify task
          const taskID = wrikeTitles.filter((t) => t.title === rfq.title)[0].id;
          modifyTask(
            taskID,
            process.env.wrike_folder_rfq,
            process.env.wrike_perm_access_token,
            descriptionStr,
            null,
            null,
            rfq.internalDueDate
              ? {
                  due: rfq.internalDueDate.slice(
                    0,
                    rfq.internalDueDate.length - 2
                  ),
                }
              : null,
            null,
            null,
            [rfq.assinged, rfq.reviewer],
            null,
            null,
            rfq.status,
            null
          );
          console.log("not new, but modified");
        }
      }
    });
    res.status(200).send("good");
  }
});

app.use("*", (req, res) => {
  res.status(400).send("Something went wrong");
});

app.listen(5501, () => {
  console.log("running server");
});

app.listen();

module.exports = app;

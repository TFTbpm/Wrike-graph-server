const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const wrikeRouting = require("./modules/wrike/wrikeRouting");
const rateLimit = require("express-rate-limit");
const getRFQData = require("./modules/graph/rfq");
config();

// This is hashed to verify the source
let rawRequestBody = "";
// This is used to verify we haven't already sent that info
let history = {
  wrike: null,
  graph_1: null,
  graph_2: null,
  graph_3: null,
  graph_4: null,
  graph_5: null,
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

app.post("/wrike", (req, res, next) => {
  rawRequestBody = "";
  req.on("data", (chunk) => {
    rawRequestBody += chunk;
  });
  next();
});

app.use(express.json());

app.post("/wrike", header("X-Hook-Secret").notEmpty(), (req, res, next) => {
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
      console.log(calculatedHash, xHookSecret);
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
          .digest("hex") == history.wrike
      ) {
        res.status(202).send("already updated");
        console.log("Already updated");
      } else {
        res.status(200).send("good");
        history.wrike = crypto
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

app.post("/graph", (req, res) => {
  const graphClientSecret = process.env.graph_api_secret;
  if (req.url.includes("validationToken=")) {
    // have to check for %3A with a regex and replace matches since decodeURI treats them as special char
    res
      .contentType("text/plain")
      .status(200)
      .send(
        decodeURI(req.url.replace(/%3A/g, ":").split("validationToken=")[1])
      );
  } else {
    console.log(req.body);
    const params = new URLSearchParams({
      client_id: process.env.graph_client_id,
      scope: "https://graph.microsoft.com/.default",
      client_secret: graphClientSecret,
      grant_type: "client_credentials",
    }).toString();
    // console.log(params);
    fetch(
      `https://login.microsoftonline.com/${process.env.graph_tenant_id}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    ).then((response) => {
      response.json().then((data) => {
        getRFQData(
          process.env.graph_site_id_sales,
          process.env.graph_list_id_rfq,
          data.access_token
        ).then((rfqData) => {
          console.log(rfqData);
        });
      });
    });
  }
  res.status(200).send("good");
  console.log(JSON.stringify(req.body));
});

app.use("*", (req, res) => {
  res.status(400).send("Something went wrong");
});

app.listen(5501, () => {
  console.log("running server");
});

app.listen();

module.exports = app;

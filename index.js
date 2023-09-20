const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
config();

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("up on /");
});

app.post("/wrike", header("X-Hook-Secret").notEmpty(), (req, res, next) => {
  const wrikeHookSecret = process.env.wrikeHookSecret;
  const errors = validationResult(req).errors;
  if (errors.length === 0) {
    const xHookSecret = req.get("X-Hook-Secret");
    const calculatedHash = crypto
      .createHmac("Sha256", wrikeHookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    res.set("X-Hook-Secret", calculatedHash).status(200).send();
    console.log(calculatedHash, xHookSecret, req.body, req.headers);
  } else {
    res.status(400).send("Incorrect Header");
  }
});

app.post("/graph", (req, res) => {
  const graphClientSecret = process.env.graphClientSecret;
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

// const client_id = process.env.VITE_client_id;
// const redirect_uri = process.env.VITE_redirect_uri;
// const graphScope = ["https://graph.microsoft.com/.default", "offline_access"];
// const wrikeScope = ["Default"];
// const salesSiteID = process.env.VITE_salesSiteID;
// const customerListID = process.env.VITE_customerListID;
// const rfqListID = process.env.VITE_rfqListID;
// const wrikeSalesSpaceID = process.env.VITE_wrikeSalesSpaceID;
// const tenantID = process.env.VITE_tenantID;
// const clientID = process.env.VITE_clientID;
// const graphRedirectURI = process.env.VITE_graphRedirectURI;

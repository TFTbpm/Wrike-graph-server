const express = require("express");
const { validationResult, header } = require("express-validator");
const { config } = require("dotenv");
const crypto = require("node:crypto");
const wrikeRouting = require("./modules/wrike/wrikeRouting");
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
        .update(JSON.stringify(req.body))
        .digest("hex");
      // console.log(calculatedHash, xHookSecret);
      console.log(req.body);
      wrikeRouting(req.body);
      res.status(200).send("good");
    }
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

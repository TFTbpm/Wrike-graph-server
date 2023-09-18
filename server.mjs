import express from "express";
import path from "path";
import cors from "cors";
const app = express();

app.use(cors("*"));

app.use(express.static(path.join("./", "public")));

app.use(initializeAuth());

app.listen(5501, () => {
  console.log("running server");
});

app.listen();

import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import app from "../index.js"; // Assume your Express app is exported from app.js
import { MongoClient } from "mongodb";
import crypto from "crypto";
import { config } from "dotenv";
config();

describe("POST /wrike/*", () => {
  it("should verify the webhook secret", (done) => {
    const wrikeHookSecret = "test-secret";
    process.env.wrike_hook_secret = wrikeHookSecret;

    const body = {
      requestType: "WebHook secret verification",
    };

    request(app)
      .post("/wrike/test")
      .set("X-Hook-Secret", "test-secret")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.header).to.have.property("x-hook-secret");
        done();
      });
  });

  it("should return 400 if X-Hook-Secret is missing", (done) => {
    const body = {
      requestType: "WebHook secret verification",
    };

    request(app)
      .post("/wrike/test")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
  });

  it("should return 401 for invalid hash", (done) => {
    const body = {
      some: "data",
    };

    request(app)
      .post("/wrike/test")
      .set("X-Hook-Secret", "wrong-secret")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.equal("Invalid hash");
        done();
      });
  });
});

describe("POST /wrike/rfq/assignee", () => {
  it("should modify RFQ and return 200", (done) => {
    const body = {
      some: "rfq data",
    };

    request(app)
      .post("/wrike/rfq/assignee")
      .set("X-Hook-Secret", process.env.wrike_hook_secret)
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });

  it("should return 202 if modification fails", (done) => {
    const body = {
      some: "rfq data",
    };

    sinon.stub(global, "modifyUserFromWrike").rejects(new Error("Failure"));

    request(app)
      .post("/wrike/rfq/assignee")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(202);
        global.modifyUserFromWrike.restore();
        done();
      });
  });
});

describe("POST /wrike/rfq/reviewer", () => {
  it("should modify reviewer data and return 202", (done) => {
    const body = {
      some: "rfq data",
    };

    request(app)
      .post("/wrike/rfq/reviewer")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(202);
        done();
      });
  });
});

describe("POST /wrike/order", () => {
  it("should handle completed order and return 202", (done) => {
    const body = [
      {
        status: "Completed",
        taskId: "12345",
      },
    ];

    request(app)
      .post("/wrike/order")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(202);
        done();
      });
  });
});

describe("POST /wrike/rfq/delete", () => {
  it("should delete RFQ and return 202", (done) => {
    const body = [
      {
        taskId: "12345",
      },
    ];

    request(app)
      .post("/wrike/rfq/delete")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(202);
        done();
      });
  });
});

describe("POST /wrike/rfq/status", () => {
  it("should update RFQ status and return 202", (done) => {
    const body = {
      taskId: "12345",
      newCustomStatusId: "status-abc",
    };

    request(app)
      .post("/wrike/rfq/status")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(202);
        done();
      });
  });
});

describe("POST /wrike/corporate_communication/completed", () => {
  it("should handle completed corporate communication and return 200", (done) => {
    const body = [
      {
        status: "Completed",
      },
    ];

    request(app)
      .post("/wrike/corporate_communication/completed")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});

describe("POST /wrike/digital_assets/completed", () => {
  it("should handle completed digital assets and return 200", (done) => {
    const body = [
      {
        status: "Completed",
      },
    ];

    request(app)
      .post("/wrike/digital_assets/completed")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});

describe("POST /wrike/online_networking/completed", () => {
  it("should handle completed online networking and return 200", (done) => {
    const body = [
      {
        status: "Completed",
      },
    ];

    request(app)
      .post("/wrike/online_networking/completed")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});

describe("POST /wrike/promotional_material/completed", () => {
  it("should handle completed promotional material and return 200", (done) => {
    const body = [
      {
        status: "Completed",
      },
    ];

    request(app)
      .post("/wrike/promotional_material/completed")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});

describe("POST /wrike/sales/completed", () => {
  it("should handle completed sales and return 200", (done) => {
    const body = [
      {
        status: "Completed",
      },
    ];

    request(app)
      .post("/wrike/sales/completed")
      .send(body)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});

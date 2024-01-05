const { MongoClient } = require("mongodb");
const { config } = require("dotenv");
config();

// TODO: add closing to wrike

async function mapWrikeUsersToGraphIDs() {
  let client;
  let users;
  let data;

  const wrikeURI = `https://www.wrike.com/api/v4`;
  const requestOptions = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.wrike_perm_access_token}`,
      "Content-Type": "application/json",
    },
  };
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(`there was an error connecting to user db: ${error}`);
  }
  // request all users from wrike
  try {
    let response = await fetch(`${wrikeURI}/contacts`, requestOptions);
    if (!response.ok) {
      throw new Error(`response error: ${await response.text()}`);
    }
    data = await response.json();
  } catch (error) {
    console.error(`there was an error fetching contacts from wrike: ${error}`);
  }

  if (!data) {
    return;
  }
  // add to arr
  data.data.forEach((contact) => {
    if (contact.type === "Person") {
      users.findOneAndUpdate(
        { name: `${contact.firstName} ${contact.lastName}` },
        { $set: { wrikeUser: contact.id } }
      );
    }
  });
}

async function syncWrikeToCollection(wrikeFolderID, collectionName) {
  // Get all the RFQs from Wrike
  const response = await fetch(
    `https://www.wrike.com/api/v4/folders/${wrikeFolderID}/tasks`,
    {
      headers: {
        Authorization: `Bearer ${process.env.wrike_perm_access_token}`,
      },
    }
  );
  if (!response.ok) {
    const errorMessage = await response.text();
    const err = `Failed to fetch tasks from Wrike: ${errorMessage}`;
    throw new Error(err);
  }
  const items = await response.json();

  // Connect to mongo
  let client;
  let mongo;
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    mongo = db.collection(collectionName);
  } catch (e) {
    const err = `there was an issue connecting to mongo while cleaning up: ${e}`;
    throw new Error(err);
  }

  // Get the mongo RFQs
  let mongoRfqDocs = mongo.find({});
  let mongoRemovalArray = [];
  let mongoArray = [];
  // iterate over the mongo RFQs, search for non matches from Wrike
  for await (let item of mongoRfqDocs) {
    // ? what about duplicates?
    mongoArray.push(item.id);
    let match = items.data.find((r) => r.id == item.id);
    if (!match) {
      // ! Remove these from mongo
      mongoRemovalArray.push(item.id);
    }
  }
  let wrikeRemovalArray = [];

  // iterate over the Wrike RFQs, search for non matches from MongoDB
  for (let item of items.data) {
    // ? What about duplicates?
    let match = mongoArray.find((r) => r === item.id);
    if (!match) {
      // ! Remove these from wrike
      wrikeRemovalArray.push(item.id);
    }
  }

  // Delete all the RFQs from mongo which are in the mongo removal array
  mongoRemovalArray.forEach(async (item) => {
    // console.log(rfq);
    const deleted = await mongo.deleteMany({ id: item });
    console.log(deleted);
  });

  wrikeRemovalArray.forEach(async (item) => {
    const response = await fetch(`https://www.wrike.com/api/v4/tasks/${item}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.wrike_perm_access_token}`,
      },
    });
    if (!response.ok) {
      const errorMessage = await response.text();
      const err = `Failed to fetch tasks from Wrike: ${errorMessage}`;
      throw new Error(err);
    }
    console.log(`deleted ${item} from wrike`);
  });
}

// returns the user object within the user collection
async function findAndAddWrikeUID(UID) {
  let client;
  let users;
  let data;

  const wrikeURI = `https://www.wrike.com/api/v4`;
  const requestOptions = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.wrike_perm_access_token}`,
      "Content-Type": "application/json",
    },
  };

  // connect to mongo
  try {
    client = new MongoClient(process.env.mongoURL);
    const db = client.db(process.env.mongoDB);
    users = db.collection(process.env.mongoUserColection);
  } catch (error) {
    console.error(`there was an error connecting to user db: ${error}`);
  }
  // search mongo for UID
  console.log(`uid: ${UID}`);
  let mongoUser = await users.findOne({ wrikeHookId: UID });

  if (mongoUser) {
    console.log("found user");
    return mongoUser;
  }

  try {
    // plug UID into wrike endpoint
    let response = await fetch(
      `${wrikeURI}/ids?ids=[${UID}]&type=ApiV2User`,
      requestOptions
    );
    if (!response.ok) {
      throw new Error(`response error: ${await response.text()}`);
    }
    data = await response.json();
    console.log(data);
  } catch (error) {
    console.error(`there was an error fetching the wrike ID: ${error}`);
  }

  if (!data || data.length == 0) {
    return;
  }

  // use returned id to map UID to user as wrikeHookId
  mongoUser = await users.findOneAndUpdate(
    { wrikeUser: data.data[0]?.id },
    { $set: { wrikeHookId: UID } }
  );

  return mongoUser;
}

module.exports = {
  syncWrikeToCollection,
  mapWrikeUsersToGraphIDs,
  findAndAddWrikeUID,
};

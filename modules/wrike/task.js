async function createTask(
  title,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  responsibles,
  metadata,
  customFields,
  customStatus,
  fields
) {
  try {
    if (title === undefined || folderId === undefined) {
      return;
    }

    // these need to be defined since Wrike doesnt take URI encoding for objects
    const stringArr = [
      "title",
      "description",
      "status",
      "importance",
      "customStatus",
    ];

    const params = {
      title: title || null,
      description: description || null,
      status: status || null,
      importance: importance || null,
      dates: dates || null, // obj
      shareds: shareds || null, //array
      parents: parents || null, // array
      responsibles: responsibles || null, // array
      metadata: metadata || null, // array
      customFields: customFields || null, // array
      customStatus: customStatus || null,
      fields: fields || null, // array
    };

    const queryParams = [];

    for (const key in params) {
      if (params[key] !== null) {
        if (stringArr.includes(key)) {
          // if its a string
          queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
        } else {
          // if its an object
          queryParams.push(`${key}=${JSON.stringify(params[key])}`);
        }
      }
    }

    const queryString = queryParams.join("&");

    const URL = `https://www.wrike.com/api/v4/folders/${folderId}/tasks?${queryString}`;
    console.log(URL);

    const response = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });
    // console.log(response);

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}, ${response.statusText}.`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`An error occurred while creating a task: ${error}`);
    throw error;
  }
}

async function modifyTask(
  taskId,
  folderId,
  access_token,
  description,
  status,
  importance,
  dates,
  shareds,
  parents,
  responsibles,
  metadata,
  customFields,
  customStatus,
  fields
) {
  try {
    if (taskId === undefined || folderId === undefined) {
      return;
    }
    const params = {
      description: description || null,
      status: status || null,
      importance: importance || null,
      dates: dates || null,
      shareds: shareds || null,
      parents: parents || null,
      responsibles: responsibles || null,
      metadata: metadata || null,
      customFields: customFields || null,
      customStatus: customStatus || null,
      fields: fields || null,
    };
    const queryParams = [];

    for (const key in params) {
      if (params[key] !== null) {
        if (stringArr.includes(key)) {
          // if its a string
          queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
        } else {
          // if its an object
          queryParams.push(`${key}=${JSON.stringify(params[key])}`);
        }
      }
    }

    const queryString = queryParams.join("&");

    const URL = `https://www.wrike.com/api/v4/tasks/${taskId}?${queryString}`;
    const response = await fetch(URL, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while modifying a task: ${error}`);
    throw error;
  }
}

async function deleteTask(taskId, access_token) {
  try {
    const response = await fetch(
      `https://www.wrike.com/api/v4/tasks/${taskId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while deleting a task: ${error}`);
    throw error;
  }
}

async function getTasks(taskId, access_token) {
  taskId = taskId || "";
  try {
    let url = "https://www.wrike.com/api/v4/tasks/";
    if (typeof taskId === "object") {
      let tasks = taskId.join("%2C%20");
      url += tasks;
    } else {
      url += taskId;
    }
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while getting a task: ${error}`);
    throw error;
  }
}

module.exports = { createTask, modifyTask, deleteTask, getTasks };

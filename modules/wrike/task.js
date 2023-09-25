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
    const obj = {
      title: title,
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
    for (let item in obj) {
      if (obj[item] === null) {
        delete obj[item];
      }
    }
    const params = new URLSearchParams(obj).toString();
    const URL = `https://www.wrike.com/api/v4/folders/${folderId}/tasks?${params}`;
    //   console.log(URL);
    const response = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    if (!response.ok) {
      console.log(response);
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    return await data;
  } catch (error) {
    console.error(`An error occured while creating a task: ${error}`);
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
    const obj = {
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
    for (let item in obj) {
      if (obj[item] === null) {
        delete obj[item];
      }
    }
    const params = new URLSearchParams(obj).toString();
    const URL = `https://www.wrike.com/api/v4/tasks/${taskId}?${params}`;
    //   console.log(URL);
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

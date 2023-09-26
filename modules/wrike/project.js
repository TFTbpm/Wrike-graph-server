async function createFolderFromBlueprint(
  blueprintName,
  parentId,
  title,
  access_token,
  titlePrefix,
  //   Format: yyyy-MM-dd
  rescheduleDate,
  //   Start or End, where start is that task starts from that date, end is where task ends on that date
  rescheduleMode
) {
  try {
    if (
      blueprintName === undefined ||
      parentId === undefined ||
      title === undefined
    ) {
      return;
    }
    const names = await getFolderBlueprintNames(access_token);
    const id = names[blueprintName];
    // console.log(id);
    const obj = {
      parent: parentId,
      title: title,
      titlePrefix: titlePrefix || null,
      rescheduleDate: rescheduleDate || null,
      rescheduleMode: rescheduleMode || null,
    };
    for (let item in obj) {
      if (obj[item] === null) {
        delete obj[item];
      }
    }
    const params = new URLSearchParams(obj).toString();
    const URL = `https://www.wrike.com/api/v4/folder_blueprints/${id}/launch_async?${params}`;
    console.log(URL);
    const response = await fetch(URL, {
      method: "POST",
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
    console.error(error);
    throw error;
  }
}

async function getFolderBlueprintNames(access_token) {
  try {
    let retObj = {};
    const response = await fetch(
      `https://www.wrike.com/api/v4/folder_blueprints`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    data.data.forEach((element) => {
      retObj[element.title] = element.id;
    });
    return retObj;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

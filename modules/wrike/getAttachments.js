async function getAttachments(taskID, accessToken) {
  const URL = `https://www.wrike.com/api/v4/tasks/${taskID}/attachments`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
  return await retry(3, async () => {
    try {
      const response = await fetch(URL, requestOptions);
      if (!response.ok) {
        throw new Error(
          `there was an error requesting URL (status code ${response.status}) ${response.statusText}\n ${URL}`
        );
      }
      const data = await response.json();
      // array of the data of the arrays from the id array
      const attachmentArr = await Promise.all(
        data.data.map(async (attachment) => {
          const buffer = await downloadAttachment(attachment.id, accessToken);
          return {
            name: attachment.name,
            data: buffer,
          };
        })
      );
      return attachmentArr;
    } catch (error) {
      throw new Error(`there was an error getting attachment: ${error}`);
    }
  });
}

async function downloadAttachment(attachmentId, accessToken) {
  const URL = `https://www.wrike.com/api/v4/attachments/${attachmentId}/download`;
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
  return await retry(3, async () => {
    try {
      const response = await fetch(URL, requestOptions);
      if (!response.ok) {
        throw new Error(
          `problem getting response from url (status code ${response.status}) ${response.statusText} \n ${URL}`
        );
      }
      let buffer = await response.arrayBuffer();
      buffer = Buffer.from(buffer);
      return buffer;
    } catch (error) {
      throw new Error(
        `there was an error downloading attachment buffer: ${error}`
      );
    }
  });
}

async function retry(retries, func) {
  let retryCount = 0;
  let lastError;
  while (retryCount < retries) {
    try {
      return await func();
    } catch (error) {
      lastError = error;
      console.error(
        `there was an error while getting attachments from Wrike: ${error} (retry ${retryCount})`
      );
      retryCount++;
      await new Promise((p) => {
        setTimeout(p, 1000);
      });
    }
  }
}

module.exports = getAttachments;

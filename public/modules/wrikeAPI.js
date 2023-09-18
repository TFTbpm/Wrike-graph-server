export async function getAuthCode(client_id, scope, redirect_uri) {
  scope = scope.join(" ");
  const authCodeURL = `https://login.wrike.com/oauth2/authorize/v4?response_type=code&client_id=${client_id}&scope=${scope}&redirect_uri=${redirect_uri}`;

  const code_1 = await new Promise((resolve, reject) => {
    const authWindow = window.open(
      authCodeURL,
      "_blank",
      "width=600, height=400, popup=true"
    );
    window.addEventListener("message", (e) => {
      if (e.origin === window.location.origin) {
        const code = e.data.split("code=")[1];
        if (code) {
          resolve(code);
        } else {
          reject(new Error("No access code received."));
        }
        authWindow.close();
      }
    });
    authWindow.onload = () => {
      try {
        authWindow.opener.postMessage(authWindow.location.href, "*");
        authWindow.close();
      } catch (error) {
        console.error("Error in authWindow.onload:", error);
      }
    };
  });
  return await getAccessToken(code_1, client_id, redirect_uri);
}

async function getAccessToken(code, client_id, redirect_uri) {
  const client_secret = import.meta.env.VITE_wrike_client_secret;
  const grant_type = "authorization_code";
  let tokenURL = `https://login.wrike.com/oauth2/token`;
  let bodyData = new URLSearchParams({
    client_id: client_id,
    client_secret: client_secret,
    grant_type: grant_type,
    code: code,
    redirect_uri: redirect_uri,
  });
  let response = await fetch(tokenURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyData,
  });
  let data = await response.json();
  return data;
}

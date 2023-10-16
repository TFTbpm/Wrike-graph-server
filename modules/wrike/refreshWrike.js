async function refreshWrike(id, secret, refreshToken, scope) {
  scope = scope.split("%2C%20") || "Default";
  try {
    let response = await fetch(
      `https://login.wrike.com/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=refresh_token&refresh_token=${refreshToken}&scope=${scope}`,
      { method: "POST" }
    );
    let data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  } catch (err) {
    console.error(err);
    return "Invalid request, see log for deatails";
  }
}

module.exports = { refreshWrike };

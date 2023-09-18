import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { InteractiveBrowserCredential } from "@azure/identity";

export function initializeAuth(tenantId, clientId, redirectUri, scope) {
  return new Promise((resolve, reject) => {
    const credential = new InteractiveBrowserCredential({
      tenantId: tenantId,
      clientId: clientId,
      redirectUri: redirectUri,
    });
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: scope,
    });
    const client = Client.initWithMiddleware({
      debugLogging: true,
      authProvider,
    });

    if (client.api("/me")) {
      resolve(client);
    } else {
      reject("failed :(");
    }
  });
}

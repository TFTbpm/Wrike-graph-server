---
description: Documenting the purpose behind endpoints and middleware in the server
---

# 💾 Server

**General Overview**

The index.js file uses [`express`](https://expressjs.com/),  [`crypto`](https://nodejs.org/api/crypto.html), [`mongodb`](https://www.mongodb.com/), and other modules to handle syncing data between Wrike and SharePoint.

## **Middleware**

* **Rate Limiting (**[**`limiter`**](https://www.npmjs.com/package/express-rate-limit)**)**: Prevents DDoS attacks by limiting the number of requests to the server.
* **Request Validation**: Validates incoming request headers using [`express-validator`](https://www.npmjs.com/package/express-validator).
* **Custom Middleware**&#x20;
  * **`addAPIIdToReq`**: Adds API ID to the request for specific routes, this is required because Wrike's webhooks (as of Jan 2024) use the V3 ID for users instead of V4. Every user has 2 different Wrike ID's, one for the webhooks, and one for everything else.

## **Security**

* **Hash Verification**: Utilizes [`crypto`](https://nodejs.org/api/crypto.html) to verify the integrity and origin of the data.
* **Environment Variables**: Stores sensitive information like API keys and database URLs in environment variables.
* **MongoDB Client**: Securely connects to MongoDB databases for CRUD operations.
* **Rate Limiting**: Protects against brute-force attacks.
* **Wrike secret:** Each webhook set up with a specific security key to verify the http request has come from Wrike. To verify this we capture the raw body data in /wrike/\* and store it, then we convert the body to JSON. Finally, we create a SHA256 HMAC using the security key and check that against the X-Hook-Secret header that was sent. If it matches then we know it came from Wrike.
* **Graph validation token:** Each subscription (same as a webhook) is set up with a validation token which is then checked, if it exists in the header, it probably came from graph (if it's https only!)

## **Routes**

### **GET `/` (Server Check)**:

* **Overview**: Confirms if the server is running.
* **Steps**: Responds with a simple message.
* **Error Handling**: Not applicable for this route.
* **Logging**: None.

### **POST `/wrike/*` (Wrike Webhook Verification)**:

* **Overview**: Verifies Wrike webhook requests.
* **Steps**:
  * Parses the raw request body.
  * Verifies the 'X-Hook-Secret' header.
* **Error Handling**: Logs and sends error response on failure.
* **Logging**: Errors in parsing or verification.

### **POST `/wrike/rfq/assignee` (Modify RFQ Assignee)**:

* **Overview**: Modifies the assignee for an RFQ from Wrike to SharePoint.
* **Steps**:
  * Connects to MongoDB.
  * Updates RFQ assignee data.
* **Error Handling**: Logs errors; sends 202 on success or failure.
* **Logging**: Modification success or failure.

### **POST `/wrike/rfq/reviewer` (RFQ Reviewer)**:

* **Overview**: Handles reviewer assignment for RFQs from Wrike to SharePoint.
* **Steps**:
  * Connects to MongoDB.
  * Modifies custom fields for RFQ.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: MongoDB connection and modification status.

### **POST `/wrike/order` (Handle Order)**:

* **Overview**: Processes order files from Wrike to SharePoint when their status is completed.
* **Steps**:
  * Retrieves order attachment.
  * Inserts or updates order data in MongoDB.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: Time taken for processing, errors in connecting to MongoDB.

### **POST `/wrike/datasheet/reviewer`(Datasheet Reviewer)**:

* **Overview**: Assigns datasheets from Wrike to SharePoint.
* **Steps**:
  * Connects to MongoDB.
  * Modifies datasheet data.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: MongoDB connection and modification status.

### **POST `/wrike/datasheet/assignee` (Datasheet Assignee)**:

* **Overview**: Assigns datasheets from Wrike to SharePoint.
* **Steps**:
  * Connects to MongoDB.
  * Modifies datasheet data.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: MongoDB connection and modification status.

### **POST `/wrike/rfq/delete` (Delete RFQ)**:

* **Overview**: Deletes RFQs from MongoDB when signal is received from Wrike.
* **Steps**:
  * Connects to MongoDB.
  * Deletes specific RFQs.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: Deletion status and errors.

### **POST `/wrike/order/delete` (Delete Order)**:

* **Overview**: Deletes orders from MongoDB when signal is recieved from Wrike.
* **Steps**:
  * Connects to MongoDB.
  * Deletes specific orders.
* **Error Handling**: Logs errors; sends 202 response.
* **Logging**: Deletion status and errors.

### **POST `/rfq/sync` (Sync RFQs)**:

* **Overview**: Syncs RFQs to a collection.
* **Steps**: Syncs RFQ data from Wrike to MongoDB.
* **Error Handling**: Logs errors; sends 200 response.
* **Logging**: Sync status and errors.

### **POST `/graph/*` (Microsoft Graph Validation)**:

* **Overview**: Validates requests from Microsoft Graph.
* **Steps**: Checks validation token and client state.
* **Error Handling**: Logs errors; sends appropriate response.
* **Logging**: Validation status.

### **POST `/graph/rfq` (Processing RFQs from Microsoft Graph)**:

* **Overview**: Processes Request for Quotations (RFQs) received from Microsoft Graph.
* **Steps**:
  * Connects to MongoDB to access RFQ and user collections.
  * Retrieves RFQ data from Microsoft Graph.
  * Maps and processes each RFQ item, including assigning reviewers and statuses.
* **Error Handling**: Logs errors during MongoDB connection, data retrieval, and processing.
* **Logging**: Errors in processing individual RFQ items, MongoDB connection issues.
* **Security Consideration**: Uses environment variables for sensitive data.

### **POST `/graph/datasheets` (Processing Datasheets from Microsoft Graph)**:

* **Overview**: Processes datasheets received from Microsoft Graph.
* **Steps**:
  * Connects to MongoDB for datasheet and user data.
  * Retrieves datasheet data from Microsoft Graph.
  * Processes each datasheet item, including mapping authors and guides.
* **Error Handling**: Logs errors in MongoDB connection and datasheet processing.
* **Logging**: Errors and issues during the datasheet processing.
* **Security Consideration**: Secure handling of MongoDB connections and data.

### **POST `/graph/order` (Processing Orders from Microsoft Graph)**:

* **Overview**: Handles order processing for new orders created in Microsoft Graph.
* **Steps**:
  * Connects to MongoDB for RFQ and user collections.
  * Retrieves order data from Microsoft Graph.
  * Processes each order, including generating hashes for file references.
  * Updates MongoDB with order details and file hashes.
* **Error Handling**: Logs errors during data fetching, processing, and MongoDB interactions.
* **Logging**: Errors in order processing and database interactions.
* **Security Consideration**: Utilizes crypto for hash generation, ensuring data integrity.

### **Fallback Route `*` (Handling Undefined Routes)**:

* **Overview**: Catches and responds to requests made to undefined routes.
* **Steps**: Returns a 400 status code with a generic error message.
* **Error Handling**: Not applicable as it's a generic catch-all route.
* **Logging**: None.
* **Security Consideration**: Prevents undefined route access.

## **Additional Notes**

* **Error Handling**: Most routes include try-catch blocks to handle exceptions, with error logging and appropriate HTTP response codes.
* **Logging**: Systematic logging is implemented, particularly for error scenarios, aiding in debugging and monitoring.
* **Security**: The application heavily relies on environment variables for sensitive data, ensuring that API keys, database URLs, and other critical information are not exposed in the code.

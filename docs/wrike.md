---
description: Explanation of the functions and processes for moving data from Wrike to Graph
---

# ✅ Wrike

## RFQ

### Assignee

1. The assignee is changed on the task
2. A webhook notification is sent to the [/wrike/rfq/assignee](server.md#post-wrike-rfq-assignee-modify-rfq-assignee) endpoint
3. The request body is sent to the function modifyGraphRFQ (/modules/graph/rfq.js) along with the object containing the Wrike and graph matching user IDs
4. The function connects to mongo
5. &#x20;It then iterates through each item in the body (Wrike sends the modified data)
   1. It searches the database for the given task id and saves it to variable “mongoEntry”
   2. It checks if the hook adds or removes a user
      1. Adds:
         1. Find the equivalent user within graph by using the object sent into the function arguments (object containing the Wrike and graph matching user IDs)
            1. If the user doesn’t have an equivalent the next item is iterated to
         2. The key associated with graph is searched for in Mongo
            1. If they don’t exist the next item is iterated to
         3. The data is sent to the power automate flow with resource, assignee, graph user id, type, and name (null) (line 70 rfq.js)
      2. Removes:
         1. Repeat steps 1 –3 but send REMOVE as type in request instead of ADD
      3. Unexpected:&#x20;
         1. Close the mongo client and return nothing

6\.       The results are returned and if successful status 200 is sent, if failed status 202 (received, because Wrike deactivates the hook if any request fails)

### Reviewer

1. The reviewer is changed in a task
2. A webhook notification is sent to [/wrike/rfq/reviewer](server.md#post-wrike-rfq-reviewer-rfq-reviewer)
3. The request is sent through to middleware [addAPIIdToReq](server.md#middleware) which converts the V3 ID to the V4 ID
4. The mongo RFQ and user collections are logged into and instantiated into collection objects
5. the request body is sent to modifyCustomFieldFromWrike()

### Delete

1. The task is deleted from Wrike
2. A webhook notification is sent to [/wrike/rfq/delete](server.md#post-wrike-rfq-delete-delete-rfq)
3. The RFQ collection is connected to
4. Each task in the webhook body is iterated through:
   1. All objects with the matching taskID in the collection are deleted
   2. The delete result is logged to the console
5. The client is closed

### Sync

1. An http request is sent to [/rfq/sync](server.md#post-rfq-sync-sync-rfqs)
2. syncWrikeToCollection() is sent with the Wrike rfq folder ID and the mongoRFQ collection name

## Datasheet

### Assignee

1. The assignee is changed in a task
2. A webhook notification is sent to [/wrike/datasheet/assignee](server.md#post-wrike-datasheet-assignee-datasheet-assignee)
3. The request is sent through to middleware [addAPIIdToReq](server.md#middleware) which converts the V3 ID to the V4 ID
4. The mongo Datasheet and user collections are logged into and instantiated into collection objects
5. The request body is sent to modifyUserFromWrike()

### Reviewer

1. The reviewer is changed in a task
2. A webhook notification is sent to [/wrike/datasheet/reviewer](server.md#post-wrike-datasheet-reviewer-datasheet-reviewer)
3. The request is sent through to middleware [addAPIIdToReq](server.md#middleware) which converts the V3 ID to the V4 ID
4. The mongo Datasheet and user collections are logged into and instantiated into collection objects
5. The request body is sent to modifyUserFromWrike()

## Order

### File send (status completion)

1. The task status is marked as completed
2. A webhook notification is sent to[ /wrike/order](server.md#post-wrike-order-handle-order)
3. The Wrike API is called to get the order attachment for the task ID (retrieved from webhook body)
4. A sha256 hexadecimal file hash of the attachment is created from the base64 buffer string of the file (one way encryption)
5. The mongo orders collection is connected to&#x20;
6. The collection is searched for the file hash
   1. If it doesn't exist it's added to the collection along with a taskID
7. The buffer string is sent along with the file name and power automate URI to addOrder()
8. The client is closed

### Order Delete

1. The task is deleted from Wrike
2. A webhook notification is sent to [/wrike/order/delete](server.md#post-wrike-order-delete-delete-order)
3. The mongo orders collection is connected to
4. Each task in the webhook body is iterated through:
   1. All objects with the matching taskID in the collection are deleted
   2. The delete result is logged to the console
5. The client is closed


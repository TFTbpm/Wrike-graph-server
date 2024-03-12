---
description: Describing the mongo collections and their usage
---

# 🗄️ Mongo

### Overview

The Wrike Mongodb database is hosted at [atlas](https://www.mongodb.com/atlas) at the Thin Film Technology organization (65494b34bbf97c05b405b636)

### Datasheet history

```json
{
  "_id": {
    "$oid": "654a44c800753d9b4b4fd267"
  },
  "title": "(DS) WRL2512L4 Series - 4 Terminal Current Sense Resistor Datasheet",
  "id": "IEAF5SOTKRFDCI4P",
  "graphID": "121"
}
```

* Contains all existing datasheets
* Fields:
  * title: title taken from the datasheet list in graph
  * id: id used to identify the associated item within Wrike
* &#x20;Usage
  * Determine whether a datasheet needs to be updated or modified in Wrike
  * Searches Wrike API for id field and if null creates a new one. If exists then it updates those parameters using the datasheet methods in [task.js](server.md)
  * Datasheets are added when a new one is added to the SharePoint list

### graphUsers

```json
[
  {
    "_id": {
      "$oid": "654ea674d60012a48f8c91b6"
    },
    "name": "Jordan Carlson",
    "graphId": "832",
    "wrikeUser": "KUAQ3CVX",
    "wrikeHookId": "\"Nd3YJzFlwGJT\""
  }
]
```

* Associates Wrike users to SharePoint users
* Fields:
  * name: name of the person, **manually entered** using graph API data
  * graphId: id of the individual as they are referenced within the SharePoint ecosystem
  * wrikeUser: Current user ID for usage in wrike
  * wrikeHookId: Old version of wrike user ID, this is used to reference users in webhooks
* Usage
  * Any task that needs to be assigned, reassinged, or created with a user on either service will use this
  * If it comes from a wrike webhook the databased is automatically searched for that wrikeHookId, if none are found it makes a query to another service which retrieves the associated wrikeUser and then searches again to match based on it

### order\_history

```json
{
  "_id": {
    "$oid": "655cec4aa52c97ad9011c3ce"
  },
  "id": "IEAF5SOTKRFMS37X",
  "content": "056c935e4dfa223cbf0827a8ff2b43fc768869d129c80d83ee56c07445bb1dd8"
}
```

* Keeps track of what orders have been sent to the customer POs SharePoint list
* Fields:
  * id: id of the Wrike task which made the entry
  * content: sha256 encrypted hash of the attached files hexadecimal data
  * graphID: the graph id associated with this order, if it comes from SharePoint it gets one, if its added to SharePoint it gets one
* Usage
  * When an order is added from graph or Wrike the data is added here, the service determines whether it gets an id or graphID

### wrike\_history

```json
{
  "_id": {
    "$oid": "65494eb46fd4993bac6320bc"
  },
  "title": "QUOTE LFTA-1030590-00-A | END CUSTOMER TESLA WK44",
  "id": "IEAF5SOTKRFCTXCH",
  "graphID": "3793"
}
```

* RFQ tracking
* Fields:
  * title: title from SharePoint
  * id: id for Wrike task
  * graphID: id for graph
* Usage:
  * Keeps track of what's been sent to wrike or SharePoint
  * When an RFQ is added to SharePoint the data is added here, when an RFQ is added to Wrike the id field is updated with the new ID

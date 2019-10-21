# import-submission-service
Microservice to import knowledge about a submission harvested from a published document.

# Installation
Add the following snippet to your `docker-compose.yml`:

```yml
import-submission:
  image: lblod/import-submission-service
  volumes:
    - ./data/files:/share
```

The volume mounted in `/share` must contain the cached downloads of the published documents.

Configure the delta-notification service to send notifications on the `/delta` endpoint when a file has been downloaded. Add the following snippet in the delta rules configuration of your project:

```javascript
export default [
  {
    match: {
      predicate: { type: "uri", value: "http://www.w3.org/ns/adms#status" },
      object: { type: "uri", value: "http://lblod.data.gift/file-download-statuses/success"
    },
    callback: {
      method: "POST",
      url: "http://import-submission/delta"
    },
    options: {
      resourceFormat: "v0.0.0-genesis",
      gracePeriod: 1000,
      ignoreFromSelf: true
    }
  }
]
```

# API
```
POST /delta
```
Triggers the import for a new downloaded document if it's related to an automatic submission task.

An import consists of 2 steps:
1. Import the triples harvested from the document in a separate import-graph.
2. Extract a submission from the data in the import-graph. This submission still needs to be validated.

# Model
TODO

# Configuration
TODO

# Known limitations
* The service expects exactly 1 remote file per submission. Knowledge cannot be spread across multiple files.

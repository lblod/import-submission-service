# import-submission-service
Microservice to import knowledge about a submission harvested from a published document.

## Installation
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

## API
```
POST /delta
```
Triggers the import for a new downloaded document if it's related to an automatic submission task.

The service is triggered by updates of resources of type `nfo:RemoteDataObject` of which the status is updated to `http://lblod.data.gift/file-download-statuses/success` if it is related to a `melding:AutomaticSubmissionTask` that has not been started yet.

An import consists of 2 steps:
1. Import the triples harvested from the document in an import-graph.
2. Extract a submission from the data in the import-graph. This submission is not validated yet.

## Model

### Automatic submission task
A resource describing the status and progress of the processing of an automatic submission. The model is specified in the [README of the automatic submission service](https://github.com/lblod/automatic-submission-service#model).

The services enriches the task with the following properties:

| Name       | Predicate        | Range            | Definition                                                                                                                          |
|------------|------------------|------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| importGraph     | `melding:importGraph`    | `rdfs:Resource`    | Graph in which the harvested triples are imported |


### Automatic submission task statuses
Once the import process starts, The status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/importing.

On successful completion, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/ready-for-validation.
On failure, the status is updated to http://lblod.data.gift/automatische-melding-statuses/failure.

## Related services
The following services are also involved in the automatic processing of a submission:
* [automatic-submission-service](https://github.com/lblod/automatic-submission-service)
* [download-url-service](https://github.com/lblod/download-url-service)

## Known limitations
* The service expects exactly 1 remote file per submission. Knowledge cannot be spread across multiple files.
* Currently data is extracted using hardcoded SPARQL queries. This must be done in a generic way based on the semantic forms in the database.

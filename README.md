# import-submission-service
Microservice that harvests knowledge about a submission from an annotated document and writes the resulting triples to a Turtle file.

## Installation
Add the following snippet to your `docker-compose.yml`:

```yml
import-submission:
  image: lblod/import-submission-service
  volumes:
    - ./data/files:/share
```

The volume mounted in `/share` must contain the cached downloads of the published documents. The resulting Turtle files will be written to the subfolder `./submissions`.

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
      resourceFormat: "v0.0.1",
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

An import consists of 3 steps:
1. Harvest the triples from the annotated document using [Marawa's context scanner](https://github.com/lblod/marawa)
2. Enrich the triples with known facts
  * Explicitly expand the SKOS tree of besluit type or besluit document type (e.g. 'Belastingsreglement' is also a 'Reglement en verordening')
  * Add the publication URL as a logical part of the submitted document (i.e. pre-fill the 'link' field in the form)
3. Write the triples to a Turtle file

The resulting triples are validated and converted to a submission for 'Loket voor Lokale Besturen' at a later stage in the automatic submission process by the [validate-submission-service](https://github.com/lblod/validate-submission-service).

## Model

### Automatic submission task
A resource describing the status and progress of the processing of an automatic submission.

#### Class
`melding:AutomaticSubmissionTask`

#### Properties
The model is specified in the [README of the automatic submission service](https://github.com/lblod/automatic-submission-service#model).

### Automatic submission task statuses
Once the import process starts, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/importing.

On successful completion, the status of the automatic submission task is updated to http://lblod.data.gift/automatische-melding-statuses/ready-for-enrichment.

On failure, the status is updated to http://lblod.data.gift/automatische-melding-statuses/failure.

### Annotated RDFa/HTML document
Local copy of the published submission in RDFa/HTML format as downloaded by the [download-url-service](https://github.com/lblod/download-url-service). This document is used as source to harvest triples from.

#### Class
`nfo:FileDataObject`

#### Properties
See data model of the [file service](https://github.com/mu-semtech/file-service#resources).

### Turtle file
#### Class
`nfo:FileDataObject`

#### Properties
| Name   | Predicate        | Range                | Definition                                                               |
|--------|------------------|----------------------|--------------------------------------------------------------------------|
| source | `nie:dataSource` | `nfo:FileDataObject` | RDFa/HTML document from which the content of this document is harvested  |

Additional properties are specified in the model of the [file service](https://github.com/mu-semtech/file-service#resources).

### Submitted resource
#### Class
`foaf:Document` (and `ext:SubmissionDocument`)

#### Properties
| Name   | Predicate     | Range                  | Definition                                                              |
|--------|---------------|------------------------|-------------------------------------------------------------------------|
| source | `dct:source`  | `nfo:FileDataObject`   | TTL document with harvested data from which the resource is constructed |
| link   | `dct:hasPart` | `nfo:RemoteDataObject` | Publication URL of the submission document                              |

For a full list of properties of a submitted resource, we refer to the [automatic submission documentation](https://lblod.github.io/pages-vendors/#/docs/submission-annotations).

## Related services
The following services are also involved in the automatic processing of a submission:
* [automatic-submission-service](https://github.com/lblod/automatic-submission-service)
* [download-url-service](https://github.com/lblod/download-url-service)
* [enrich-submission-service](https://github.com/lblod/enrich-submission-service)
* [validate-submission-service](https://github.com/lblod/validate-submission-service)

## Known limitations
* The service expects exactly 1 remote file per submission. Knowledge cannot be spread across multiple files.

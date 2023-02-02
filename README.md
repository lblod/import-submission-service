# import-submission-service

Microservice that harvests knowledge about a submission from an annotated
document and writes the resulting triples to a Turtle file.

## Getting started

### Add the service to a stack

Add the following snippet to your `docker-compose.yml`:

```yaml
import-submission:
  image: lblod/import-submission-service
  volumes:
    - ./data/files:/share
```

The volume mounted in `/share` must contain the cached downloads of the
published documents. The resulting Turtle files will be written to the
subfolder `./submissions`.

Configure the delta-notification service to send notifications on the `/delta`
endpoint when a file has been downloaded. Add the following snippet in the
delta rules configuration of your project:

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

## Reference

### API

```
POST /delta
```

Triggers the import for a new downloaded document if it's related to an
automatic submission task.

The service is triggered by updates of resources of type `nfo:RemoteDataObject`
of which the status is updated to
`http://lblod.data.gift/file-download-statuses/success` if it is related to a
`melding:AutomaticSubmissionTask` that has not been started yet.

An import consists of 3 steps:
1. Harvest the triples from the annotated document using
   [Marawa's context scanner](https://github.com/lblod/marawa)
2. Enrich the triples with known facts (see
   [submission-enricher.js](https://github.com/lblod/import-submission-service/blob/master/lib/submission-enricher.js))
  * Explicitly expand the SKOS tree of besluit type or besluit document type
    (e.g. 'Belastingsreglement' is also a 'Reglement en verordening')
  * Add the publication URL as a part of the submitted document (i.e. pre-fill
    the 'link' field in the form)
3. Write the triples to a Turtle file and associate it with the submitted
   document

The resulting triples are validated and converted to a submission for 'Loket
voor Lokale Besturen' at a later stage in the automatic submission process by
the
[enrich-submission-service](https://github.com/lblod/enrich-submission-service)
and
[validate-submission-service](https://github.com/lblod/validate-submission-service).

### Model

#### Automatic submission task

A resource describing the status and operation of the subtask of processing an
automatic submission job.

##### Class

`task:Task`

##### Properties

The model is specified in the [README of the
job-controller-service](https://github.com/lblod/job-controller-service#task).

#### Automatic submission task statuses

Once the enrichment process starts, the status of the automatic submission task
is updated to http://redpencil.data.gift/id/concept/JobStatus/busy.

On successful completion, the status of the automatic submission task is
updated to http://redpencil.data.gift/id/concept/JobStatus/success. The
resultsContainer is then linked to the inputContainer of the task, because no
file has been created or modified, only triples in the database.

On failure, the status is updated to
http://redpencil.data.gift/id/concept/JobStatus/failed. If possible, an error
is written to the database and the error is linked to this failed task.

#### Annotated RDFa/HTML document

Local copy of the published submission in RDFa/HTML format as downloaded by the
[download-url-service](https://github.com/lblod/download-url-service). This
document is used as source to harvest triples from.

##### Class

`nfo:FileDataObject`

##### Properties

| Name   | Predicate        | Range                  | Definition                                               |
|--------|------------------|------------------------|----------------------------------------------------------|
| source | `nie:dataSource` | `nfo:RemoteDataObject` | Remote document from which this resource is a local copy |

Additional properties are specified in the model of the
[file service](https://github.com/mu-semtech/file-service#resources).

#### Turtle file

TTL file containing the triples harvested from the published RDFa/HTML file
used as a basis to fill in the form.

##### Class

`nfo:FileDataObject`

##### Properties

| Name   | Predicate        | Range                | Definition                                                               |
|--------|------------------|----------------------|--------------------------------------------------------------------------|
| source | `nie:dataSource` | `nfo:FileDataObject` | RDFa/HTML document from which the content of this document is harvested  |

Additional properties are specified in the model of the
[file service](https://github.com/mu-semtech/file-service#resources).

#### Submitted document

##### Class

`foaf:Document` (and `ext:SubmissionDocument`)

##### Properties

| Name   | Predicate     | Range                  | Definition                                                              |
|--------|---------------|------------------------|-------------------------------------------------------------------------|
| source | `dct:source`  | `nfo:FileDataObject`   | TTL document with harvested data from which the resource is constructed |
| link   | `dct:hasPart` | `nfo:RemoteDataObject` | Publication URL of the submission document                              |

For a full list of properties of a submitted resource, we refer to the
[automatic submission documentation](https://lblod.github.io/pages-vendors/#/docs/submission-annotations).

## Related services

The following services are also involved in the automatic processing of a submission:

* [automatic-submission-service](https://github.com/lblod/automatic-submission-service)
* [download-url-service](https://github.com/lblod/download-url-service)
* [enrich-submission-service](https://github.com/lblod/enrich-submission-service)
* [validate-submission-service](https://github.com/lblod/validate-submission-service)
* [toezicht-flattened-form-data-generator](https://github.com/lblod/toezicht-flattened-form-data-generator)

## Known limitations

* The service expects exactly 1 remote file per submission. Knowledge cannot be
  spread across multiple files.

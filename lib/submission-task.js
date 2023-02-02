import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeDateTime,
  sparqlEscapeUri,
  sparqlEscapeString,
  uuid,
} from 'mu';
import * as env from '../constants.js';

/**
 * Updates the state of the given task to the specified status
 *
 * @param string taskUri URI of the task
 * @param string status URI of the new status
 */
export async function updateTaskStatus(
  taskUri,
  status,
  errorUri,
  importedFileUris
) {
  const taskUriSparql = sparqlEscapeUri(taskUri);
  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());
  const hasError = errorUri && status === env.TASK_FAILURE_STATUS;

  let resultContainerTriples;
  let resultContainerUuid;
  let containerparts;
  if (importedFileUris) {
    resultContainerUuid = uuid();
    const fileparts = importedFileUris
      .map((uri) => `task:hasFile ${sparqlEscapeUri(uri)} ;`)
      .join('\n');
    resultContainerTriples = `
      asj:${resultContainerUuid}
        a nfo:DataContainer ;
        ${fileparts}
        mu:uuid ${sparqlEscapeString(resultContainerUuid)} .
    `;
    containerparts = resultContainerUuid
      ? `task:resultsContainer asj:${resultContainerUuid} ;`
      : '';
  }

  const statusUpdateQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ${sparqlEscapeUri(status)} ;
          ${hasError ? `task:error ${sparqlEscapeUri(errorUri)} ;` : ''}
          ${containerparts}
          dct:modified ${nowSparql} .

        ${resultContainerTriples}
      }
    }
    WHERE {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await update(statusUpdateQuery);
}

/**
 * Returns the inserted succesfully downloaded remote file URI. An empty array
 * if there are none.
 *
 * @param Object delta Message as received from the delta notifier
 */
export async function getRemoteDataObjectUris(taskUri) {
  const fileUriQuery = `
    ${env.PREFIXES}
    SELECT ?fileUri WHERE {
      ${sparqlEscapeUri(taskUri)} task:inputContainer ?inputContainer .
      ?inputContainer task:hasFile ?fileUri .
    }
  `;
  const response = await query(fileUriQuery);
  const results = response.results?.bindings || [];
  return results.map((res) => res.fileUri.value);
}

/**
 * Returns the task and submission URIs of the automatic submission task
 * related to the given remote data objects. Returns an empty array if no task
 * is associated with the files.
 *
 * @param Array remoteFileUris URIs of the remote file objects
 */
export async function getSubmissionInfo(remoteDataObject) {
  const remoteDataObjectSparql = sparqlEscapeUri(remoteDataObject);
  const infoQuery = `
    ${env.PREFIXES}
    SELECT ?submission ?documentUrl ?fileUri ?submittedDocument
    WHERE {
      GRAPH ?g {
        ?fileUri nie:dataSource ${remoteDataObjectSparql} .
        ?submission
          nie:hasPart ${remoteDataObjectSparql} ;
          prov:atLocation ?documentUrl ;
          dct:subject ?submittedDocument .
      }
    }
  `;

  const response = await query(infoQuery);
  let results = response.results.bindings;
  if (results.length > 0) results = results[0];
  else
    throw new Error(
      `Could not find the information about the submission for file ${remoteDataObject}`
    );
  return {
    submission: results.submission.value,
    documentUrl: results.documentUrl.value,
    submittedDocument: results.submittedDocument.value,
    fileUri: results.fileUri.value,
  };
}

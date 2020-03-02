import { sparqlEscapeUri } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';

const TASK_NOT_STARTED_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/not-started';
const TASK_ONGOING_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/importing';
const TASK_SUCCESS_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/ready-for-enrichment';
const TASK_FAILURE_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/failure';


/**
 * Updates the state of the given task to the specified status
 *
 * @param string taskUri URI of the task
 * @param string status URI of the new status
*/
async function updateTaskStatus(taskUri, status) {
  const q = `
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>

    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} adms:status ?status .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} adms:status ?status .
      }
    }

    ;

    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} adms:status ${sparqlEscapeUri(status)} .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} a melding:AutomaticSubmissionTask .
      }
    }

  `;

  await update(q);
}

/**
 * Returns the task and submission URIs of the automatic submission task related to the given remote data objects.
 * Returns an empty array if no task is associated with the files.
 *
 * @param Array remoteFileUris URIs of the remote file objects
*/
async function getTasks(remoteFileUris) {
  const remoteDataObjectValues = `
    VALUES ?remoteDataObject {
      ${remoteFileUris.map(sparqlEscapeUri).join('\n')}
    }
  `;

  const q = `
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT ?submission ?task ?remoteDataObject ?submittedDocument
    WHERE {
      GRAPH ?g {
        ?submission nie:hasPart ?remoteDataObject .
        ${remoteDataObjectValues}
        ?task prov:generated ?submission ;
           a melding:AutomaticSubmissionTask ;
           adms:status ${sparqlEscapeUri(TASK_NOT_STARTED_STATUS)} .
        ?submission dct:subject ?submittedDocument .
      }
    }
  `;

  const result = await query(q);
  return result.results.bindings.map(binding => {
    return {
      task: binding['task'].value,
      submission: binding['submission'].value,
      submittedDocument: binding['submittedDocument'].value,
      remoteFile: binding['remoteDataObject'].value
    };
  });
}

export {
  TASK_NOT_STARTED_STATUS,
  TASK_ONGOING_STATUS,
  TASK_SUCCESS_STATUS,
  TASK_FAILURE_STATUS,
  getTasks,
  updateTaskStatus
}

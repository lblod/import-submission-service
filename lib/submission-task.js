import { sparqlEscapeUri } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import predicates from '../harvest-config.js';

const TASK_NOT_STARTED_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/not-started';
const TASK_ONGOING_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/importing';
const TASK_SUCCESS_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/ready-for-validation';
const TASK_FAILURE_STATUS = 'http://lblod.data.gift/automatische-melding-statuses/failure';

/**
 * Enrich the given submission with the harvested data from the given graph
 *
 * @param string submission URI of the submission to link the harvested data to
 * @param string importGraph URI of the graph to get the harvested data from
*/
async function enrichSubmission(submission, importGraph) {
  const { document, graph } = await getSubmittedDocument(submission);

  const jobs = [
    { subject: document, predicates: predicates }
  ];

  // TODO construct data based on data from import graph in a more generic way
  // based on the semantic forms stored in the backend

  for (let job of jobs) {
    for (let p of predicates) {
      const q = `
        INSERT {
          GRAPH <${graph}> {
            ${sparqlEscapeUri(job.subject)} ${sparqlEscapeUri(p)} ?o .
          }
        } WHERE {
          GRAPH <${importGraph}> {
            ${sparqlEscapeUri(job.subject)} ${sparqlEscapeUri(p)} ?o .
          }
        }
      `;
      // TODO also get nested resources
      await update(q);
    }
  }
}

async function getSubmittedDocument(submission) {
  const q = `
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT ?graph ?document
    WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(submission)} dct:subject ?document .
      }
    } LIMIT 1
  `;

  // TODO what to do if submittedResource URI is not provided by vendor
  // Which subject is used in the HTML document then?

  const result = await query(q);
  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return {
      document: binding['document'].value,
      graph: binding['graph'].value
    };
  } else {
    return {};
  }
}


/**
 * Updates the state of the given task to the specified status
 *
 * @param string taskUri URI of the task
 * @param string status URI of the new status
*/
async function updateTaskStatus(taskUri, status, importGraph = undefined) {
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

  if (importGraph) {
    const importGraphQ = `
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>

    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} melding:importGraph ${sparqlEscapeUri(importGraph)} .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} a melding:AutomaticSubmissionTask .
      }
    }

  `;

    await update(importGraphQ);
  }
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

    SELECT ?submission ?task ?remoteDataObject
    WHERE {
      GRAPH ?g {
        ?submission nie:hasPart ?remoteDataObject .
        ${remoteDataObjectValues}
        ?task prov:generated ?submission ;
           a melding:AutomaticSubmissionTask ;
           adms:status ${sparqlEscapeUri(TASK_NOT_STARTED_STATUS)} .
      }
    }
  `;

  const result = await query(q);
  return result.results.bindings.map( binding => {
    return {
      task: binding['task'].value,
      submission: binding['submission'].value,
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
  updateTaskStatus,
  enrichSubmission
}

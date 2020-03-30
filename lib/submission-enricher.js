import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import Triple from './triple';

/**
 * Enrich the harvested triples dataset with derived knowledge
 * based on the current harvested triples and the data in the triplestore.
*/
export default async function enrich(submission, submittedDocument, remoteFile, triples) {
  let enrichments = [];

  const submissionUrlField = await addSubmissionUrl(submittedDocument, remoteFile, triples);
  console.log(`Enrich submission with ${submissionUrlField.length} triples by adding the URL field.`);
  enrichments = enrichments.concat(submissionUrlField);

  return enrichments;
}

/**
 * Enrich the harvested data with the submitted publication URL
 * such that the URL field in the form is automatically filled in.
 *
 * Note: the remoteFile is already persisted in the store by the automatic-submission service.
 *       We just need to enrich the harvested triples dataset that will be written to a TTL file.
*/
async function addSubmissionUrl(submittedDocument, remoteFile, triples) {
  let enrichments = [];

  const result = await query(`
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?harvestedHtmlFile ?url WHERE {
      GRAPH ?g {
        ?harvestedHtmlFile nie:dataSource ${sparqlEscapeUri(remoteFile)} .
        ${sparqlEscapeUri(remoteFile)} nie:url ?url .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const harvestedFile = result.results.bindings[0]['harvestedHtmlFile'].value;
    const url = result.results.bindings[0]['url'].value;
    enrichments = [
      new Triple({
        subject: submittedDocument,
        predicate: 'http://purl.org/dc/terms/hasPart',
        object: remoteFile,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }),
      new Triple({
        subject: remoteFile,
        predicate: 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url',
        object: url
      }),
      new Triple({
        subject: remoteFile,
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#RemoteDataObject',
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }),
      new Triple({
        subject: harvestedFile,
        predicate: 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#dataSource',
        object: remoteFile,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      })
    ];
  }

  return enrichments;
}

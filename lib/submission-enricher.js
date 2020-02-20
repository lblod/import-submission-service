import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import uniq from 'lodash.uniq';
import Triple from './triple';

/**
 * Enrich the harvested triples dataset with derived knowledge
 * based on the current harvested triples and the data in the triplestore.
*/
export default async function enrich(submission, submittedDocument, remoteFile, triples) {
  let enrichments = [];

  if (triples && triples.length) {
    const expandedSkos = await expandSkosTree(triples);
    console.log(`Enrich submission with ${expandedSkos.length} triples by expanding SKOS tree.`);
    enrichments = enrichments.concat(expandedSkos);
  }

  const submissionUrlField = await addSubmissionUrl(submittedDocument, remoteFile, triples);
  console.log(`Enrich submission with ${submissionUrlField.length} triples by adding the URL field.`);
  enrichments = enrichments.concat(submissionUrlField);

  return enrichments;
}

/**
 * Enrich the harvested data with the broader document types
 * by explicitly adding each broader type as a triple to the harvested triples dataset.
 *
 * E.g. a 'Belastingsreglement' is also a 'Reglement and verordening'
*/
async function expandSkosTree(triples) {
  let enrichments = [];

  const typeTriples = triples.filter(t => t.predicate == 'a');

  if (typeTriples.length) {
    const result = await query(`
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT DISTINCT ?type ?parent WHERE {
      ?type a skos:Concept, rdfs:Class ;
            skos:broader+ ?parent .
      ?parent a rdfs:Class .

      VALUES ?type {
        ${typeTriples.map(t => sparqlEscapeUri(t.object)).join('\n')}
      }
    }`);

    result.results.bindings.forEach(binding => {
      const expandedTypes = typeTriples.filter(t => t.object == binding['type'].value).map(triple => {
        return new Triple({
          subject: triple.subject,
          predicate: 'a',
          object: binding['parent'].value,
          datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
        });
      });
      enrichments = enrichments.concat(expandedTypes);
    });
  }

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

    SELECT ?harvestedHtmlFile WHERE {
      GRAPH ?g {
        ?harvestedHtmlFile nie:dataSource ${sparqlEscapeUri(remoteFile)} .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const harvestedFile = result.results.bindings[0]['harvestedHtmlFile'].value;
    enrichments = [
      new Triple({
        subject: submittedDocument,
        predicate: 'http://purl.org/dc/terms/hasPart',
        object: remoteFile,
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
